/**
 * نقطة نهاية تقرير الأرباح (Profit Report API) — المهمة 11.1.
 *
 *  - GET /api/reports/profit?from=...&to=... : الربح = المبيعات − (المصروفات + تكلفة
 *                                              البضاعة المباعة) ضمن نطاق زمني (reports:read).
 *
 * المتطلبات: 9.2 (تقرير الأرباح)، 1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import { fail, ok, serviceErrorResponse } from "@/lib/api/respond";
import { ReportService } from "@/lib/services/reportService";

// تشغيل المسار ديناميكياً دائماً لأنه يقرأ جلسة المستخدم (headers) ويصل لقاعدة البيانات.
export const dynamic = "force-dynamic";

/** يحلّل قيمة تاريخ من نص الاستعلام، ويعيد null عند غيابها أو عدم صلاحيتها. */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** GET /api/reports/profit — تقرير الأرباح ضمن نطاق زمني. */
export const GET = withApi("reports:read", async ({ request }) => {
  const params = new URL(request.url).searchParams;
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"));

  if (!from || !to) {
    return fail("النطاق الزمني (from و to) مطلوب وبصيغة تاريخ صالحة", 400, [
      "from",
      "to",
    ]);
  }

  const result = await ReportService.profitReport({ from, to });
  if (ReportService.isReportError(result)) {
    return serviceErrorResponse(result);
  }

  return ok(result);
});
