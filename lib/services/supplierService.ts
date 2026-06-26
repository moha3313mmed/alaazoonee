/**
 * خدمة الموردين (SupplierService) — المهمة 3.2.
 *
 * مسؤولة عن إنشاء الموردين والتحقق من بياناتهم، وعرض سجل المورد (بياناته ورصيده
 * وسجل مشترياته ومدفوعاته)، وتحديث رصيد المورد عند تسجيل عمليات الشراء والمدفوعات.
 *
 * مبدأ "مصدر واحد للحقيقة": تُنفَّذ جميع عمليات الموردين عبر هذه الخدمة سواء استُدعيت
 * من واجهة المستخدم أو من المساعد الذكي، لضمان تطبيق قواعد التحقق وتحديث الأرصدة بصورة موحّدة.
 *
 * دلالات الرصيد (balance) للمورد:
 *   - قيمة موجبة تعني وجود مبلغ مستحق *علينا* للمورد (مشتريات لم تُسدَّد بعد).
 *   - تسجيل عملية شراء يزيد الرصيد (المبلغ المستحق للمورد).
 *   - تسجيل دفعة للمورد ينقص الرصيد.
 *
 * المتطلبات: 3.1, 3.2, 3.3, 3.4.
 */
import type { Expense, Prisma, Supplier } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { Decimal, ZERO, toDecimal } from "@/lib/db/decimal";

/**
 * خطأ تحقق من المدخلات يحدد الحقول الناقصة أو غير الصالحة برسالة عربية.
 * (المتطلب 3.2: رفض الحفظ دون الاسم أو الهاتف مع تحديد الحقول الناقصة.)
 */
export class SupplierValidationError extends Error {
  readonly kind = "SupplierValidationError" as const;
  /** أسماء الحقول الناقصة/غير الصالحة (مثل: ["الاسم", "رقم الهاتف"]). */
  readonly fields: string[];

  constructor(message: string, fields: string[]) {
    super(message);
    this.name = "SupplierValidationError";
    this.fields = fields;
  }
}

/** يُرمى عند طلب مورد غير موجود (مثل تحديث رصيد مورد محذوف). */
export class SupplierNotFoundError extends Error {
  readonly kind = "SupplierNotFoundError" as const;
  readonly supplierId: string;

  constructor(supplierId: string) {
    super(`المورد غير موجود: ${supplierId}`);
    this.name = "SupplierNotFoundError";
    this.supplierId = supplierId;
  }
}

/** مدخلات إنشاء مورد جديد. */
export interface CreateSupplierInput {
  name: string;
  phone: string;
}

/**
 * سجل المورد الكامل: بياناته الأساسية ورصيده الحالي وسجل مشترياته/مدفوعاته.
 * (المتطلب 3.4: عرض بيانات المورد ورصيده الحالي وسجل مشترياته ومدفوعاته.)
 */
export interface SupplierProfile {
  supplier: Supplier;
  /** الرصيد الحالي للمورد (المبلغ المستحق له). */
  balance: Prisma.Decimal;
  /** سجل المشتريات/المصروفات المرتبطة بهذا المورد، الأحدث أولاً. */
  expenses: Expense[];
  /** إجمالي قيمة العمليات المسجّلة على المورد. */
  totalExpenses: Prisma.Decimal;
}

/** ينظّف نصاً إلى قيمة قابلة للتحقق (يحذف الفراغات الزائدة). */
function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * يتحقق من مدخلات إنشاء/تعديل المورد ويُعيد قائمة الحقول الناقصة.
 * المتطلب 3.2: يجب توفّر الاسم ورقم الهاتف.
 */
function collectMissingFields(input: Partial<CreateSupplierInput>): string[] {
  const missing: string[] = [];
  if (normalize(input.name) === "") missing.push("الاسم");
  if (normalize(input.phone) === "") missing.push("رقم الهاتف");
  return missing;
}

/**
 * ينشئ مورداً جديداً برصيد ابتدائي = 0.
 *
 * المتطلب 3.1: حفظ سجل المورد وإنشاء رصيد ابتدائي قدره صفر.
 * المتطلب 3.2: رفض الحفظ دون الاسم أو رقم الهاتف مع رسالة تحدد الحقول الناقصة.
 *
 * @returns المورد المُنشأ، أو {@link SupplierValidationError} عند نقص المدخلات.
 */
export async function createSupplier(
  input: CreateSupplierInput
): Promise<Supplier | SupplierValidationError> {
  const missing = collectMissingFields(input);
  if (missing.length > 0) {
    return new SupplierValidationError(
      `الحقول التالية مطلوبة: ${missing.join("، ")}`,
      missing
    );
  }

  return prisma.supplier.create({
    data: {
      name: normalize(input.name),
      phone: normalize(input.phone),
      // الرصيد الابتدائي صفر (المتطلب 3.1) — يُضبط صراحةً ولا يُعتمد على الافتراضي فقط.
      balance: ZERO,
    },
  });
}

/**
 * يعرض سجل المورد الكامل: بياناته ورصيده الحالي وسجل مشترياته/مدفوعاته.
 * المتطلب 3.4.
 *
 * @returns سجل المورد، أو null إن لم يكن المورد موجوداً.
 */
export async function getSupplier(id: string): Promise<SupplierProfile | null> {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: {
      expenses: {
        orderBy: { date: "desc" },
      },
    },
  });

  if (!supplier) return null;

  const { expenses, ...supplierData } = supplier;

  const totalExpenses = expenses.reduce<Prisma.Decimal>(
    (sum, expense) => sum.plus(expense.amount),
    ZERO
  );

  return {
    supplier: supplierData as Supplier,
    balance: supplierData.balance,
    expenses,
    totalExpenses,
  };
}

/**
 * يبحث عن الموردين بالاسم أو رقم الهاتف (بحث جزئي غير حسّاس لحالة الأحرف).
 * مُكمِّل لعرض السجل ومماثل لخدمة العملاء.
 */
export async function searchSuppliers(query: string): Promise<Supplier[]> {
  const q = normalize(query);
  if (q === "") {
    return prisma.supplier.findMany({ orderBy: { name: "asc" } });
  }

  return prisma.supplier.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    },
    orderBy: { name: "asc" },
  });
}

/**
 * يطبّق حركة مالية على رصيد المورد بإضافة مقدار التغيّر (delta) إلى الرصيد الحالي.
 *
 * المتطلب 3.3: تحديث رصيد المورد عند تسجيل عملية شراء أو دفعة.
 *   - delta موجبة → عملية شراء (زيادة المستحق للمورد).
 *   - delta سالبة → دفعة للمورد (إنقاص المستحق).
 *
 * يُجرى التحديث ذرّياً عبر زيادة (increment) لتفادي تعارض التحديثات المتزامنة،
 * ويُنفَّذ داخل معاملة للتحقق من وجود المورد أولاً.
 *
 * @returns المورد بعد التحديث.
 * @throws {SupplierNotFoundError} إن لم يكن المورد موجوداً.
 */
export async function applyTransaction(
  supplierId: string,
  delta: Prisma.Decimal.Value
): Promise<Supplier> {
  const deltaDecimal = toDecimal(delta);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true },
    });
    if (!existing) {
      throw new SupplierNotFoundError(supplierId);
    }

    return tx.supplier.update({
      where: { id: supplierId },
      data: { balance: { increment: deltaDecimal } },
    });
  });
}

/**
 * يسجّل عملية شراء على المورد فيزيد رصيده (المبلغ المستحق له) بقيمة الشراء.
 * المتطلب 3.3.
 *
 * @returns المورد بعد التحديث، أو {@link SupplierValidationError} إن كانت القيمة ≤ 0.
 * @throws {SupplierNotFoundError} إن لم يكن المورد موجوداً.
 */
export async function recordPurchase(
  supplierId: string,
  amount: Prisma.Decimal.Value
): Promise<Supplier | SupplierValidationError> {
  const value = toDecimal(amount);
  if (value.lessThanOrEqualTo(ZERO)) {
    return new SupplierValidationError("قيمة الشراء يجب أن تكون أكبر من صفر", [
      "المبلغ",
    ]);
  }
  return applyTransaction(supplierId, value);
}

/**
 * يسجّل دفعة للمورد فينقص رصيده (المبلغ المستحق له) بقيمة الدفعة.
 * المتطلب 3.3.
 *
 * @returns المورد بعد التحديث، أو {@link SupplierValidationError} إن كانت القيمة ≤ 0.
 * @throws {SupplierNotFoundError} إن لم يكن المورد موجوداً.
 */
export async function recordPayment(
  supplierId: string,
  amount: Prisma.Decimal.Value
): Promise<Supplier | SupplierValidationError> {
  const value = toDecimal(amount);
  if (value.lessThanOrEqualTo(ZERO)) {
    return new SupplierValidationError("قيمة الدفعة يجب أن تكون أكبر من صفر", [
      "المبلغ",
    ]);
  }
  return applyTransaction(supplierId, new Decimal(value).negated());
}

/** أداة مساعدة للتمييز بين نتيجة ناجحة وخطأ تحقق. */
export function isSupplierValidationError(
  value: unknown
): value is SupplierValidationError {
  return value instanceof SupplierValidationError;
}

/**
 * كائن خدمة الموردين المجمّع — يطابق عقد `SupplierService` في وثيقة التصميم
 * ويسهّل الاستدعاء من طبقة الـ API والمساعد الذكي.
 */
export const SupplierService = {
  createSupplier,
  getSupplier,
  searchSuppliers,
  applyTransaction,
  recordPurchase,
  recordPayment,
} as const;

export default SupplierService;
