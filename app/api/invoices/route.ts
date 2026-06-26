/**
 * نقاط نهاية الفواتير (Invoices API) — المهمة 11.1.
 *
 *  - POST /api/invoices : إنشاء فاتورة مباشرة لعميل واعتمادها فوراً (billing:write).
 *
 * تولّد خدمة الفوترة رقماً فريداً للفاتورة وتسجّل تاريخ الإصدار، وتحتسب البنود والصافي،
 * وتزيد رصيد العميل المستحق بقيمة الصافي — كل ذلك داخل معاملة قاعدة بيانات واحدة.
 * تُحوَّل الأخطاء: التحقق → 400، عدم وجود العميل → 404.
 *
 * المتطلبات: 5.1 (رقم فريد وتاريخ إصدار)، 5.2 (اعتماد الفاتورة على رصيد العميل)،
 *            1.3 (فرض الصلاحيات).
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

/** جسم إنشاء فاتورة مباشرة. */
interface CreateInvoiceBody {
  customerId?: unknown;
  discountPct?: unknown;
  taxPct?: unknown;
  items?: unknown;
}

/** POST /api/invoices — إنشاء فاتورة مباشرة. */
export const POST = withApi("billing:write", async ({ request }) => {
  const body = await parseJsonBody<CreateInvoiceBody>(request);
  if (!body || typeof body !== "object") {
    return fail(INVALID_BODY_MESSAGE, 400);
  }

  if (typeof body.customerId !== "string" || body.customerId.trim() === "") {
    return fail("معرّف العميل مطلوب", 400, ["customerId"]);
  }
  if (!Array.isArray(body.items)) {
    return fail("بنود الفاتورة مطلوبة", 400, ["items"]);
  }

  const result = await BillingService.createInvoice({
    customerId: body.customerId,
    discountPct: (body.discountPct ?? 0) as number,
    taxPct: (body.taxPct ?? 0) as number,
    items: body.items as LineItemInput[],
  });

  if (BillingService.isBillingError(result)) {
    return serviceErrorResponse(result);
  }

  return ok({ invoice: result }, 201);
});
