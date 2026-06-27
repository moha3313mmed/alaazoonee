/**
 * نقطة نهاية مدفوعات الفاتورة (Invoice Payments API) — المهمة 11.1.
 *
 *  - POST /api/invoices/{id}/payments : تسجيل دفعة على فاتورة (billing:write).
 *
 * تخصم الخدمة قيمة الدفعة من المبلغ المتبقي، وتعيد تصنيف حالة الفاتورة، وتقلّل رصيد العميل
 * — داخل معاملة قاعدة بيانات واحدة. تُرفض الدفعة التي تتجاوز المتبقي (409)، والقيمة غير
 * الصالحة (400)، وغياب الفاتورة (404).
 *
 * المتطلبات: 5.3/5.4/5.5/5.6 (تسجيل الدفعة والتصنيف والرفض)، 7.2 (تماسك العمليات
 *            متعددة الخطوات داخل معاملة)، 1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import {
  fail,
  ok,
  parseJsonBody,
  serviceErrorResponse,
  INVALID_BODY_MESSAGE,
} from "@/lib/api/respond";
import { BillingService } from "@/lib/services/billingService";

// تشغيل المسار ديناميكياً دائماً لأنه يقرأ جلسة المستخدم (headers) ويصل لقاعدة البيانات.
export const dynamic = "force-dynamic";

/** جسم تسجيل دفعة. */
interface PaymentBody {
  amount?: unknown;
}

/** POST /api/invoices/{id}/payments — تسجيل دفعة على الفاتورة. */
export const POST = withApi<{ id: string }>(
  "billing:write",
  async ({ request, params }) => {
    const id = params.id?.trim();
    if (!id) {
      return fail("معرّف الفاتورة مطلوب", 400, ["id"]);
    }

    const body = await parseJsonBody<PaymentBody>(request);
    if (!body || typeof body !== "object") {
      return fail(INVALID_BODY_MESSAGE, 400);
    }

    const amount = body.amount;
    if (typeof amount !== "number" && typeof amount !== "string") {
      return fail("قيمة الدفعة مطلوبة", 400, ["amount"]);
    }

    const result = await BillingService.recordPayment(id, amount);
    if (BillingService.isBillingError(result)) {
      return serviceErrorResponse(result);
    }

    return ok({ invoice: result });
  }
);
