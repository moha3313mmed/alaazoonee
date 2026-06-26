/**
 * خدمة المصروفات (ExpenseService) — المهمة 8.1.
 *
 * تمثّل المصدر الموحّد لمنطق تسجيل المصروفات الذي تستخدمه الواجهة والمساعد الذكي معاً.
 * تتولّى تسجيل المصروف (المبلغ والتاريخ والتصنيف) بعد التحقق من صحّته، وربطه اختيارياً
 * بمورد مع تحديث رصيد المورد عبر `SupplierService`، وعرض قائمة المصروفات وإجماليها
 * ضمن نطاق زمني محدد.
 *
 * مبدأ "مصدر واحد للحقيقة": تُنفَّذ جميع عمليات المصروفات عبر هذه الخدمة لضمان تطبيق
 * قواعد التحقق وتحديث أرصدة الموردين بصورة موحّدة بغضّ النظر عن مصدر الطلب.
 *
 * دلالة الربط بمورد:
 *   - ربط المصروف بمورد يُعدّ عملية شراء منه، فيزيد رصيد المورد (المبلغ المستحق له)
 *     بقيمة المصروف عبر `SupplierService.recordPurchase`.
 *
 * المتطلبات:
 *  - 6.1: حفظ سجل المصروف متضمناً المبلغ والتاريخ والتصنيف.
 *  - 6.2: رفض المصروف بمبلغ ≤ 0 مع رسالة خطأ بالعربية.
 *  - 6.3: عند ربط المصروف بمورد، تسجيل العلاقة وتحديث رصيد المورد.
 *  - 6.4: عرض قائمة المصروفات وإجماليها ضمن نطاق زمني محدد.
 */
import type { Expense, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { ZERO, toDecimal } from "@/lib/db/decimal";
import { SupplierService } from "@/lib/services/supplierService";

/**
 * خطأ تحقق من مدخلات المصروف يحدد الحقول الناقصة/غير الصالحة برسالة عربية.
 * (المتطلب 6.2: رفض المبلغ ≤ 0 برسالة بالعربية؛ والمتطلب 6.1: وجوب التصنيف.)
 */
export class ExpenseValidationError extends Error {
  readonly kind = "ExpenseValidationError" as const;
  /** أسماء الحقول الناقصة/غير الصالحة (مثل: ["المبلغ", "التصنيف"]). */
  readonly fields: string[];

  constructor(message: string, fields: string[]) {
    super(message);
    this.name = "ExpenseValidationError";
    this.fields = fields;
  }
}

/** مدخلات تسجيل مصروف جديد. */
export interface RecordExpenseInput {
  /** قيمة المصروف؛ يجب أن تكون أكبر من صفر (المتطلب 6.2). */
  amount: Prisma.Decimal.Value;
  /** تاريخ المصروف؛ يُستخدم تاريخ اللحظة الحالية عند عدم تحديده. */
  date?: Date;
  /** تصنيف المصروف (مثل: إيجار، رواتب، مشتريات) — حقل مطلوب. */
  category: string;
  /** معرّف المورد عند ربط المصروف بمورد (اختياري) — المتطلب 6.3. */
  supplierId?: string;
}

/** نطاق زمني (شامل الطرفين) لاستعلام المصروفات — المتطلب 6.4. */
export interface DateRange {
  /** بداية النطاق (شاملة). */
  from: Date;
  /** نهاية النطاق (شاملة). */
  to: Date;
}

/** نتيجة عرض المصروفات ضمن نطاق زمني: القائمة وإجماليها. (المتطلب 6.4) */
export interface ExpenseListResult {
  items: Expense[];
  total: Prisma.Decimal;
}

/** ينظّف نصاً إلى قيمة قابلة للتحقق (يحذف الفراغات الزائدة). */
function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** أداة تمييز بين نتيجة ناجحة وخطأ تحقق للمصروف. */
export function isExpenseValidationError(
  value: unknown
): value is ExpenseValidationError {
  return value instanceof ExpenseValidationError;
}

/**
 * يسجّل مصروفاً جديداً بعد التحقق من صحّة مدخلاته.
 *
 * المتطلب 6.1: حفظ سجل المصروف متضمناً المبلغ والتاريخ والتصنيف.
 * المتطلب 6.2: رفض الحفظ عند مبلغ ≤ 0 مع رسالة خطأ بالعربية.
 * المتطلب 6.3: عند تمرير معرّف مورد، تُسجَّل العلاقة ويُحدَّث رصيد المورد (عملية شراء).
 *
 * يُحدَّث رصيد المورد عبر `SupplierService.recordPurchase` بعد إنشاء سجل المصروف؛
 * ووجود قيد المفتاح الأجنبي على `supplierId` يضمن أن إنشاء المصروف يفشل أصلاً إن لم
 * يكن المورد موجوداً، فلا يُحدَّث رصيد لمورد غير قائم.
 *
 * @returns سجل المصروف المُنشأ، أو {@link ExpenseValidationError} عند فشل التحقق.
 */
export async function recordExpense(
  input: RecordExpenseInput
): Promise<Expense | ExpenseValidationError> {
  const amount = toDecimal(input?.amount ?? 0);
  const category = normalize(input?.category);

  // المتطلب 6.2: المبلغ يجب أن يكون أكبر من صفر.
  const invalid: string[] = [];
  if (amount.lessThanOrEqualTo(ZERO)) {
    invalid.push("المبلغ");
  }
  // المتطلب 6.1: التصنيف جزء أساسي من سجل المصروف.
  if (category === "") {
    invalid.push("التصنيف");
  }

  if (invalid.length > 0) {
    const message = amount.lessThanOrEqualTo(ZERO)
      ? "مبلغ المصروف يجب أن يكون أكبر من صفر"
      : `الحقول التالية مطلوبة: ${invalid.join("، ")}`;
    return new ExpenseValidationError(message, invalid);
  }

  const supplierId = normalize(input?.supplierId);

  // المتطلب 6.1: حفظ سجل المصروف (مع التاريخ الافتراضي = الآن عند عدم تحديده).
  const expense = await prisma.expense.create({
    data: {
      amount,
      ...(input?.date ? { date: input.date } : {}),
      category,
      ...(supplierId !== "" ? { supplierId } : {}),
    },
  });

  // المتطلب 6.3: ربط المصروف بمورد يُعدّ عملية شراء تزيد رصيد المورد (المبلغ المستحق له).
  if (supplierId !== "") {
    await SupplierService.recordPurchase(supplierId, amount);
  }

  return expense;
}

/**
 * يعرض قائمة المصروفات وإجماليها ضمن نطاق زمني محدد (شامل الطرفين). (المتطلب 6.4)
 *
 * @param range النطاق الزمني { from, to }.
 * @returns قائمة المصروفات مرتّبة من الأحدث للأقدم وإجمالي مبالغها.
 */
export async function listExpenses(
  range: DateRange
): Promise<ExpenseListResult> {
  const items = await prisma.expense.findMany({
    where: {
      date: {
        gte: range.from,
        lte: range.to,
      },
    },
    orderBy: { date: "desc" },
  });

  const total = items.reduce<Prisma.Decimal>(
    (sum, expense) => sum.plus(expense.amount),
    ZERO
  );

  return { items, total };
}

/**
 * كائن خدمة المصروفات المجمّع — يطابق عقد `ExpenseService` في وثيقة التصميم
 * ويسهّل الاستدعاء من طبقة الـ API والمساعد الذكي.
 */
export const ExpenseService = {
  recordExpense,
  listExpenses,
  isExpenseValidationError,
} as const;

export default ExpenseService;
