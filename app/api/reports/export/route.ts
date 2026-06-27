/**
 * نقطة نهاية تصدير التقارير (Report Export API) — المهمة 11.1.
 *
 *  - POST /api/reports/export : تصدير تقرير (مبيعات/أرباح/ذمم/مخزون) بصيغة PDF أو CSV
 *                               قابلة للطباعة أو الحفظ (reports:read).
 *
 * الجسم: { type, format, from?, to? }. تُبنى بيانات التقرير عبر خدمة التقارير ثم تُصدَّر
 * عبر وحدة التصدير، ويُعاد الملف الثنائي مع ترويسات التنزيل المناسبة.
 *
 * المتطلبات: 9.5 (تصدير التقارير)، 1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import {
  fail,
  parseJsonBody,
  serviceErrorResponse,
  INVALID_BODY_MESSAGE,
} from "@/lib/api/respond";
import { ReportService } from "@/lib/services/reportService";
import {
  exportReport,
  type ExportFormat,
  type ReportData,
} from "@/lib/services/reportExport";

// تشغيل المسار ديناميكياً دائماً لأنه يقرأ جلسة المستخدم (headers) ويصل لقاعدة البيانات.
export const dynamic = "force-dynamic";

/** جسم طلب التصدير. */
interface ExportBody {
  type?: unknown;
  format?: unknown;
  from?: unknown;
  to?: unknown;
}

const TYPES = ["sales", "profit", "receivables", "inventory"] as const;
type ReportType = (typeof TYPES)[number];

/** يحلّل تاريخاً من قيمة نصّية، ويعيد null عند عدم الصلاحية. */
function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** POST /api/reports/export — تصدير تقرير بصيغة PDF أو CSV. */
export const POST = withApi("reports:read", async ({ request }) => {
  const body = await parseJsonBody<ExportBody>(request);
  if (!body || typeof body !== "object") {
    return fail(INVALID_BODY_MESSAGE, 400);
  }

  const type = body.type as ReportType;
  if (!TYPES.includes(type)) {
    return fail("نوع التقرير غير صالح", 400, ["type"]);
  }

  const format = body.format as ExportFormat;
  if (format !== "pdf" && format !== "csv") {
    return fail("صيغة التصدير يجب أن تكون pdf أو csv", 400, ["format"]);
  }

  // بناء بيانات التقرير عبر خدمة التقارير الموحّدة.
  let reportData: ReportData;

  if (type === "sales" || type === "profit") {
    const from = parseDate(body.from);
    const to = parseDate(body.to);
    if (!from || !to) {
      return fail("النطاق الزمني (from و to) مطلوب لهذا التقرير", 400, [
        "from",
        "to",
      ]);
    }

    if (type === "sales") {
      const data = await ReportService.salesReport({ from, to });
      if (ReportService.isReportError(data)) return serviceErrorResponse(data);
      reportData = { type: "sales", range: { from, to }, data };
    } else {
      const data = await ReportService.profitReport({ from, to });
      if (ReportService.isReportError(data)) return serviceErrorResponse(data);
      reportData = { type: "profit", range: { from, to }, data };
    }
  } else if (type === "receivables") {
    reportData = { type: "receivables", data: await ReportService.receivablesReport() };
  } else {
    reportData = { type: "inventory", data: await ReportService.inventoryReport() };
  }

  const file = await exportReport(reportData, format);

  return new Response(new Blob([file.content], { type: file.mimeType }), {
    status: 200,
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
    },
  });
});
