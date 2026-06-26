/**
 * أدوات المساعد الذكي (Assistant Tools) — المهمة 12.1.
 *
 * تعرّف هذه الوحدة "الأدوات" التي يستدعيها المساعد الذكي، وتربط كل أداة بخدمة الأعمال
 * المقابلة في طبقة الخدمات (مبدأ "مصدر واحد للحقيقة"): لا تنفّذ الأداة منطقاً مالياً خاصاً
 * بها، بل تستدعي الخدمة نفسها التي تستخدمها واجهة المستخدم وطبقة الـ API.
 *
 * كل أداة تُصرِّح عن:
 *  - `requiredPermission`: الصلاحية اللازمة لتنفيذها (تُفرَض عبر `authorize`).
 *  - `hasFinancialEffect`: علامة الأثر المالي؛ الأدوات ذات الأثر المالي تتطلّب تأكيداً
 *    صريحاً قبل التنفيذ (المتطلب 11.4) وتُقصَر على الأدوار المصرّح لها (المتطلبان 10.5, 11.6).
 *  - `fields`: الحقول المطلوبة لاحتساب النقص وطلبه بالعربية (المتطلب 11.5).
 *
 * المتطلبات: 10.5 (قصر النتائج على المصرّح به)، 11.6 (منع العمليات غير المصرّح بها).
 */
import { InvoiceStatus, LineItemKind, Prisma } from "@prisma/client";

import { authorize, UNAUTHORIZED_MESSAGE } from "@/lib/auth/permissions";
import type { Permission, Session } from "@/lib/auth/types";
import { prisma } from "@/lib/db/client";
import { Decimal, ZERO, toDecimal } from "@/lib/db/decimal";
import { formatCurrency } from "@/lib/constants";

import { BillingService, type LineItemInput } from "@/lib/services/billingService";
import { CustomerService } from "@/lib/services/customerService";
import { ExpenseService } from "@/lib/services/expenseService";
import { ReportService } from "@/lib/services/reportService";

/** أسماء الأدوات المتاحة للمساعد الذكي. */
export type ToolName =
  | "get_customer_balance"
  | "get_sales"
  | "list_unpaid_invoices"
  | "create_invoice"
  | "create_customer"
  | "record_expense";

/** وسائط الأداة كما يستخرجها مُحلّل النية (قيم نصّية/رقمية/تواريخ). */
export type ToolArgs = Record<string, unknown>;

/** وصف حقل تستخدمه الأداة لاحتساب النقص وطلبه بالعربية (المتطلب 11.5). */
export interface ToolField {
  /** المفتاح في كائن الوسائط. */
  key: string;
  /** التسمية العربية المعروضة للمستخدم عند طلب الحقل الناقص. */
  labelAr: string;
}

/** نتيجة تنفيذ أداة: نجاح برسالة عربية وبيانات اختيارية، أو فشل برسالة عربية. */
export type ToolExecutionResult =
  | { ok: true; message: string; data?: unknown }
  | { ok: false; message: string; fields?: string[] };

/** عقد الأداة: بيانات وصفية + احتساب النقص + ملخّص عربي + تنفيذ عبر الخدمات. */
export interface AssistantTool {
  name: ToolName;
  /** وصف عربي موجز لغرض الأداة. */
  descriptionAr: string;
  /** الصلاحية اللازمة لتنفيذ الأداة. */
  requiredPermission: Permission;
  /** علامة الأثر المالي: العمليات المالية تتطلّب تأكيداً صريحاً قبل التنفيذ (المتطلب 11.4). */
  hasFinancialEffect: boolean;
  /** الحقول المطلوبة لتنفيذ الأداة. */
  fields: ToolField[];
  /** يُعيد تسميات الحقول الناقصة (بالعربية) اعتماداً على الوسائط المتاحة (المتطلب 11.5). */
  missingFields(args: ToolArgs): string[];
  /** يُنتج ملخّصاً عربياً للعملية يُعرض قبل طلب التأكيد للعمليات المالية (المتطلب 11.4). */
  summarize(args: ToolArgs): string;
  /** ينفّذ الأداة عبر خدمة الأعمال المقابلة بعد التأكّد من الصلاحية. */
  execute(session: Session, args: ToolArgs): Promise<ToolExecutionResult>;
}

/* ------------------------------------------------------------------ */
/* مساعدات داخلية                                                      */
/* ------------------------------------------------------------------ */

/** يحوّل قيمة وسيط إلى نص منسّق (مع إزالة الفراغات الزائدة). */
function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** يحوّل قيمة وسيط إلى Decimal آمن، أو null إذا تعذّر. */
function asDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const d = toDecimal(value as Prisma.Decimal.Value);
    return d.isNaN() ? null : d;
  } catch {
    return null;
  }
}

/** يحوّل قيمة وسيط إلى تاريخ صالح، أو null. */
function asDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** ينسّق Decimal مالي للعرض مقترناً بوحدة العملة (المتطلب 12.4). */
function money(value: Prisma.Decimal.Value): string {
  return formatCurrency(toDecimal(value).toNumber());
}

/** رسالة موحّدة عند عدم العثور على عميل بالاسم المُعطى. */
const CUSTOMER_NOT_FOUND_BY_NAME = "لم أعثر على عميل بهذا الاسم، يرجى التحقق من الاسم.";

/**
 * يحلّ هوية العميل من الوسائط: يستخدم `customerId` إن وُجد، وإلا يبحث بالاسم.
 * يعيد نتيجة مُمَيَّزة: عميل واحد، أو لا يوجد، أو تعدّد (مع أسماء للاختيار).
 */
async function resolveCustomer(args: ToolArgs): Promise<
  | { kind: "one"; id: string; name: string }
  | { kind: "none" }
  | { kind: "many"; names: string[] }
> {
  const id = asText(args.customerId);
  if (id) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    return customer ? { kind: "one", id: customer.id, name: customer.name } : { kind: "none" };
  }

  const name = asText(args.customerName);
  if (!name) return { kind: "none" };

  const matches = await CustomerService.searchCustomers(name);
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "one", id: matches[0].id, name: matches[0].name };
  return { kind: "many", names: matches.slice(0, 5).map((c) => c.name) };
}

/* ------------------------------------------------------------------ */
/* تعريف الأدوات                                                       */
/* ------------------------------------------------------------------ */

/** أداة الاستعلام عن رصيد عميل (المتطلب 10.1). */
const getCustomerBalance: AssistantTool = {
  name: "get_customer_balance",
  descriptionAr: "الاستعلام عن الرصيد الحالي لعميل محدد بالاسم.",
  requiredPermission: "customers:read",
  hasFinancialEffect: false,
  fields: [{ key: "customerName", labelAr: "اسم العميل" }],
  missingFields(args) {
    return asText(args.customerName) || asText(args.customerId) ? [] : ["اسم العميل"];
  },
  summarize(args) {
    return `الاستعلام عن رصيد العميل: ${asText(args.customerName) || asText(args.customerId)}`;
  },
  async execute(_session, args) {
    const resolved = await resolveCustomer(args);
    if (resolved.kind === "none") {
      return { ok: false, message: CUSTOMER_NOT_FOUND_BY_NAME };
    }
    if (resolved.kind === "many") {
      return {
        ok: false,
        message: `يوجد أكثر من عميل بهذا الاسم: ${resolved.names.join("، ")}. يرجى تحديد الاسم بدقة.`,
      };
    }

    const profile = await CustomerService.getCustomer(resolved.id);
    return {
      ok: true,
      message: `رصيد العميل ${resolved.name} هو ${money(profile.balance)}.`,
      data: { customerId: resolved.id, name: resolved.name, balance: profile.balance.toString() },
    };
  },
};

/** أداة الاستعلام عن مبيعات فترة محددة (المتطلب 10.2). */
const getSales: AssistantTool = {
  name: "get_sales",
  descriptionAr: "عرض إجمالي المبيعات وعدد الفواتير ضمن فترة زمنية.",
  requiredPermission: "reports:read",
  hasFinancialEffect: false,
  fields: [
    { key: "from", labelAr: "تاريخ بداية الفترة" },
    { key: "to", labelAr: "تاريخ نهاية الفترة" },
  ],
  missingFields(args) {
    const missing: string[] = [];
    if (!asDate(args.from)) missing.push("تاريخ بداية الفترة");
    if (!asDate(args.to)) missing.push("تاريخ نهاية الفترة");
    return missing;
  },
  summarize(args) {
    const label = asText(args.periodLabel) || "الفترة المحددة";
    return `الاستعلام عن مبيعات ${label}`;
  },
  async execute(_session, args) {
    const from = asDate(args.from);
    const to = asDate(args.to);
    if (!from || !to) {
      return { ok: false, message: "يرجى تحديد فترة زمنية صحيحة للاستعلام عن المبيعات." };
    }

    const report = await ReportService.salesReport({ from, to });
    if (ReportService.isReportError(report)) {
      return { ok: false, message: report.message };
    }

    const label = asText(args.periodLabel) || "الفترة المحددة";
    return {
      ok: true,
      message: `إجمالي المبيعات خلال ${label} هو ${money(report.totalSales)} عبر ${report.invoiceCount} فاتورة.`,
      data: {
        totalSales: report.totalSales.toString(),
        invoiceCount: report.invoiceCount,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    };
  },
};

/** أداة عرض الفواتير غير المدفوعة وإجمالي المستحق (المتطلب 10.3). */
const listUnpaidInvoices: AssistantTool = {
  name: "list_unpaid_invoices",
  descriptionAr: "عرض قائمة الفواتير غير المدفوعة (أو المدفوعة جزئياً) وإجمالي المبالغ المستحقة.",
  requiredPermission: "billing:read",
  hasFinancialEffect: false,
  fields: [],
  missingFields() {
    return [];
  },
  summarize() {
    return "الاستعلام عن الفواتير غير المدفوعة";
  },
  async execute(_session, _args) {
    const invoices = await prisma.invoice.findMany({
      where: { status: { in: [InvoiceStatus.UNPAID, InvoiceStatus.PARTIALLY_PAID] } },
      orderBy: { issueDate: "asc" },
      include: { customer: true },
    });

    const totalDue = invoices.reduce<Prisma.Decimal>(
      (sum, inv) => sum.plus(new Decimal(inv.remainingAmount)),
      ZERO,
    );

    if (invoices.length === 0) {
      return { ok: true, message: "لا توجد فواتير غير مدفوعة حالياً.", data: { invoices: [], totalDue: "0" } };
    }

    const lines = invoices
      .map((inv) => `• ${inv.number} — ${inv.customer.name}: متبقٍّ ${money(inv.remainingAmount)}`)
      .join("\n");

    return {
      ok: true,
      message: `يوجد ${invoices.length} فاتورة غير مدفوعة، بإجمالي مستحق ${money(totalDue)}:\n${lines}`,
      data: {
        totalDue: totalDue.toString(),
        invoices: invoices.map((inv) => ({
          number: inv.number,
          customer: inv.customer.name,
          remaining: inv.remainingAmount.toString(),
          status: inv.status,
        })),
      },
    };
  },
};

/** أداة إنشاء فاتورة عبر المحادثة (المتطلب 11.1) — ذات أثر مالي. */
const createInvoice: AssistantTool = {
  name: "create_invoice",
  descriptionAr: "إنشاء فاتورة لعميل بقيمة أو ببنود محددة.",
  requiredPermission: "billing:write",
  hasFinancialEffect: true,
  fields: [
    { key: "customerName", labelAr: "اسم العميل" },
    { key: "amount", labelAr: "قيمة الفاتورة أو بنودها" },
  ],
  missingFields(args) {
    const missing: string[] = [];
    if (!asText(args.customerName) && !asText(args.customerId)) missing.push("اسم العميل");
    const hasItems = Array.isArray(args.items) && (args.items as unknown[]).length > 0;
    if (!asDecimal(args.amount) && !hasItems) missing.push("قيمة الفاتورة أو بنودها");
    return missing;
  },
  summarize(args) {
    const customer = asText(args.customerName) || asText(args.customerId);
    const amount = asDecimal(args.amount);
    const value = amount ? money(amount) : "بنود محددة";
    return `إنشاء فاتورة للعميل "${customer}" بقيمة ${value}.`;
  },
  async execute(_session, args) {
    const resolved = await resolveCustomer(args);
    if (resolved.kind === "none") {
      return { ok: false, message: CUSTOMER_NOT_FOUND_BY_NAME };
    }
    if (resolved.kind === "many") {
      return {
        ok: false,
        message: `يوجد أكثر من عميل بهذا الاسم: ${resolved.names.join("، ")}. يرجى تحديد الاسم بدقة.`,
      };
    }

    // البنود: تُستخدم البنود المُمرَّرة إن وُجدت، وإلا يُبنى بند واحد بالقطعة من القيمة المطلوبة.
    let items = Array.isArray(args.items) ? (args.items as LineItemInput[]) : [];
    if (items.length === 0) {
      const amount = asDecimal(args.amount);
      if (!amount || !amount.greaterThan(ZERO)) {
        return { ok: false, message: "قيمة الفاتورة يجب أن تكون أكبر من صفر." };
      }
      items = [
        {
          kind: LineItemKind.BY_PIECE,
          description: asText(args.description) || "بند فاتورة",
          quantity: 1,
          unitPrice: amount.toString(),
        },
      ];
    }

    // التنفيذ عبر خدمة الفوترة نفسها (مصدر واحد للحقيقة).
    const invoice = await BillingService.createInvoice({ customerId: resolved.id, items });
    if (BillingService.isBillingError(invoice)) {
      return { ok: false, message: invoice.message, fields: invoice.fields };
    }

    return {
      ok: true,
      message: `تم إنشاء الفاتورة ${invoice.number} للعميل ${resolved.name} بقيمة صافية ${money(invoice.netTotal)}.`,
      data: {
        number: invoice.number,
        customerId: resolved.id,
        netTotal: invoice.netTotal.toString(),
        status: invoice.status,
      },
    };
  },
};

/** أداة إضافة عميل عبر المحادثة (المتطلب 11.2) — لا أثر مالي مباشر. */
const createCustomer: AssistantTool = {
  name: "create_customer",
  descriptionAr: "إضافة عميل جديد بالاسم ورقم الهاتف.",
  requiredPermission: "customers:write",
  hasFinancialEffect: false,
  fields: [
    { key: "name", labelAr: "اسم العميل" },
    { key: "phone", labelAr: "رقم الهاتف" },
  ],
  missingFields(args) {
    const missing: string[] = [];
    if (!asText(args.name)) missing.push("اسم العميل");
    if (!asText(args.phone)) missing.push("رقم الهاتف");
    return missing;
  },
  summarize(args) {
    return `إضافة عميل جديد: ${asText(args.name)} (هاتف: ${asText(args.phone)}).`;
  },
  async execute(_session, args) {
    const result = await CustomerService.createCustomer({
      name: asText(args.name),
      phone: asText(args.phone),
    });
    if (CustomerService.isValidationError(result)) {
      return { ok: false, message: result.message, fields: result.fields };
    }
    return {
      ok: true,
      message: `تم إضافة العميل ${result.name} برصيد ابتدائي ${money(result.balance)}.`,
      data: { customerId: result.id, name: result.name },
    };
  },
};

/** أداة تسجيل مصروف عبر المحادثة (المتطلب 11.3) — ذات أثر مالي. */
const recordExpense: AssistantTool = {
  name: "record_expense",
  descriptionAr: "تسجيل مصروف بقيمة وتصنيف محددين.",
  requiredPermission: "expenses:write",
  hasFinancialEffect: true,
  fields: [
    { key: "amount", labelAr: "مبلغ المصروف" },
    { key: "category", labelAr: "تصنيف المصروف" },
  ],
  missingFields(args) {
    const missing: string[] = [];
    const amount = asDecimal(args.amount);
    if (!amount || !amount.greaterThan(ZERO)) missing.push("مبلغ المصروف");
    if (!asText(args.category)) missing.push("تصنيف المصروف");
    return missing;
  },
  summarize(args) {
    const amount = asDecimal(args.amount);
    return `تسجيل مصروف بقيمة ${amount ? money(amount) : "غير محددة"} ضمن تصنيف "${asText(args.category)}".`;
  },
  async execute(_session, args) {
    const amount = asDecimal(args.amount);
    if (!amount) {
      return { ok: false, message: "مبلغ المصروف يجب أن يكون أكبر من صفر." };
    }
    const result = await ExpenseService.recordExpense({
      amount: amount.toString(),
      category: asText(args.category),
      ...(asText(args.supplierId) ? { supplierId: asText(args.supplierId) } : {}),
    });
    if (ExpenseService.isExpenseValidationError(result)) {
      return { ok: false, message: result.message, fields: result.fields };
    }
    return {
      ok: true,
      message: `تم تسجيل مصروف بقيمة ${money(result.amount)} ضمن تصنيف "${result.category}".`,
      data: { expenseId: result.id, amount: result.amount.toString(), category: result.category },
    };
  },
};

/** سجلّ الأدوات المفهرس بالاسم. */
export const TOOLS: Record<ToolName, AssistantTool> = {
  get_customer_balance: getCustomerBalance,
  get_sales: getSales,
  list_unpaid_invoices: listUnpaidInvoices,
  create_invoice: createInvoice,
  create_customer: createCustomer,
  record_expense: recordExpense,
};

/** يعيد تعريف أداة بالاسم، أو undefined إن لم تكن معرّفة. */
export function getTool(name: ToolName): AssistantTool | undefined {
  return TOOLS[name];
}

/**
 * يتحقق من أن دور الجلسة يملك صلاحية تنفيذ الأداة (المتطلبان 10.5, 11.6).
 * @returns `true` إذا كان مصرّحاً، وإلا `false`.
 */
export function isToolAuthorized(session: Session, tool: AssistantTool): boolean {
  return authorize(session, tool.requiredPermission);
}

/** الرسالة العربية الموحّدة عند منع عملية غير مصرّح بها (المتطلب 11.6). */
export { UNAUTHORIZED_MESSAGE };
