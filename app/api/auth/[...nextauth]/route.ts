/**
 * معالِج مسار Auth.js (NextAuth) لتطبيق App Router — المهمة 2.1.
 *
 * يربط إعداد المصادقة (authOptions) بنقاط نهاية NextAuth القياسية (تسجيل الدخول/الخروج/الجلسة).
 *
 * المتطلبات: 1.1, 1.2, 1.5.
 */
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/config";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
