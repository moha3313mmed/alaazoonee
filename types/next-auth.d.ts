/**
 * توسيع أنواع NextAuth لإضافة الدور (role) ومعرّف المستخدم (id) إلى الجلسة والرمز.
 *
 * المتطلبات: 1.1 (الجلسة مرتبطة بالدور)، 1.4 (الأدوار: مدير، محاسب، فني).
 */
import type { Role } from "@/lib/auth/types";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId: string;
    role: Role;
  }
}
