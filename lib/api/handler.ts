/**
 * مغلّف معالِجات مسارات الـ API (Route Handler Wrapper) — المهمة 11.1.
 *
 * يوحّد على كل نقطة نهاية: قراءة الجلسة (NextAuth/JWT) ثم فرض المصادقة والصلاحية المطلوبة
 * عبر حارس الأدوار (`requirePermission`)، ثم تنفيذ منطق المعالِج، مع توجيه كل الأخطاء إلى
 * نقطة تحويل واحدة (`toErrorResponse`) تُنتج رسائل عربية ورموز حالة HTTP صحيحة.
 *
 * بذلك يكتفي كل معالِج بالتعبير عن منطق العمل، بينما تُطبَّق المصادقة والصلاحيات وتحقّق
 * الأخطاء بصورة موحّدة (مبدأ "مصدر واحد للحقيقة" على مستوى الـ API).
 *
 * المتطلبات: 1.3 (فرض الصلاحيات على مستوى الخادم لكل نقطة نهاية).
 */
import { requirePermission } from "@/lib/auth/guard";
import type { Permission, Session } from "@/lib/auth/types";

import { getApiSession } from "./session";
import { toErrorResponse } from "./respond";

/** سياق Next.js لمسار ديناميكي (مثل `[id]`). */
export interface RouteContext<P = Record<string, string>> {
  params: P;
}

/** وسائط معالِج الـ API بعد فرض الصلاحية. */
export interface ApiHandlerArgs<P> {
  request: Request;
  /** الجلسة المضمونة السريان والمالكة للصلاحية المطلوبة. */
  session: Session;
  /** معاملات المسار الديناميكي (تكون فارغة للمسارات الثابتة). */
  params: P;
}

/**
 * يغلّف معالِج مسار بفرض صلاحية محددة وتوحيد معالجة الأخطاء.
 *
 * @param permission الصلاحية المطلوبة لتنفيذ المعالِج.
 * @param handler منطق العمل؛ يتلقّى الطلب والجلسة ومعاملات المسار.
 *
 * @example
 * export const POST = withApi("customers:write", async ({ request }) => {
 *   const body = await parseJsonBody(request);
 *   // ...
 * });
 */
export function withApi<P = Record<string, string>>(
  permission: Permission,
  handler: (args: ApiHandlerArgs<P>) => Promise<Response> | Response
) {
  return async (
    request: Request,
    context?: RouteContext<P>
  ): Promise<Response> => {
    try {
      const session = await getApiSession();
      const active = requirePermission(session, permission);
      const params = (context?.params ?? {}) as P;
      return await handler({ request, session: active, params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

export default withApi;
