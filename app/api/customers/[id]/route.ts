/**
 * نقطة نهاية عميل واحد (Customer Profile API) — المهمة 11.1.
 *
 *  - GET /api/customers/{id} : عرض ملف العميل (بياناته + رصيده + سجل فواتيره ومدفوعاته).
 *
 * عند عدم وجود العميل ترمي الخدمة خطأً عاماً يحوّله `toErrorResponse` إلى استجابة 404.
 *
 * المتطلبات: 2.3 (عرض بيانات العميل ورصيده وسجله)، 1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import { fail, ok } from "@/lib/api/respond";
import { CustomerService } from "@/lib/services/customerService";

/** GET /api/customers/{id} — ملف العميل الكامل. */
export const GET = withApi<{ id: string }>(
  "customers:read",
  async ({ params }) => {
    const id = params.id?.trim();
    if (!id) {
      return fail("معرّف العميل مطلوب", 400, ["id"]);
    }

    const profile = await CustomerService.getCustomer(id);
    return ok({ profile });
  }
);
