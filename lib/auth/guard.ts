/**
 * حارس الأدوار والصلاحيات على مستوى الخادم (Server-side Guard) — المهمة 2.2.
 *
 * يوفّر أدوات لفرض المصادقة والصلاحيات داخل معالِجات مسارات الـ API (Route Handlers)،
 * بحيث لا يُنفَّذ أي إجراء إلا بجلسة سارية تملك الصلاحية المطلوبة. عند تجاوز الصلاحية
 * تُعاد الرسالة الموحّدة "غير مصرّح لك بتنفيذ هذه العملية".
 *
 * المتطلبات: 1.3 (منع التنفيذ خارج نطاق الدور على مستوى الخادم)،
 *            1.5 (رفض الجلسة المنتهية بالخمول).
 */
import { isSessionExpired } from "./auth-service";
import { authorize, UNAUTHORIZED_MESSAGE } from "./permissions";
import type { Permission, Session } from "./types";

/** سبب فشل الحارس: غياب الجلسة/انتهاؤها، أو نقص الصلاحية. */
export type GuardErrorReason = "unauthenticated" | "expired" | "forbidden";

/** خطأ يُرمى عند فشل التحقق من المصادقة أو الصلاحية. */
export class AuthorizationError extends Error {
  readonly reason: GuardErrorReason;
  /** رمز حالة HTTP المناسب: 401 لغياب/انتهاء الجلسة، 403 لنقص الصلاحية. */
  readonly status: number;

  constructor(reason: GuardErrorReason, message: string) {
    super(message);
    this.name = "AuthorizationError";
    this.reason = reason;
    this.status = reason === "forbidden" ? 403 : 401;
  }
}

/** رسالة عربية عامة عند غياب جلسة سارية. */
export const UNAUTHENTICATED_MESSAGE = "يجب تسجيل الدخول لتنفيذ هذه العملية";
/** رسالة عربية عند انتهاء الجلسة بالخمول (المتطلب 1.5). */
export const SESSION_EXPIRED_MESSAGE =
  "انتهت الجلسة بسبب عدم النشاط، يرجى إعادة تسجيل الدخول";

/**
 * يتأكد من وجود جلسة سارية غير منتهية بالخمول، أو يرمي `AuthorizationError`.
 * @returns الجلسة نفسها عند سريانها.
 */
export function requireSession(
  session: Session | null | undefined,
  now: Date = new Date()
): Session {
  if (!session) {
    throw new AuthorizationError("unauthenticated", UNAUTHENTICATED_MESSAGE);
  }
  if (isSessionExpired(session, now)) {
    throw new AuthorizationError("expired", SESSION_EXPIRED_MESSAGE);
  }
  return session;
}

/**
 * يتأكد من أن الجلسة سارية وتملك الصلاحية المطلوبة، وإلا يرمي `AuthorizationError`
 * (المتطلب 1.3). يُستخدم في بداية كل معالِج مسار يحتاج حماية.
 */
export function requirePermission(
  session: Session | null | undefined,
  permission: Permission,
  now: Date = new Date()
): Session {
  const active = requireSession(session, now);
  if (!authorize(active, permission)) {
    throw new AuthorizationError("forbidden", UNAUTHORIZED_MESSAGE);
  }
  return active;
}

/**
 * يغلّف معالِج مسار Next.js بفرض صلاحية محددة. عند الفشل يعيد استجابة JSON
 * بالرسالة العربية ورمز الحالة المناسب دون تنفيذ المعالِج.
 *
 * @example
 * export const POST = withPermission("billing:write", async (req, session) => {
 *   // session مضمونة السريان وتملك الصلاحية
 *   return Response.json({ ok: true });
 * });
 */
export function withPermission<Args extends unknown[]>(
  permission: Permission,
  handler: (
    request: Request,
    session: Session,
    ...args: Args
  ) => Promise<Response> | Response,
  getSession: (request: Request) => Promise<Session | null> | Session | null
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      const session = await getSession(request);
      const active = requirePermission(session, permission);
      return await handler(request, active, ...args);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return Response.json(
          { error: error.message },
          { status: error.status }
        );
      }
      throw error;
    }
  };
}
