/**
 * نقاط نهاية عروض الأسعار (Quotes API) — المهمة 11.1.
 *
 *  - POST /api/quotes : إنشاء عرض سعر ببنوده ونسب الخصم/الضريبة (billing:write).
 *
 * تحتسب خدمة الفوترة سعر كل بند (بالقياس/بالقطعة) وترفض القيم غير الصالحة (≤ 0)،
 * وتتحقق من نسب الخصم/الضريبة. تُحوَّل أخطاؤها: التحقق → 400.
 *
 * المتطلبات: 4.1/4.4/4.6 (التسعير والتحقق)، 1.3 (فرض الصلاحيات).
 */
import type { LineItemInput } from "@/lib/services/billingService";

import { withApi } from "@/lib/api/handler";
import {
  fail,
  ok,
  parseJsonBody,
  serviceErrorResponse,
  INVALID_BODY_MESSAGE,
} from "@/lib/api/respond";
import { BillingService } from "@/lib/services/billingService";

/** جسم إنشاء عرض سعر. */
interface CreateQuoteBody {
  customerId?: unknown;
  discountPct?: unknown;
  taxPct?: unknown;
  items?: unknown;
}

/** POST /api/quotes — إنشاء عرض سعر جديد. */
export const POST = withApi("billing:write", async ({ request }) => {
  const body = await parseJsonBody<CreateQuoteBody>(request);
  if (!body || typeof body !== "object") {
    return fail(INVALID_BODY_MESSAGE, 400);
  }

  if (typeof body.customerId !== "string" || body.customerId.trim() === "") {
    return fail("معرّف العميل مطلوب", 400, ["customerId"]);
  }
  if (!Array.isArray(body.items)) {
    return fail("بنود عرض السعر مطلوبة", 400, ["items"]);
  }

  const result = await BillingService.createQuote({
    customerId: body.customerId,
    discountPct: (body.discountPct ?? 0) as number,
    taxPct: (body.taxPct ?? 0) as number,
    items: body.items as LineItemInput[],
  });

  if (BillingService.isBillingError(result)) {
    return serviceErrorResponse(result);
  }

  return ok({ quote: result }, 201);
});
