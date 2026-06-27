/**
 * نقطة نهاية الحركات المالية على المورد (Supplier Transactions API) — المهمة 11.1.
 *
 *  - POST /api/suppliers/{id}/transactions : تسجيل عملية شراء أو دفعة على المورد.
 *
 * يحدّد الحقل `type` نوع الحركة:
 *   - "purchase": زيادة رصيد المورد (المبلغ المستحق له) عبر `recordPurchase`.
 *   - "payment" : إنقاص رصيد المورد عبر `recordPayment`.
 *
 * تُنفَّذ كل حركة ذرّياً داخل معاملة في خدمة الموردين، وتُحوَّل أخطاؤها (تحقّق/عدم وجود)
 * إلى 400/404 بالعربية.
 *
 * المتطلبات: 3.3 (تحديث رصيد المورد عند الشراء/الدفع)، 1.3 (فرض الصلاحيات).
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

/** جسم تسجيل حركة على المورد. */
interface TransactionBody {
  type?: unknown;
  amount?: unknown;
}

/** POST /api/suppliers/{id}/transactions — تسجيل شراء/دفعة. */
export const POST = withApi<{ id: string }>(
  "suppliers:write",
  async ({ request, params }) => {
    const id = params.id?.trim();
    if (!id) {
      return fail("معرّف المورد مطلوب", 400, ["id"]);
    }

    const body = await parseJsonBody<TransactionBody>(request);
    if (!body || typeof body !== "object") {
      return fail(INVALID_BODY_MESSAGE, 400);
    }

    const type = body.type;
    if (type !== "purchase" && type !== "payment") {
      return fail("نوع الحركة يجب أن يكون purchase أو payment", 400, ["type"]);
    }

    const amount = body.amount;
    if (typeof amount !== "number" && typeof amount !== "string") {
      return fail("قيمة المبلغ مطلوبة", 400, ["amount"]);
    }

    const result =
      type === "purchase"
        ? await SupplierService.recordPurchase(id, amount)
        : await SupplierService.recordPayment(id, amount);

    if (isSupplierValidationError(result)) {
      return fail(result.message, 400, result.fields);
    }

    return ok({ supplier: result });
  }
);
