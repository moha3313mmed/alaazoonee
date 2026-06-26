/**
 * خدمة المخزون (InventoryService) — المهمة 4.1
 *
 * تتولى إدارة أصناف الزجاج والإكسسوارات وكمياتها وحركتها، وفق طبقة الخدمات الموحّدة
 * (مصدر واحد للحقيقة) التي تستخدمها واجهة المستخدم والمساعد الذكي معاً.
 *
 * المسؤوليات:
 *  - إنشاء صنف بوحدة القياس (متر مربع/قطعة) والكمية وحد إعادة الطلب. (المتطلبات 7.1, 7.6)
 *  - إضافة مخزون (شراء/إدخال) وخصم مخزون (بيع) مع منع نزول الكمية دون الصفر. (المتطلبات 7.2, 7.3, 7.5)
 *  - تسجيل حركة مخزون (StockMovement) لكل عملية بيع/شراء/تعديل. (المتطلبات 7.2, 7.3)
 *  - كشف نقص المخزون عند بلوغ الكمية حد إعادة الطلب أو ما دونه. (المتطلبات 7.4)
 *
 * ملاحظة بشأن الدقة: تُجرى جميع العمليات على الكميات بنوع Decimal لتفادي أخطاء الفاصلة العائمة
 * (المتطلبات 9.2, 12.4). كما تُنفَّذ عمليات القراءة-ثم-التحديث داخل معاملة قاعدة بيانات
 * (transaction) لضمان التماسك ومنع حالات السباق (race conditions).
 */
import { Prisma, type InventoryItem, StockMovementType, UnitKind } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { Decimal, ZERO, toDecimal } from "@/lib/db/decimal";

/** القيم العربية المعتمدة لرسائل الأخطاء (وثيقة التصميم: قسم معالجة الأخطاء). */
export const INVENTORY_MESSAGES = {
  NAME_REQUIRED: "اسم الصنف مطلوب",
  INVALID_UNIT: "وحدة القياس غير صالحة (متر مربع أو قطعة)",
  NEGATIVE_QUANTITY: "الكمية يجب أن تكون صفراً أو أكثر",
  NEGATIVE_REORDER: "حد إعادة الطلب يجب أن يكون صفراً أو أكثر",
  MOVE_QTY_POSITIVE: "الكمية يجب أن تكون أكبر من صفر",
  ITEM_NOT_FOUND: "الصنف غير موجود",
  INSUFFICIENT_STOCK: "الرصيد غير كافٍ لهذا الصنف",
} as const;

/** خطأ خدمة موحّد بنمط مُمَيَّز (discriminated union) يُعاد بدلاً من رمي الاستثناءات. */
export type InventoryError =
  | { error: "VALIDATION"; message: string; fields?: string[] }
  | { error: "NOT_FOUND"; message: string }
  | { error: "INSUFFICIENT_STOCK"; message: string };

/** يتحقق ما إذا كانت النتيجة خطأ خدمة. */
export function isInventoryError(value: unknown): value is InventoryError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

/** مدخلات إنشاء صنف مخزون جديد. */
export interface CreateItemInput {
  name: string;
  unit: UnitKind;
  quantity: Prisma.Decimal.Value;
  reorderLevel: Prisma.Decimal.Value;
}

/** بيانات مرجعية اختيارية لربط حركة المخزون بعملية مصدرية (فاتورة/شراء...). */
export interface StockMovementRef {
  /** نوع المرجع، مثل: "invoice" أو "purchase". */
  refType?: string;
  /** معرّف المرجع المصدري. */
  refId?: string;
}

/**
 * أنشئ صنف مخزون جديد مع وحدة القياس والكمية وحد إعادة الطلب.
 * المتطلبات: 7.1 (حفظ الصنف)، 7.6 (دعم وحدتي القياس).
 */
export async function createItem(
  input: CreateItemInput
): Promise<InventoryItem | InventoryError> {
  const name = input.name?.trim();
  if (!name) {
    return { error: "VALIDATION", message: INVENTORY_MESSAGES.NAME_REQUIRED, fields: ["name"] };
  }

  if (input.unit !== UnitKind.SQUARE_METER && input.unit !== UnitKind.PIECE) {
    return { error: "VALIDATION", message: INVENTORY_MESSAGES.INVALID_UNIT, fields: ["unit"] };
  }

  let quantity: Prisma.Decimal;
  let reorderLevel: Prisma.Decimal;
  try {
    quantity = toDecimal(input.quantity);
    reorderLevel = toDecimal(input.reorderLevel);
  } catch {
    return {
      error: "VALIDATION",
      message: INVENTORY_MESSAGES.NEGATIVE_QUANTITY,
      fields: ["quantity", "reorderLevel"],
    };
  }

  if (quantity.lessThan(ZERO)) {
    return { error: "VALIDATION", message: INVENTORY_MESSAGES.NEGATIVE_QUANTITY, fields: ["quantity"] };
  }
  if (reorderLevel.lessThan(ZERO)) {
    return { error: "VALIDATION", message: INVENTORY_MESSAGES.NEGATIVE_REORDER, fields: ["reorderLevel"] };
  }

  return prisma.inventoryItem.create({
    data: { name, unit: input.unit, quantity, reorderLevel },
  });
}

/**
 * أضف كمية إلى رصيد صنف (شراء/إدخال مخزون) وسجّل حركة المخزون المقابلة.
 * المتطلب: 7.3 (زيادة الكمية عند الشراء/الإدخال).
 *
 * @param type نوع الحركة (افتراضياً "شراء"؛ يُمكن تمرير "تعديل" للإدخالات اليدوية).
 */
export async function addStock(
  itemId: string,
  qty: Prisma.Decimal.Value,
  type: StockMovementType = StockMovementType.PURCHASE,
  ref: StockMovementRef = {}
): Promise<InventoryItem | InventoryError> {
  const amount = toDecimal(qty);
  if (!amount.greaterThan(ZERO)) {
    return { error: "VALIDATION", message: INVENTORY_MESSAGES.MOVE_QTY_POSITIVE, fields: ["qty"] };
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return { error: "NOT_FOUND", message: INVENTORY_MESSAGES.ITEM_NOT_FOUND } satisfies InventoryError;
    }

    const updated = await tx.inventoryItem.update({
      where: { id: itemId },
      data: { quantity: new Decimal(item.quantity).plus(amount) },
    });

    await tx.stockMovement.create({
      data: { itemId, type, quantity: amount, refType: ref.refType, refId: ref.refId },
    });

    return updated;
  });
}

/**
 * اخصم كمية من رصيد صنف (بيع) وسجّل حركة المخزون المقابلة.
 * يمنع نزول الكمية دون الصفر ويعرض رسالة "الرصيد غير كافٍ لهذا الصنف".
 * المتطلبات: 7.2 (خصم المباع)، 7.5 (منع الكمية السالبة).
 *
 * @param type نوع الحركة (افتراضياً "بيع").
 */
export async function deductStock(
  itemId: string,
  qty: Prisma.Decimal.Value,
  type: StockMovementType = StockMovementType.SALE,
  ref: StockMovementRef = {}
): Promise<InventoryItem | InventoryError> {
  const amount = toDecimal(qty);
  if (!amount.greaterThan(ZERO)) {
    return { error: "VALIDATION", message: INVENTORY_MESSAGES.MOVE_QTY_POSITIVE, fields: ["qty"] };
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return { error: "NOT_FOUND", message: INVENTORY_MESSAGES.ITEM_NOT_FOUND } satisfies InventoryError;
    }

    const newQuantity = new Decimal(item.quantity).minus(amount);
    // المتطلب 7.5: منع إتمام العملية إذا أدّت إلى رصيد دون الصفر.
    if (newQuantity.lessThan(ZERO)) {
      return {
        error: "INSUFFICIENT_STOCK",
        message: INVENTORY_MESSAGES.INSUFFICIENT_STOCK,
      } satisfies InventoryError;
    }

    const updated = await tx.inventoryItem.update({
      where: { id: itemId },
      data: { quantity: newQuantity },
    });

    await tx.stockMovement.create({
      data: { itemId, type, quantity: amount, refType: ref.refType, refId: ref.refId },
    });

    return updated;
  });
}

/**
 * عدّل كمية صنف يدوياً إلى قيمة مطلقة جديدة وسجّل حركة "تعديل".
 * يُستخدم للجرد والتسويات. يمنع القيم السالبة.
 * المتطلب: تسجيل حركة المخزون لكل عملية تعديل (7.2/7.3).
 */
export async function adjustStock(
  itemId: string,
  newQuantity: Prisma.Decimal.Value,
  ref: StockMovementRef = {}
): Promise<InventoryItem | InventoryError> {
  const target = toDecimal(newQuantity);
  if (target.lessThan(ZERO)) {
    return { error: "VALIDATION", message: INVENTORY_MESSAGES.NEGATIVE_QUANTITY, fields: ["newQuantity"] };
  }

  return prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) {
      return { error: "NOT_FOUND", message: INVENTORY_MESSAGES.ITEM_NOT_FOUND } satisfies InventoryError;
    }

    const delta = target.minus(new Decimal(item.quantity)).abs();

    const updated = await tx.inventoryItem.update({
      where: { id: itemId },
      data: { quantity: target },
    });

    await tx.stockMovement.create({
      data: {
        itemId,
        type: StockMovementType.ADJUSTMENT,
        quantity: delta,
        refType: ref.refType,
        refId: ref.refId,
      },
    });

    return updated;
  });
}

/**
 * هل بلغت كمية الصنف حد إعادة الطلب أو قلّت عنه؟
 * المتطلب 7.4: يُصدر التنبيه عند الكمية ≤ حد إعادة الطلب.
 */
export function isLowStock(item: Pick<InventoryItem, "quantity" | "reorderLevel">): boolean {
  return new Decimal(item.quantity).lessThanOrEqualTo(new Decimal(item.reorderLevel));
}

/**
 * أعد قائمة الأصناف التي بلغت حد إعادة الطلب أو قلّت عنه (تنبيهات نقص المخزون).
 * المتطلب 7.4.
 */
export async function getLowStockAlerts(): Promise<InventoryItem[]> {
  // المقارنة بين عمودين (quantity <= reorderLevel) غير متاحة مباشرة في مرشّح Prisma،
  // لذا نجلب الأصناف ونرشّحها بدقة Decimal في طبقة التطبيق.
  const items = await prisma.inventoryItem.findMany({ orderBy: { name: "asc" } });
  return items.filter((item) => isLowStock(item));
}

/** واجهة الخدمة مجمّعة لتسهيل الاستيراد والاستخدام في طبقة الـ API والمساعد الذكي. */
export const InventoryService = {
  createItem,
  addStock,
  deductStock,
  adjustStock,
  isLowStock,
  getLowStockAlerts,
} as const;

export default InventoryService;
