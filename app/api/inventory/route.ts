/**
 * نقاط نهاية المخزون (Inventory API) — المهمة 11.1.
 *
 *  - GET  /api/inventory : قائمة جميع الأصناف وقائمة الأصناف عند حد إعادة الطلب
 *                          (inventory:read) — عبر تقرير المخزون الموحّد.
 *  - POST /api/inventory : إنشاء صنف جديد بوحدة القياس والكمية وحد إعادة الطلب
 *                          (inventory:write).
 *
 * المتطلبات: 7.1/7.4/7.6 (إنشاء الصنف وعرض المخزون والتنبيهات)، 1.3 (فرض الصلاحيات).
 */
import { UnitKind } from "@prisma/client";

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
import { ReportService } from "@/lib/services/reportService";

/** GET /api/inventory — الأصناف الحالية وتنبيهات نقص المخزون. */
export const GET = withApi("inventory:read", async () => {
  const report = await ReportService.inventoryReport();
  return ok({ items: report.items, lowStock: report.lowStock });
});

/** جسم إنشاء صنف مخزون. */
interface CreateItemBody {
  name?: unknown;
  unit?: unknown;
  quantity?: unknown;
  reorderLevel?: unknown;
}

/** POST /api/inventory — إنشاء صنف جديد. */
export const POST = withApi("inventory:write", async ({ request }) => {
  const body = await parseJsonBody<CreateItemBody>(request);
  if (!body || typeof body !== "object") {
    return fail(INVALID_BODY_MESSAGE, 400);
  }

  const result = await InventoryService.createItem({
    name: typeof body.name === "string" ? body.name : "",
    unit: body.unit as UnitKind,
    quantity: (body.quantity ?? 0) as number,
    reorderLevel: (body.reorderLevel ?? 0) as number,
  });

  if (isInventoryError(result)) {
    return serviceErrorResponse(result);
  }

  return ok({ item: result }, 201);
});
