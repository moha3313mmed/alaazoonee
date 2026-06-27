/**
 * نقاط نهاية العملاء (Customers API) — المهمة 11.1.
 *
 *  - GET  /api/customers?q=...  : البحث عن العملاء بالاسم أو الهاتف (customers:read).
 *  - POST /api/customers        : إنشاء عميل جديد (customers:write).
 *
 * تُفرَض الصلاحيات عبر `withApi`، وتُحوَّل أخطاء التحقق من خدمة العملاء إلى استجابة 400
 * بالعربية. تنفّذ خدمة العملاء قواعد التحقق وإنشاء الرصيد الابتدائي = 0.
 *
 * المتطلبات: 2.4 (تحديث/إدارة بيانات العملاء عبر الخدمة الموحّدة)، 1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import {
  fail,
  ok,
  parseJsonBody,
  serviceErrorResponse,
  INVALID_BODY_MESSAGE,
} from "@/lib/api/respond";
import { CustomerService } from "@/lib/services/customerService";

// تشغيل المسار ديناميكياً دائماً لأنه يقرأ جلسة المستخدم (headers) ويصل لقاعدة البيانات.
export const dynamic = "force-dynamic";

/** GET /api/customers — البحث عن العملاء (q فارغة تُعيد الجميع). */
export const GET = withApi("customers:read", async ({ request }) => {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const customers = await CustomerService.searchCustomers(query);
  return ok({ customers });
});

/** جسم إنشاء عميل. */
interface CreateCustomerBody {
  name?: unknown;
  phone?: unknown;
}

/** POST /api/customers — إنشاء عميل جديد. */
export const POST = withApi("customers:write", async ({ request }) => {
  const body = await parseJsonBody<CreateCustomerBody>(request);
  if (!body || typeof body !== "object") {
    return fail(INVALID_BODY_MESSAGE, 400);
  }

  const result = await CustomerService.createCustomer({
    name: typeof body.name === "string" ? body.name : "",
    phone: typeof body.phone === "string" ? body.phone : "",
  });

  if (CustomerService.isValidationError(result)) {
    return serviceErrorResponse({
      error: result.error,
      message: result.message,
      fields: result.fields,
    });
  }

  return ok({ customer: result }, 201);
});
