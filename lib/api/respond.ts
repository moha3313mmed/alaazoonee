/**
 * أدوات استجابة طبقة الـ API الموحّدة — المهمة 11.1.
 *
 * توفّر هذه الوحدة:
 *  - بناء استجابات JSON ناجحة وأخطاء برسائل عربية موحّدة.
 *  - تحويل أخطاء الخدمات (سواء كانت اتحادات مُميَّزة `{ error, message }` أو أصناف
 *    استثناءات مثل `SupplierValidationError`) إلى رموز حالة HTTP المناسبة:
 *      400 (تحقق المدخلات)، 404 (غير موجود)، 409 (تعارض/نقص رصيد).
 *  - تحليل جسم الطلب JSON بأمان.
 *
 * مبدأ التصميم: نقطة تجميع واحدة لتعيين الأخطاء إلى استجابات HTTP، فلا يكرّر كل معالِج
 * مسار هذا المنطق، وتظل الرسائل عربية ومتّسقة (سياسة معالجة الأخطاء في وثيقة التصميم).
 */
import { AuthorizationError } from "@/lib/auth/guard";
import {
  SupplierNotFoundError,
  SupplierValidationError,
} from "@/lib/services/supplierService";
import { ExpenseValidationError } from "@/lib/services/expenseService";

/** الرسالة العربية العامة عند خطأ غير متوقّع (لا تكشف تفاصيل داخلية). */
export const GENERIC_ERROR_MESSAGE = "حدث خطأ، يرجى المحاولة لاحقاً";
/** الرسالة العربية عند تعذّر قراءة جسم الطلب JSON. */
export const INVALID_BODY_MESSAGE = "صيغة الطلب غير صالحة";

/**
 * شكل خطأ الخدمة المُعاد كاتحاد مُميَّز (discriminated union) في خدمات الفوترة والمخزون
 * والتركيب والتقارير والعملاء.
 */
export interface ServiceUnionError {
  error: string;
  message: string;
  fields?: string[];
}

/** يتحقق ما إذا كانت القيمة خطأ خدمة باتحاد مُميَّز يحمل رمزاً ورسالة. */
export function isServiceUnionError(value: unknown): value is ServiceUnionError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string" &&
    "message" in value &&
    typeof (value as { message: unknown }).message === "string"
  );
}

/** تعيين رموز أخطاء الخدمات إلى رموز حالة HTTP. */
const STATUS_BY_CODE: Record<string, number> = {
  // تحقق المدخلات
  VALIDATION: 400,
  VALIDATION_ERROR: 400,
  // غير موجود
  NOT_FOUND: 404,
  // تعارض/قاعدة عمل
  CONFLICT: 409,
  INSUFFICIENT_STOCK: 409,
};

/** يبني استجابة JSON ناجحة. */
export function ok(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** يبني استجابة خطأ JSON برسالة عربية ورمز حالة، مع الحقول الناقصة اختيارياً. */
export function fail(
  message: string,
  status: number,
  fields?: string[]
): Response {
  return Response.json(
    { error: message, ...(fields && fields.length > 0 ? { fields } : {}) },
    { status }
  );
}

/** يحوّل خطأ خدمة باتحاد مُميَّز إلى استجابة HTTP بالرمز المناسب. */
export function serviceErrorResponse(error: ServiceUnionError): Response {
  const status = STATUS_BY_CODE[error.error] ?? 400;
  return fail(error.message, status, error.fields);
}

/**
 * يحلّل جسم الطلب كـ JSON، ويعيد `null` عند فشل التحليل (جسم فارغ أو غير صالح)
 * ليتمكّن المعالِج من إعادة 400 برسالة عربية.
 */
export async function parseJsonBody<T = unknown>(
  request: Request
): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/**
 * يحوّل أي خطأ مُلتقَط في معالِج المسار إلى استجابة HTTP مناسبة:
 *  - `AuthorizationError`: 401/403 برسالته العربية.
 *  - أخطاء الخدمات المرمية كاستثناءات (موردون/مصروفات): 404/400.
 *  - أخطاء "غير موجود" العامة (مثل رمي getCustomer): 404.
 *  - ما عدا ذلك: 500 برسالة عامة دون كشف التفاصيل.
 */
export function toErrorResponse(error: unknown): Response {
  if (error instanceof AuthorizationError) {
    return fail(error.message, error.status);
  }
  if (error instanceof SupplierNotFoundError) {
    return fail(error.message, 404);
  }
  if (error instanceof SupplierValidationError) {
    return fail(error.message, 400, error.fields);
  }
  if (error instanceof ExpenseValidationError) {
    return fail(error.message, 400, error.fields);
  }
  // خدمة العملاء ترمي خطأً عاماً عند عدم وجود العميل.
  if (error instanceof Error && error.message === "العميل غير موجود") {
    return fail(error.message, 404);
  }

  // خطأ غير متوقّع: سجّله داخلياً وأعد رسالة عامة آمنة.
  console.error("[API] خطأ غير متوقّع:", error);
  return fail(GENERIC_ERROR_MESSAGE, 500);
}
