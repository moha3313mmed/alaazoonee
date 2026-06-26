/**
 * نقطة نهاية تحديث حالة مهمة التركيب (Update Job Status API) — المهمة 11.1.
 *
 *  - PATCH /api/installation-jobs/{id}/status : تحديث حالة المهمة ضمن القيم المسموحة
 *                                               (installation:update_status — متاح للفني).
 *
 * القيم المسموحة: SCHEDULED / IN_PROGRESS / COMPLETED / CANCELLED. تُحوَّل الأخطاء:
 * حالة غير صالحة → 400، عدم وجود المهمة → 404.
 *
 * المتطلبات: 8.3 (تحديث الحالة ضمن القيم المسموحة)، 1.3 (فرض الصلاحيات).
 */
import { JobStatus } from "@prisma/client";

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

/** جسم تحديث الحالة. */
interface StatusBody {
  status?: unknown;
}

/** PATCH /api/installation-jobs/{id}/status — تحديث حالة المهمة. */
export const PATCH = withApi<{ id: string }>(
  "installation:update_status",
  async ({ request, params }) => {
    const id = params.id?.trim();
    if (!id) {
      return fail("معرّف المهمة مطلوب", 400, ["id"]);
    }

    const body = await parseJsonBody<StatusBody>(request);
    if (!body || typeof body !== "object") {
      return fail(INVALID_BODY_MESSAGE, 400);
    }

    const result = await InstallationService.updateStatus(
      id,
      body.status as JobStatus
    );

    if (isInstallationError(result)) {
      return serviceErrorResponse(result);
    }

    return ok({ job: result });
  }
);
