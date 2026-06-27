/**
 * نقطة نهاية المساعد الذكي (Assistant API) — المهمة 12.
 *
 *  - POST /api/assistant : إرسال رسالة عربية للمساعد واستلام ردّه + حالة المحادثة.
 *
 * تتطلّب هذه النقطة جلسة سارية فقط (مصادقة)، إذ تُفرَض صلاحيات كل أداة على حدة داخل
 * خدمة المساعد بحسب دور المستخدم (المتطلبان 10.5, 11.6) — فلا تُقيَّد النقطة بصلاحية واحدة.
 *
 * تُمرَّر حالة المحادثة (`state`) ذهاباً وإياباً مع كل طلب لإتمام تدفّقات طلب الحقول الناقصة
 * وتأكيد العمليات المالية عبر عدة رسائل (المتطلبان 11.4, 11.5).
 *
 * المتطلبات: 10.1–10.5, 11.1–11.6.
 */
import { requireSession } from "@/lib/auth/guard";
import { getApiSession } from "@/lib/api/session";
import { fail, ok, parseJsonBody, toErrorResponse, INVALID_BODY_MESSAGE } from "@/lib/api/respond";
import { assistantService, type ConversationState } from "@/lib/assistant";

// تشغيل المسار ديناميكياً دائماً لأنه يقرأ جلسة المستخدم (headers) ويصل لقاعدة البيانات.
export const dynamic = "force-dynamic";

/** جسم طلب المساعد. */
interface AssistantRequestBody {
  message?: unknown;
  state?: unknown;
}

/** POST /api/assistant — معالجة رسالة المساعد الذكي. */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = requireSession(await getApiSession());

    const body = await parseJsonBody<AssistantRequestBody>(request);
    if (!body || typeof body !== "object") {
      return fail(INVALID_BODY_MESSAGE, 400);
    }

    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
      return fail("الرجاء إدخال رسالة.", 400);
    }

    const state =
      body.state && typeof body.state === "object"
        ? (body.state as ConversationState)
        : {};

    const result = await assistantService.handleMessage(session, message, state);
    return ok(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
