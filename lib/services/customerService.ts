/**
 * خدمة العملاء (CustomerService) — المهمة 3.1.
 *
 * تمثّل المصدر الموحّد لمنطق إدارة العملاء الذي تستخدمه الواجهة والمساعد الذكي معاً.
 * تتولّى إنشاء العملاء مع رصيد ابتدائي صفر، والتحقق من المدخلات، وعرض ملف العميل
 * (البيانات + الرصيد + سجل الفواتير والمدفوعات)، والبحث بالاسم أو الهاتف، وتحديث الرصيد.
 *
 * المتطلبات:
 *  - 2.1: حفظ عميل جديد (الاسم + الهاتف) وإنشاء رصيد ابتدائي = 0.
 *  - 2.2: رفض الحفظ دون الاسم أو الهاتف مع رسالة تحدد الحقول الناقصة.
 *  - 2.3: عرض بيانات العميل ورصيده الحالي وسجل فواتيره ومدفوعاته.
 *  - 2.4: تحديث رصيد العميل وفقاً للحركة المسجلة (فاتورة/دفعة).
 *  - 2.5: البحث عن العملاء بالاسم أو رقم الهاتف.
 */
import { Prisma } from "@prisma/client";
import type { Customer, Invoice, Payment } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { ZERO } from "@/lib/db/decimal";

/**
 * خطأ تحقق من المدخلات يُعاد على مستوى الخدمة (لا يُرمى كاستثناء) ليتيح للمستدعي
 * عرض رسالة عربية واضحة تحدد الحقول الناقصة/الخاطئة. (المتطلب 2.2)
 */
export interface ValidationError {
  /** علامة تمييز النوع للتفريق عن السجل الناجح. */
  error: "VALIDATION_ERROR";
  /** رسالة عربية موجزة تصف سبب الرفض. */
  message: string;
  /** أسماء الحقول الناقصة/غير الصالحة بالعربية. */
  fields: string[];
}

/**
 * ملف العميل الكامل المُعاد من getCustomer:
 * البيانات الأساسية + الرصيد الحالي + سجل الفواتير (وكل فاتورة بمدفوعاتها) + كل المدفوعات.
 * (المتطلب 2.3)
 */
export interface CustomerProfile {
  customer: Customer;
  /** الرصيد الحالي للعميل (مطابق لـ customer.balance، مُبرز للتيسير). */
  balance: Prisma.Decimal;
  /** سجل الفواتير مرتّباً من الأحدث للأقدم، وكل فاتورة تتضمّن مدفوعاتها. */
  invoices: (Invoice & { payments: Payment[] })[];
  /** سجل جميع المدفوعات عبر كل فواتير العميل، مرتّباً من الأحدث للأقدم. */
  payments: Payment[];
}

/**
 * حارس نوع للتفريق بين نتيجة ناجحة وخطأ تحقق.
 * @example
 * const r = await createCustomer(input);
 * if (isValidationError(r)) { // اعرض r.message } else { // r هو Customer }
 */
export function isValidationError(
  value: Customer | ValidationError,
): value is ValidationError {
  return (value as ValidationError).error === "VALIDATION_ERROR";
}

/**
 * ينشئ عميلاً جديداً برصيد ابتدائي = 0 بعد التحقق من وجود الاسم ورقم الهاتف.
 *
 * (المتطلب 2.1) عند توفّر الاسم والهاتف يُحفظ السجل بـ balance = 0.
 * (المتطلب 2.2) عند غياب أيٍّ منهما تُعاد ValidationError تحدّد الحقول الناقصة.
 *
 * @param input بيانات العميل: الاسم ورقم الهاتف.
 * @returns سجل العميل المحفوظ، أو ValidationError عند نقص المدخلات.
 */
export async function createCustomer(input: {
  name: string;
  phone: string;
}): Promise<Customer | ValidationError> {
  const name = (input?.name ?? "").trim();
  const phone = (input?.phone ?? "").trim();

  const missing: string[] = [];
  if (name.length === 0) missing.push("الاسم");
  if (phone.length === 0) missing.push("رقم الهاتف");

  if (missing.length > 0) {
    return {
      error: "VALIDATION_ERROR",
      message: `الحقول الناقصة: ${missing.join("، ")}`,
      fields: missing,
    };
  }

  // الرصيد الابتدائي = 0 (المتطلب 2.1). يضبطه المخطط افتراضياً، ونمرّره صراحةً للتوثيق.
  return prisma.customer.create({
    data: { name, phone, balance: ZERO },
  });
}

/**
 * يعرض ملف العميل: بياناته ورصيده الحالي وسجل فواتيره ومدفوعاته. (المتطلب 2.3)
 *
 * @param id معرّف العميل.
 * @returns CustomerProfile.
 * @throws Error عند عدم وجود عميل بهذا المعرّف ("العميل غير موجود").
 */
export async function getCustomer(id: string): Promise<CustomerProfile> {
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      invoices: {
        orderBy: { issueDate: "desc" },
        include: {
          payments: { orderBy: { date: "desc" } },
        },
      },
    },
  });

  if (!customer) {
    throw new Error("العميل غير موجود");
  }

  const { invoices, ...base } = customer;

  // سجل موحّد لجميع المدفوعات عبر كل الفواتير، مرتّب من الأحدث للأقدم.
  const payments = invoices
    .flatMap((invoice) => invoice.payments)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  return {
    customer: base,
    balance: base.balance,
    invoices,
    payments,
  };
}

/**
 * يبحث عن العملاء بالاسم أو رقم الهاتف (مطابقة جزئية غير حسّاسة لحالة الأحرف). (المتطلب 2.5)
 *
 * @param query نص البحث؛ النص الفارغ يُعيد جميع العملاء.
 * @returns قائمة العملاء المطابقين مرتّبة بالاسم.
 */
export async function searchCustomers(query: string): Promise<Customer[]> {
  const term = (query ?? "").trim();

  return prisma.customer.findMany({
    where: term
      ? {
          OR: [
            { name: { contains: term, mode: "insensitive" } },
            { phone: { contains: term } },
          ],
        }
      : undefined,
    orderBy: { name: "asc" },
  });
}

/**
 * يحدّث رصيد العميل بإضافة مقدار التغيّر (delta) إليه بشكل ذرّي. (المتطلب 2.4)
 *
 * يُستخدم من خدمات الفوترة عند اعتماد فاتورة (delta موجب) أو تسجيل دفعة (delta سالب).
 * يقبل عميل معاملة Prisma اختيارياً ليُنفَّذ ضمن معاملة أكبر متعددة الخطوات.
 *
 * @param customerId معرّف العميل.
 * @param delta مقدار التغيّر على الرصيد (موجب يزيد المستحق، سالب يقلّله).
 * @param tx عميل معاملة Prisma اختياري لتنفيذ العملية ضمن معاملة قائمة.
 */
export async function applyTransaction(
  customerId: string,
  delta: Prisma.Decimal,
  tx?: Prisma.TransactionClient,
): Promise<void> {
  const db = tx ?? prisma;
  await db.customer.update({
    where: { id: customerId },
    data: { balance: { increment: delta } },
  });
}

/** واجهة الخدمة مجمّعة لتيسير الاستيراد والاستخدام كوحدة واحدة. */
export const CustomerService = {
  createCustomer,
  getCustomer,
  searchCustomers,
  applyTransaction,
  isValidationError,
};

export default CustomerService;
