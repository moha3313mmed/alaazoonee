/**
 * نقطة نهاية تقرير الذمم (Receivables Report API) — المهمة 11.1.
 *
 *  - GET /api/reports/receivables : قائمة العملاء ذوي الأرصدة المستحقة والموردين ذوي
 *                                   المستحقات (reports:read).
 *
 * المتطلبات: 9.3 (تقرير الذمم)، 1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import { ok } from "@/lib/api/respond";
import { ReportService } from "@/lib/services/reportService";

/** GET /api/reports/receivables — تقرير الذمم. */
export const GET = withApi("reports:read", async () => {
  const result = await ReportService.receivablesReport();
  return ok(result);
});
