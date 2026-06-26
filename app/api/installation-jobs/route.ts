/**
 * نقاط نهاية مهام التركيب (Installation Jobs API) — المهمة 11.1.
 *
 *  - POST /api/installation-jobs : إنشاء مهمة تركيب مرتبطة بعميل أو فاتورة بحالة "مجدولة"
 *                                  (installation:write).
 *
 * يجب ربط المهمة بعميل أو فاتورة على الأقل؛ وإلا تُعاد 400 بالعربية.
 *
 * المتطلبات: 8.1 (إنشاء المهمة بالحالة الابتدائية)، 1.3 (فرض الصلاحيات).
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

/** جسم إنشاء مهمة تركيب. */
interface CreateJobBody {
  customerId?: unknown;
  invoiceId?: unknown;
}

/** POST /api/installation-jobs — إنشاء مهمة تركيب. */
export const POST = withApi("installation:write", async ({ request }) => {
  const body = await parseJsonBody<CreateJobBody>(request);
  if (!body || typeof body !== "object") {
    return fail(INVALID_BODY_MESSAGE, 400);
  }

  const result = await InstallationService.createJob({
    customerId:
      typeof body.customerId === "string" ? body.customerId : undefined,
    invoiceId: typeof body.invoiceId === "string" ? body.invoiceId : undefined,
  });

  if (isInstallationError(result)) {
    return serviceErrorResponse(result);
  }

  return ok({ job: result }, 201);
});
