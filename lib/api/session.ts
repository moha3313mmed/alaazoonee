/**
 * جالب جلسة الـ API (Server-side Session Getter) — المهمة 11.1.
 *
 * يقرأ جلسة Auth.js (NextAuth) المعتمِدة على رمز JWT عبر `getServerSession(authOptions)`
 * ويحوّلها إلى نوع `Session` الذي يتوقّعه حارس الصلاحيات (`requirePermission`/`withPermission`)
 * في طبقة الخدمات والحارس. بذلك تُفرَض المصادقة والصلاحيات على كل نقطة نهاية باستخدام
 * نفس عقد الجلسة الموحّد.
 *
 * ملاحظة بشأن الخمول (المتطلب 1.5): يفرض NextAuth انتهاء الجلسة عبر `maxAge` (30 دقيقة)
 * فيعيد `getServerSession` قيمة فارغة للرموز المنتهية. لذا عند وجود جلسة سارية نضبط
 * `lastActivityAt` على اللحظة الحالية، فيتكامل فرض الخمول بين NextAuth وحارس الجلسة دون
 * رفض مزدوج.
 *
 * المتطلبات: 1.3 (فرض الصلاحيات على مستوى الخادم في طبقة الـ API).
 */
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth/config";
import type { Session } from "@/lib/auth/types";

/**
 * يقرأ جلسة المستخدم الحالية من NextAuth ويحوّلها إلى `Session` الموحّدة،
 * أو يعيد `null` عند غياب جلسة سارية.
 */
export async function getApiSession(): Promise<Session | null> {
  const nextAuthSession = await getServerSession(authOptions);
  const user = nextAuthSession?.user;

  if (!user?.id || !user.role) {
    return null;
  }

  const now = new Date();
  return {
    userId: user.id,
    username: user.name ?? "",
    role: user.role,
    issuedAt: now,
    lastActivityAt: now,
  };
}

export default getApiSession;
