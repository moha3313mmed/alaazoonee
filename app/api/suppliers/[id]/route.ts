/**
 * نقطة نهاية مورد واحد (Supplier Profile API) — المهمة 11.1.
 *
 *  - GET /api/suppliers/{id} : عرض سجل المورد (بياناته + رصيده + مشترياته وإجماليها).
 *
 * تعيد الخدمة `null` عند عدم وجود المورد، فنرجع 404 برسالة عربية.
 *
 * المتطلبات: 3.4 (عرض سجل المورد ورصيده)، 1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import { fail, ok } from "@/lib/api/respond";
import { SupplierService } from "@/lib/services/supplierService";

/** GET /api/suppliers/{id} — سجل المورد الكامل. */
export const GET = withApi<{ id: string }>(
  "suppliers:read",
  async ({ params }) => {
    const id = params.id?.trim();
    if (!id) {
      return fail("معرّف المورد مطلوب", 400, ["id"]);
    }

    const profile = await SupplierService.getSupplier(id);
    if (!profile) {
      return fail("المورد غير موجود", 404);
    }

    return ok({ profile });
  }
);
