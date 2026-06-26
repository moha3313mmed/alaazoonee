/**
 * عميل Prisma المفرد (Singleton).
 *
 * في بيئة التطوير يعيد Next.js تحميل الوحدات بشكل متكرر (Hot Reload)، ما قد يؤدي إلى
 * إنشاء عدد كبير من اتصالات قاعدة البيانات. لتفادي ذلك نحتفظ بنسخة واحدة من PrismaClient
 * على الكائن العام (globalThis) ونعيد استخدامها.
 *
 * المتطلبات: 9.2 (دقة بيانات التقارير)، 12.4 (عرض القيم المالية بدقة).
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
