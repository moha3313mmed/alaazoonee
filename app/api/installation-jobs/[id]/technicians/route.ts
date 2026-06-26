/**
 * نقطة نهاية تعيين الفنيين لمهمة تركيب (Assign Technicians API) — المهمة 11.1.
 *
 *  - POST /api/installation-jobs/{id}/technicians : تعيين فني/فنيين وتسجيل موعد التنفيذ
 *                                                   المجدول (installation:write).
 *
 * كشف تعارض المواعيد غير مانع: يكتمل التعيين دائماً وتُعاد تنبيهات التعارض ضمن `warnings`.
 * تُحوَّل الأخطاء: التحقق → 400، عدم وجود المهمة/الفني → 404. تُنفَّذ الخطوات داخل معاملة.
 *
 * المتطلبات: 8.2 (تعيين الفنيين وتسجيل الموعد)، 8.5 (تنبيه التعارض دون منع)،
 *            1.3 (فرض الصلاحيات).
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
  InstallationService,
  isInstallationError,
} from "@/lib/services/installationService";

/** جسم تعيين الفنيين. */
interface AssignBody {
  technicianIds?: unknown;
  scheduledAt?: unknown;
}

/** POST /api/installation-jobs/{id}/technicians — تعيين الفنيين. */
export const POST = withApi<{ id: string }>(
  "installation:write",
  async ({ request, params }) => {
    const id = params.id?.trim();
    if (!id) {
      return fail("معرّف المهمة مطلوب", 400, ["id"]);
    }

    const body = await parseJsonBody<AssignBody>(request);
    if (!body || typeof body !== "object") {
      return fail(INVALID_BODY_MESSAGE, 400);
    }

    if (
      !Array.isArray(body.technicianIds) ||
      body.technicianIds.some((value) => typeof value !== "string")
    ) {
      return fail("قائمة الفنيين مطلوبة", 400, ["technicianIds"]);
    }

    if (typeof body.scheduledAt !== "string") {
      return fail("تاريخ التنفيذ المجدول مطلوب", 400, ["scheduledAt"]);
    }
    const scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      return fail("صيغة تاريخ التنفيذ المجدول غير صالحة", 400, ["scheduledAt"]);
    }

    const result = await InstallationService.assignTechnicians(
      id,
      body.technicianIds as string[],
      scheduledAt
    );

    if (isInstallationError(result)) {
      return serviceErrorResponse(result);
    }

    return ok({ job: result.job, warnings: result.warnings });
  }
);
