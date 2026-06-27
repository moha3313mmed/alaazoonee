/**
 * نقاط نهاية الموردين (Suppliers API) — المهمة 11.1.
 *
 *  - GET  /api/suppliers?q=... : البحث عن الموردين بالاسم أو الهاتف (suppliers:read).
 *  - POST /api/suppliers       : إنشاء مورد جديد برصيد ابتدائي = 0 (suppliers:write).
 *
 * تعيد خدمة الموردين خطأ التحقق كصنف `SupplierValidationError`؛ نحوّله هنا إلى 400.
 *
 * المتطلبات: 1.3 (فرض الصلاحيات)، 3.1/3.2 (إنشاء المورد والتحقق من مدخلاته).
 */
import { withApi } from "@/lib/api/handler";
import {
  fail,
  ok,
  parseJsonBody,
  INVALID_BODY_MESSAGE,
} from "@/lib/api/respond";
import {
  SupplierService,
  isSupplierValidationError,
} from "@/lib/services/supplierService";

// تشغيل المسار ديناميكياً دائماً لأنه يقرأ جلسة المستخدم (headers) ويصل لقاعدة البيانات.
export const dynamic = "force-dynamic";

/** GET /api/suppliers — البحث عن الموردين. */
export const GET = withApi("suppliers:read", async ({ request }) => {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const suppliers = await SupplierService.searchSuppliers(query);
  return ok({ suppliers });
});

/** جسم إنشاء مورد. */
interface CreateSupplierBody {
  name?: unknown;
  phone?: unknown;
}

/** POST /api/suppliers — إنشاء مورد جديد. */
export const POST = withApi("suppliers:write", async ({ request }) => {
  const body = await parseJsonBody<CreateSupplierBody>(request);
  if (!body || typeof body !== "object") {
    return fail(INVALID_BODY_MESSAGE, 400);
  }

  const result = await SupplierService.createSupplier({
    name: typeof body.name === "string" ? body.name : "",
    phone: typeof body.phone === "string" ? body.phone : "",
  });

  if (isSupplierValidationError(result)) {
    return fail(result.message, 400, result.fields);
  }

  return ok({ supplier: result }, 201);
});
