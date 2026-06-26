/**
 * نقطة نهاية مهام فني محدّد (Technician Jobs API) — المهمة 11.1.
 *
 *  - GET /api/technicians/{id}/jobs : قائمة مهام الفني وحالاتها
 *                                     (installation:read_assigned — متاح للفني).
 *
 * المتطلبات: 8.4 (عرض مهام الفني)، 1.3 (فرض الصلاحيات وقصر الوصول على المهام المسندة).
 */
import { withApi } from "@/lib/api/handler";
import { fail, ok } from "@/lib/api/respond";
import { InstallationService } from "@/lib/services/installationService";

/** GET /api/technicians/{id}/jobs — مهام الفني. */
export const GET = withApi<{ id: string }>(
  "installation:read_assigned",
  async ({ params }) => {
    const id = params.id?.trim();
    if (!id) {
      return fail("معرّف الفني مطلوب", 400, ["id"]);
    }

    const jobs = await InstallationService.getJobsByTechnician(id);
    return ok({ jobs });
  }
);
