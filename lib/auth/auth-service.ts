/**
 * خدمة المصادقة وإدارة الجلسات (AuthService) — المهمة 2.1.
 *
 * تتولّى التحقق من بيانات الاعتماد عند تسجيل الدخول، وإنشاء جلسة مرتبطة بالدور،
 * ورفض الاعتماد الخاطئ برسالة عامة بالعربية، وفرض انتهاء الجلسة بعد 30 دقيقة من الخمول،
 * وتفويض الصلاحيات عبر مصفوفة الأدوار.
 *
 * المتطلبات: 1.1 (جلسة مرتبطة بالدور)، 1.2 (رفض الاعتماد الخاطئ برسالة عربية)،
 *            1.3 (التفويض)، 1.5 (انتهاء الجلسة بعد 30 دقيقة خمول).
 */
import prisma from "@/lib/db/client";
import { verifyPassword } from "./password";
import { authorize as authorizePermission } from "./permissions";
import {
  ROLE_FROM_PRISMA,
  type AuthError,
  type PrismaRole,
  type Session,
} from "./types";

/** مدة الخمول المسموح بها قبل انتهاء الجلسة بالملّي ثانية (30 دقيقة — المتطلب 1.5). */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** الرسالة العامة عند فشل المصادقة دون كشف السبب (المتطلب 1.2). */
export const INVALID_CREDENTIALS_MESSAGE =
  "اسم المستخدم أو كلمة المرور غير صحيحة";

/**
 * يتحقق من اسم المستخدم وكلمة المرور وينشئ جلسة مرتبطة بالدور عند النجاح،
 * أو يعيد خطأ مصادقة عاماً عند الفشل (المتطلبات 1.1, 1.2).
 *
 * ملاحظة أمنية: نعيد الرسالة العامة نفسها سواء كان المستخدم غير موجود، أو غير مفعّل،
 * أو كلمة المرور خاطئة — حتى لا نكشف أي معلومة تساعد في تخمين الحسابات.
 */
export async function login(
  username: string,
  password: string,
  now: Date = new Date()
): Promise<Session | AuthError> {
  const invalid: AuthError = { ok: false, error: INVALID_CREDENTIALS_MESSAGE };

  if (!username || !password) {
    return invalid;
  }

  const user = await prisma.user.findUnique({
    where: { username },
  });

  if (!user || !user.isActive) {
    return invalid;
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    return invalid;
  }

  return {
    userId: user.id,
    username: user.username,
    role: ROLE_FROM_PRISMA[user.role as PrismaRole],
    issuedAt: now,
    lastActivityAt: now,
  };
}

/**
 * يحدد ما إذا انتهت الجلسة بسبب الخمول (المتطلب 1.5).
 * تنتهي الجلسة عندما يتجاوز الفارق بين الوقت الحالي وآخر نشاط 30 دقيقة.
 */
export function isSessionExpired(
  session: Session,
  now: Date = new Date()
): boolean {
  const idleMs = now.getTime() - session.lastActivityAt.getTime();
  return idleMs > SESSION_IDLE_TIMEOUT_MS;
}

/**
 * يجدّد وقت آخر نشاط للجلسة (يُستدعى عند كل طلب مصرّح به لإعادة ضبط مؤقّت الخمول).
 */
export function touchSession(session: Session, now: Date = new Date()): Session {
  return { ...session, lastActivityAt: now };
}

/**
 * كائن خدمة المصادقة المطابق لعقد `AuthService` في وثيقة التصميم.
 * يتيح الاستيراد إما كدوال مفردة أو ككائن خدمة موحّد.
 *
 * ملاحظة: `authorize` يُفوَّض إلى مصفوفة الصلاحيات في `permissions.ts` (المتطلب 1.3)
 * ويُصدَّر مستقلاً من هناك لتفادي تكرار الاسم في نقطة التصدير الموحّدة.
 */
export const AuthService = {
  login,
  authorize: authorizePermission,
  isSessionExpired,
  touchSession,
};
