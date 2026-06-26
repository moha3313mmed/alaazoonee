/**
 * نقطة نهاية حركة مخزون صنف (Inventory Stock Movement API) — المهمة 11.1.
 *
 *  - POST /api/inventory/{id}/stock : إضافة/خصم/تعديل كمية صنف وتسجيل حركة المخزون.
 *
 * يحدّد الحقل `operation` العملية:
 *   - "add"    : إضافة كمية (شراء/إدخال) — `addStock`.
 *   - "deduct" : خصم كمية (بيع) مع منع نزول الرصيد دون الصفر — `deductStock`.
 *   - "adjust" : ضبط الكمية إلى قيمة مطلقة جديدة (جرد) — `adjustStock`.
 *
 * تُنفَّذ كل عملية داخل معاملة في خدمة المخزون (قراءة-ثم-تحديث + تسجيل الحركة)، وتُحوَّل
 * أخطاؤها: التحقق → 400، عدم وجود الصنف → 404، نقص الرصيد → 409.
 *
 * المتطلبات: 7.2/7.3/7.5 (الخصم/الإضافة ومنع السالب)، 1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import {
  fail,
  ok,
  parseJsonBody,
  serviceErrorResponse,
  INVALID_BODY_MESSAGE,
} from "@/lib/api/respond";
import {
  InventoryService,
  isInventoryError,
} from "@/lib/services/inventoryService";

/** جسم حركة المخزون. */
interface StockBody {
  operation?: unknown;
  /** الكمية للإضافة/الخصم، أو الكمية الجديدة عند التعديل. */
  quantity?: unknown;
  /** نوع المرجع المصدري اختياري (مثل "purchase"). */
  refType?: unknown;
  /** معرّف المرجع المصدري اختياري. */
  refId?: unknown;
}

const OPERATIONS = ["add", "deduct", "adjust"] as const;
type Operation = (typeof OPERATIONS)[number];

/** POST /api/inventory/{id}/stock — تنفيذ حركة مخزون. */
export const POST = withApi<{ id: string }>(
  "inventory:write",
  async ({ request, params }) => {
    const id = params.id?.trim();
    if (!id) {
      return fail("معرّف الصنف مطلوب", 400, ["id"]);
    }

    const body = await parseJsonBody<StockBody>(request);
    if (!body || typeof body !== "object") {
      return fail(INVALID_BODY_MESSAGE, 400);
    }

    const operation = body.operation as Operation;
    if (!OPERATIONS.includes(operation)) {
      return fail("نوع العملية يجب أن يكون add أو deduct أو adjust", 400, [
        "operation",
      ]);
    }

    const quantity = body.quantity;
    if (typeof quantity !== "number" && typeof quantity !== "string") {
      return fail("قيمة الكمية مطلوبة", 400, ["quantity"]);
    }

    const ref = {
      refType: typeof body.refType === "string" ? body.refType : undefined,
      refId: typeof body.refId === "string" ? body.refId : undefined,
    };

    let result;
    if (operation === "add") {
      result = await InventoryService.addStock(id, quantity, undefined, ref);
    } else if (operation === "deduct") {
      result = await InventoryService.deductStock(id, quantity, undefined, ref);
    } else {
      result = await InventoryService.adjustStock(id, quantity, ref);
    }

    if (isInventoryError(result)) {
      return serviceErrorResponse(result);
    }

    return ok({ item: result });
  }
);
