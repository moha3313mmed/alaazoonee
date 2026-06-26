/**
 * نقطة نهاية تحويل عرض سعر إلى فاتورة (Quote Conversion API) — المهمة 11.1.
 *
 *  - POST /api/quotes/{id}/convert : تحويل عرض سعر معتمَد إلى فاتورة مع الاحتفاظ بالبنود
 *                                    والقيم واعتمادها على رصيد العميل (billing:write).
 *
 * تُنفَّذ خطوات التحويل (إنشاء الفاتورة + نسخ البنود + تحديث حالة العرض + زيادة رصيد العميل)
 * داخل معاملة قاعدة بيانات واحدة في خدمة الفوترة. تُحوَّل الأخطاء: عدم وجود العرض → 404،
 * تعذّر التحويل في الحالة الحالية → 409.
 *
 * المتطلبات: 4.5 (تحويل العرض إلى فاتورة)، 5.2 (اعتماد الفاتورة على رصيد العميل)،
 *            1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import { fail, ok, serviceErrorResponse } from "@/lib/api/respond";
import { BillingService } from "@/lib/services/billingService";

/** POST /api/quotes/{id}/convert — تحويل عرض السعر إلى فاتورة. */
export const POST = withApi<{ id: string }>(
  "billing:write",
  async ({ params }) => {
    const id = params.id?.trim();
    if (!id) {
      return fail("معرّف عرض السعر مطلوب", 400, ["id"]);
    }

    const result = await BillingService.convertQuoteToInvoice(id);
    if (BillingService.isBillingError(result)) {
      return serviceErrorResponse(result);
    }

    return ok({ invoice: result }, 201);
  }
);
