/**
 * نقطة نهاية تقرير المخزون (Inventory Report API) — المهمة 11.1.
 *
 *  - GET /api/reports/inventory : كميات الأصناف الحالية والأصناف عند حد إعادة الطلب
 *                                 (reports:read).
 *
 * المتطلبات: 9.4 (تقرير المخزون)، 1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { ReportService } from "@/lib/services/reportService";

// تشغيل المسار ديناميكياً دائماً لأنه يقرأ جلسة المستخدم (headers) ويصل لقاعدة البيانات.
export const dynamic = "force-dynamic";

/** GET /api/reports/inventory — تقرير المخزون. */
export const GET = withApi("reports:read", async () => {
  const result = await ReportService.inventoryReport();
  return ok(result);
});
