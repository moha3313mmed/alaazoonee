/**
 * إعداد Auth.js (NextAuth) بجلسات JWT وحقل الدور — المهمة 2.1.
 *
 * يستخدم مزوّد بيانات الاعتماد (Credentials) للتحقق من اسم المستخدم وكلمة المرور عبر
 * `AuthService.login`، ويعتمد استراتيجية الجلسات JWT مع تضمين الدور (role) ومعرّف
 * المستخدم في الرمز والجلسة. تُضبط مدة الجلسة على 30 دقيقة لتطابق سياسة الخمول (المتطلب 1.5).
 *
 * المتطلبات: 1.1 (جلسة مرتبطة بالدور)، 1.2 (رسالة خطأ عند فشل الاعتماد)،
 *            1.5 (انتهاء الجلسة بعد 30 دقيقة).
 */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { isAuthError, type Role } from "./types";
import { login, SESSION_IDLE_TIMEOUT_MS } from "./auth-service";

/** مدة الجلسة بالثواني (30 دقيقة) لمواءمة سياسة انتهاء الخمول. */
const SESSION_MAX_AGE_SECONDS = SESSION_IDLE_TIMEOUT_MS / 1000;

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    // أقصى عمر للجلسة، ويُجدَّد عند النشاط ليعمل كمؤقّت خمول (المتطلب 1.5).
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "بيانات الاعتماد",
      credentials: {
        username: { label: "اسم المستخدم", type: "text" },
        password: { label: "كلمة المرور", type: "password" },
      },
      async authorize(credentials) {
        const username = credentials?.username ?? "";
        const password = credentials?.password ?? "";

        const result = await login(username, password);
        if (isAuthError(result)) {
          // إعادة null تجعل NextAuth يرفض الدخول؛ تُعرض الرسالة العربية في الواجهة.
          return null;
        }

        return {
          id: result.userId,
          name: result.username,
          role: result.role,
        };
      },
    }),
  ],
  callbacks: {
    // تضمين الدور ومعرّف المستخدم في رمز JWT.
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
    // نقل الدور ومعرّف المستخدم إلى كائن الجلسة المتاح للواجهة والخادم.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
};
