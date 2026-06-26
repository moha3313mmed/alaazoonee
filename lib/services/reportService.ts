/**
 * خدمة التقارير (ReportService) — المهمة 10.1.
 *
 * تمثّل المصدر الموحّد لمنطق التقارير المالية والتشغيلية الذي تستخدمه الواجهة والمساعد
 * الذكي معاً (مبدأ "مصدر واحد للحقيقة"). تغطّي هذه الوحدة:
 *
 *  - `salesReport`: إجمالي المبيعات وعدد الفواتير ضمن نطاق زمني. (المتطلب 9.1)
 *  - `profitReport`: احتساب الأرباح = إجمالي المبيعات − (إجمالي المصروفات + تكلفة البضاعة
 *    المباعة) ضمن نطاق زمني. (المتطلب 9.2)
 *  - `receivablesReport`: قائمة العملاء ذوي الأرصدة المستحقة وقائمة الموردين ذوي المستحقات.
 *    (المتطلب 9.3)
 *  - `inventoryReport`: كميات الأصناف الحالية والأصناف التي بلغت حد إعادة الطلب. (المتطلب 9.4)
 *
 * ملاحظة بشأن الدقة: تُجرى جميع الحسابات المالية بنوع Decimal لتفادي أخطاء الفاصلة العائمة
 * (المتطلبات 9.2, 12.4). وتُجمَّع القيم عبر استعلامات قاعدة البيانات قدر الإمكان لضمان الكفاءة.
 *
 * ملاحظة بشأن تكلفة البضاعة المباعة (COGS): لا يحتفظ مخطط البيانات الحالي بسعر تكلفة لكل
 * صنف مخزون، لذا تُحتسب تكلفة البضاعة المباعة من خريطة تكاليف اختيارية تُمرَّر للدالة
 * (`unitCosts`). في غيابها تكون التكلفة صفراً، ويظل هيكل المعادلة (مبيعات − مصروفات − تكلفة)
 * صحيحاً وجاهزاً عند إضافة حقل التكلفة لاحقاً.
 */
import {
  LineItemKind,
  Prisma,
  type Customer,
  type InventoryItem,
  type Supplier,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { Decimal, ZERO, toDecimal } from "@/lib/db/decimal";
import { isLowStock } from "@/lib/services/inventoryService";

/** القيم العربية المعتمدة لرسائل الأخطاء (وثيقة التصميم: قسم معالجة الأخطاء). */
export const REPORT_MESSAGES = {
  /** النطاق الزمني غير صالح (تاريخ البداية بعد تاريخ النهاية). */
  INVALID_RANGE: "النطاق الزمني غير صالح: تاريخ البداية يجب ألا يتجاوز تاريخ النهاية",
  /** قيمة تاريخ غير صالحة ضمن النطاق الزمني. */
  INVALID_DATE: "تواريخ النطاق الزمني غير صالحة",
} as const;

/** خطأ خدمة موحّد بنمط مُمَيَّز (discriminated union) يُعاد بدلاً من رمي الاستثناءات. */
export type ReportError = {
  error: "VALIDATION";
  message: string;
  fields?: string[];
};

/** حارس نوع للتفريق بين نتيجة ناجحة وخطأ خدمة. */
export function isReportError(value: unknown): value is ReportError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    (value as { error: unknown }).error === "VALIDATION"
  );
}

/** نطاق زمني شامل الطرفين (from ≤ date ≤ to) يُستخدم لترشيح التقارير. */
export interface DateRange {
  /** بداية النطاق (شاملة). */
  from: Date;
  /** نهاية النطاق (شاملة). */
  to: Date;
}

/** نتيجة تقرير المبيعات. (المتطلب 9.1) */
export interface SalesReport {
  /** إجمالي قيم الفواتير (الصافي) ضمن النطاق. */
  totalSales: Prisma.Decimal;
  /** عدد الفواتير ضمن النطاق. */
  invoiceCount: number;
}

/** خيارات تقرير الأرباح. */
export interface ProfitReportOptions {
  /**
   * خريطة تكلفة وحدة القياس لكل صنف مخزون (معرّف الصنف → التكلفة)، تُستخدم لاحتساب
   * تكلفة البضاعة المباعة. في غيابها تُعدّ التكلفة صفراً.
   */
  unitCosts?: Record<string, Prisma.Decimal.Value>;
}

/** نتيجة تقرير الأرباح بتفصيل مكوّناتها للشفافية. (المتطلب 9.2) */
export interface ProfitReport {
  /** إجمالي المبيعات (صافي الفواتير ضمن النطاق). */
  totalSales: Prisma.Decimal;
  /** إجمالي المصروفات ضمن النطاق. */
  totalExpenses: Prisma.Decimal;
  /** تكلفة البضاعة المباعة ضمن النطاق. */
  costOfGoodsSold: Prisma.Decimal;
  /** الربح = المبيعات − (المصروفات + تكلفة البضاعة المباعة). */
  profit: Prisma.Decimal;
}

/** عنصر رصيد في تقرير الذمم (عميل أو مورد). */
export interface BalanceEntry {
  id: string;
  name: string;
  phone: string;
  /** الرصيد المستحق (قيمة موجبة). */
  balance: Prisma.Decimal;
}

/** نتيجة تقرير الذمم. (المتطلب 9.3) */
export interface ReceivablesReport {
  /** العملاء ذوو الأرصدة المستحقة (الرصيد > 0)، الأعلى رصيداً أولاً. */
  customers: BalanceEntry[];
  /** الموردون ذوو المستحقات (الرصيد > 0)، الأعلى رصيداً أولاً. */
  suppliers: BalanceEntry[];
}

/** نتيجة تقرير المخزون. (المتطلب 9.4) */
export interface InventoryReport {
  /** جميع الأصناف بكمياتها الحالية، مرتّبة بالاسم. */
  items: InventoryItem[];
  /** الأصناف التي بلغت حد إعادة الطلب أو قلّت عنه. */
  lowStock: InventoryItem[];
}

/** يتحقق من صلاحية النطاق الزمني (تواريخ صالحة وبداية ≤ نهاية). */
function validateRange(range: DateRange): ReportError | null {
  const from = range?.from;
  const to = range?.to;

  if (
    !(from instanceof Date) ||
    !(to instanceof Date) ||
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime())
  ) {
    return { error: "VALIDATION", message: REPORT_MESSAGES.INVALID_DATE, fields: ["from", "to"] };
  }

  if (from.getTime() > to.getTime()) {
    return { error: "VALIDATION", message: REPORT_MESSAGES.INVALID_RANGE, fields: ["from", "to"] };
  }

  return null;
}

/** يحوّل قيمة Decimal اختيارية (قد تكون null من التجميع) إلى Decimal غير فارغة. */
function nonNull(value: Prisma.Decimal | null): Prisma.Decimal {
  return value ?? ZERO;
}

/** يحوّل سجل عميل/مورد إلى عنصر رصيد للتقرير. */
function toBalanceEntry(entity: Customer | Supplier): BalanceEntry {
  return {
    id: entity.id,
    name: entity.name,
    phone: entity.phone,
    balance: new Decimal(entity.balance),
  };
}

/**
 * يحتسب الكمية المباعة لبند فاتورة:
 *  - بالقطعة: الكمية مباشرةً.
 *  - بالقياس: المساحة (العرض × الارتفاع).
 * يُستخدم لاحتساب تكلفة البضاعة المباعة بضربها في تكلفة وحدة الصنف.
 */
function soldQuantity(item: {
  kind: LineItemKind;
  quantity: Prisma.Decimal | null;
  widthM: Prisma.Decimal | null;
  heightM: Prisma.Decimal | null;
}): Prisma.Decimal {
  if (item.kind === LineItemKind.BY_PIECE) {
    return item.quantity ? new Decimal(item.quantity) : ZERO;
  }

  if (item.widthM && item.heightM) {
    return new Decimal(item.widthM).times(new Decimal(item.heightM));
  }

  return ZERO;
}

/**
 * تقرير المبيعات: إجمالي المبيعات وعدد الفواتير ضمن النطاق الزمني. (المتطلب 9.1)
 *
 * يُحتسب الإجمالي كمجموع صافي الفواتير (netTotal) التي يقع تاريخ إصدارها ضمن النطاق،
 * ويُحتسب العدد كعدد تلك الفواتير.
 *
 * @returns {@link SalesReport} أو {@link ReportError} عند نطاق زمني غير صالح.
 */
export async function salesReport(
  range: DateRange,
): Promise<SalesReport | ReportError> {
  const invalid = validateRange(range);
  if (invalid) return invalid;

  const aggregate = await prisma.invoice.aggregate({
    where: { issueDate: { gte: range.from, lte: range.to } },
    _sum: { netTotal: true },
    _count: { _all: true },
  });

  return {
    totalSales: nonNull(aggregate._sum.netTotal),
    invoiceCount: aggregate._count._all,
  };
}

/**
 * تقرير الأرباح: الربح = إجمالي المبيعات − (إجمالي المصروفات + تكلفة البضاعة المباعة). (المتطلب 9.2)
 *
 * - إجمالي المبيعات: مجموع صافي الفواتير ضمن النطاق.
 * - إجمالي المصروفات: مجموع المصروفات ضمن النطاق.
 * - تكلفة البضاعة المباعة: مجموع (الكمية المباعة × تكلفة الوحدة) لبنود الفواتير المرتبطة
 *   بأصناف مخزون ضمن النطاق، استناداً إلى خريطة التكاليف الاختيارية `unitCosts`
 *   (تكون صفراً في غيابها).
 *
 * @returns {@link ProfitReport} أو {@link ReportError} عند نطاق زمني غير صالح.
 */
export async function profitReport(
  range: DateRange,
  options: ProfitReportOptions = {},
): Promise<ProfitReport | ReportError> {
  const invalid = validateRange(range);
  if (invalid) return invalid;

  const where = { issueDate: { gte: range.from, lte: range.to } };

  const [salesAgg, expenseAgg] = await Promise.all([
    prisma.invoice.aggregate({ where, _sum: { netTotal: true } }),
    prisma.expense.aggregate({
      where: { date: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    }),
  ]);

  const totalSales = nonNull(salesAgg._sum.netTotal);
  const totalExpenses = nonNull(expenseAgg._sum.amount);
  const costOfGoodsSold = await computeCostOfGoodsSold(range, options.unitCosts);

  const profit = totalSales.minus(totalExpenses).minus(costOfGoodsSold);

  return { totalSales, totalExpenses, costOfGoodsSold, profit };
}

/**
 * يحتسب تكلفة البضاعة المباعة ضمن النطاق من بنود الفواتير المرتبطة بأصناف مخزون،
 * بضرب الكمية المباعة لكل بند في تكلفة وحدة الصنف من الخريطة المُمرَّرة.
 * يعيد صفراً إذا لم تُمرَّر خريطة تكاليف أو لم يُطابَق أي صنف.
 */
async function computeCostOfGoodsSold(
  range: DateRange,
  unitCosts?: Record<string, Prisma.Decimal.Value>,
): Promise<Prisma.Decimal> {
  if (!unitCosts || Object.keys(unitCosts).length === 0) return ZERO;

  const items = await prisma.invoiceItem.findMany({
    where: {
      inventoryItemId: { not: null },
      invoice: { issueDate: { gte: range.from, lte: range.to } },
    },
    select: { kind: true, quantity: true, widthM: true, heightM: true, inventoryItemId: true },
  });

  return items.reduce<Prisma.Decimal>((total, item) => {
    const cost = item.inventoryItemId ? unitCosts[item.inventoryItemId] : undefined;
    if (cost === undefined) return total;
    return total.plus(soldQuantity(item).times(toDecimal(cost)));
  }, ZERO);
}

/**
 * تقرير الذمم: قائمة العملاء ذوي الأرصدة المستحقة وقائمة الموردين ذوي المستحقات. (المتطلب 9.3)
 *
 * تُدرَج السجلات ذات الرصيد الموجب فقط (يوجد مبلغ مستحق)، مرتّبة من الأعلى رصيداً للأقل.
 */
export async function receivablesReport(): Promise<ReceivablesReport> {
  const [customers, suppliers] = await Promise.all([
    prisma.customer.findMany({
      where: { balance: { gt: ZERO } },
      orderBy: { balance: "desc" },
    }),
    prisma.supplier.findMany({
      where: { balance: { gt: ZERO } },
      orderBy: { balance: "desc" },
    }),
  ]);

  return {
    customers: customers.map(toBalanceEntry),
    suppliers: suppliers.map(toBalanceEntry),
  };
}

/**
 * تقرير المخزون: كميات الأصناف الحالية والأصناف التي بلغت حد إعادة الطلب. (المتطلب 9.4)
 *
 * يعيد جميع الأصناف مرتّبة بالاسم، إضافةً إلى قائمة مرشَّحة بالأصناف التي بلغت كميتها
 * حد إعادة الطلب أو قلّت عنه (بإعادة استخدام منطق `isLowStock` من خدمة المخزون).
 */
export async function inventoryReport(): Promise<InventoryReport> {
  const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
  const lowStock = items.filter((item) => isLowStock(item));

  return { items, lowStock };
}

/** واجهة الخدمة مجمّعة لتسهيل الاستيراد والاستخدام في طبقة الـ API والمساعد الذكي. */
export const ReportService = {
  salesReport,
  profitReport,
  receivablesReport,
  inventoryReport,
  isReportError,
} as const;

export default ReportService;
