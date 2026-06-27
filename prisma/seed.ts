/**
 * سكربت البيانات الأولية (Seed) — إنشاء حساب المدير الأول للنظام المحاسبي.
 *
 * يُنشئ هذا السكربت مستخدماً بدور "مدير" (ADMIN) ليكون أول حساب يمكن تسجيل الدخول به
 * إلى النظام. تُجزَّأ كلمة المرور باستخدام المساعد `hashPassword` نفسه المعتمد في
 * المصادقة، ما يضمن نجاح التحقق منها عند تسجيل الدخول.
 *
 * العملية متكافئة (idempotent): تُستخدم `upsert` بحيث يؤدي تكرار التشغيل إلى تحديث
 * كلمة المرور والدور والحالة بدلاً من الفشل بسبب قيد التفرّد على اسم المستخدم.
 *
 * نستخدم استيرادات نسبية (وليس الاسم المستعار @/*) لأن تشغيل السكربت عبر ts-node
 * قد لا يحلّ الاسم المستعار للمسارات.
 *
 * المتطلبات: 1 (المصادقة والصلاحيات)، 1.1 (التحقق من كلمة المرور المجزّأة).
 */
import { Role } from "@prisma/client";
import { hashPassword } from "../lib/auth/password";
import { prisma } from "../lib/db/client";

/** اسم المستخدم لحساب المدير الأول. */
const ADMIN_USERNAME = "Waylm228@gmail.com";

/**
 * ينشئ (أو يحدّث) حساب المدير الأول في قاعدة البيانات.
 */
async function main(): Promise<void> {
  // تجزئة كلمة المرور بنفس الصيغة المعتمدة في المصادقة لضمان نجاح التحقق عند الدخول.
  const passwordHash = await hashPassword("E35e617309041963@");

  await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: {
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      username: ADMIN_USERNAME,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  // لا تُطبع كلمة المرور الخام في السجلات حفاظاً على الأمان.
  console.log(`تم إنشاء حساب المدير: ${ADMIN_USERNAME}`);
}

main()
  .catch((error) => {
    console.error("فشل إنشاء البيانات الأولية:", error);
    process.exit(1);
  })
  .finally(async () => {
    // فصل الاتصال بقاعدة البيانات في كل الأحوال.
    await prisma.$disconnect();
  });
