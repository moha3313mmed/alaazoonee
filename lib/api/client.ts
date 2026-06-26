/**
 * عميل الـ API لجهة المتصفّح (Client-side API Fetcher) — المهمة 13.1.
 *
 * مغلّف موحّد حول `fetch` تستخدمه خطّافات TanStack Query في كل الشاشات لاستهلاك نقاط
 * نهاية الـ API. يوحّد:
 *  - إرسال/استقبال JSON مع ترويسات صحيحة.
 *  - تحويل استجابات الخطأ (التي تحمل رسالة عربية في الحقل `error`) إلى استثناء
 *    `ApiError` يحمل الرسالة العربية ورمز الحالة والحقول الناقصة، لعرضها في الواجهة.
 *
 * ملاحظة: تُعيد طبقة الـ API القيم المالية من نوع Decimal على هيئة سلاسل نصّية (JSON)،
 * لذا تُحوَّل عند العرض عبر `toNumber` في وحدة التنسيق.
 */

/** خطأ API يحمل الرسالة العربية ورمز الحالة والحقول الناقصة (إن وُجدت). */
export class ApiError extends Error {
  readonly status: number;
  readonly fields?: string[];

  constructor(message: string, status: number, fields?: string[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fields = fields;
  }
}

/** الرسالة الافتراضية عند غياب رسالة خطأ من الخادم. */
const FALLBACK_ERROR = "حدث خطأ، يرجى المحاولة لاحقاً";

/**
 * يرسل طلباً إلى نقطة نهاية الـ API ويُعيد جسم الاستجابة محلَّلاً، أو يرمي `ApiError`
 * عند فشل الطلب (رمز حالة غير ناجح).
 */
export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await response.text();
  const body = text ? safeParse(text) : null;

  if (!response.ok) {
    const message =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ?? FALLBACK_ERROR;
    const fields =
      body && typeof body === "object" && "fields" in body
        ? ((body as { fields?: string[] }).fields ?? undefined)
        : undefined;
    throw new ApiError(message, response.status, fields);
  }

  return body as T;
}

/** GET قصير. */
export function apiGet<T>(url: string): Promise<T> {
  return apiFetch<T>(url, { method: "GET" });
}

/** POST قصير بجسم JSON. */
export function apiPost<T>(url: string, body?: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: "POST",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** PATCH قصير بجسم JSON. */
export function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  return apiFetch<T>(url, {
    method: "PATCH",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** يحلّل JSON بأمان دون رمي استثناء (يعيد null عند الفشل). */
function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
