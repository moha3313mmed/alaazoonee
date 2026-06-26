/**
 * أنواع طبقة المصادقة والصلاحيات (RBAC).
 *
 * يعرّف هذا الملف الأدوار، والجلسة، والصلاحيات، وأخطاء المصادقة المشتركة بين
 * خدمة المصادقة (AuthService)، ومصفوفة الصلاحيات، وحارس الأدوار، وإعداد Auth.js.
 *
 * المتطلبات: 1.1 (جلسة مرتبطة بالدور)، 1.2 (رفض الاعتماد الخاطئ)،
 *            1.3 (منع تجاوز الصلاحية)، 1.4 (ثلاثة أدوار)، 1.5 (انتهاء الجلسة بالخمول).
 */

/**
 * أدوار المستخدمين بالقيم العربية المعتمدة في وثيقة التصميم (المتطلب 1.4).
 * تُطابق هذه القيم تعيينات `@map` في enum Role داخل مخطط Prisma.
 */
export type Role = "مدير" | "محاسب" | "فني";

/**
 * مفاتيح الأدوار اللاتينية كما يصدّرها عميل Prisma (enum Role).
 * نوفّر التحويل بينها وبين القيم العربية عبر `ROLE_FROM_PRISMA` و`ROLE_TO_PRISMA`.
 */
export type PrismaRole = "ADMIN" | "ACCOUNTANT" | "TECHNICIAN";

/** تحويل دور Prisma اللاتيني إلى القيمة العربية المعروضة. */
export const ROLE_FROM_PRISMA: Record<PrismaRole, Role> = {
  ADMIN: "مدير",
  ACCOUNTANT: "محاسب",
  TECHNICIAN: "فني",
};

/** تحويل الدور العربي إلى مفتاح Prisma اللاتيني. */
export const ROLE_TO_PRISMA: Record<Role, PrismaRole> = {
  مدير: "ADMIN",
  محاسب: "ACCOUNTANT",
  فني: "TECHNICIAN",
};

/**
 * الصلاحيات المتاحة في النظام، مصاغة بنمط `المجال:العملية`.
 * تُستخدم في مصفوفة الصلاحيات ودالة `authorize` (المتطلبات 1.3, 1.4).
 */
export type Permission =
  | "billing:read"
  | "billing:write"
  | "customers:read"
  | "customers:write"
  | "suppliers:read"
  | "suppliers:write"
  | "expenses:read"
  | "expenses:write"
  | "inventory:read"
  | "inventory:write"
  | "reports:read"
  | "installation:read"
  | "installation:write"
  | "installation:read_assigned"
  | "installation:update_status"
  | "users:manage";

/**
 * جلسة المستخدم المصرّح له (المتطلب 1.1).
 * تحمل هوية المستخدم ودوره وأوقات الإصدار وآخر نشاط لاحتساب انتهاء الخمول.
 */
export interface Session {
  userId: string;
  username: string;
  role: Role;
  /** وقت إنشاء الجلسة. */
  issuedAt: Date;
  /** وقت آخر نشاط للمستخدم — يُستخدم لاحتساب انتهاء الجلسة بالخمول (المتطلب 1.5). */
  lastActivityAt: Date;
}

/** صنف خطأ المصادقة المعاد عند فشل تسجيل الدخول (المتطلب 1.2). */
export interface AuthError {
  ok: false;
  /** رسالة عامة بالعربية لا تكشف السبب التفصيلي (سياسة معالجة الأخطاء). */
  error: string;
}

/** يميّز قيمة الجلسة عن قيمة خطأ المصادقة في نتيجة `login`. */
export function isAuthError(value: Session | AuthError): value is AuthError {
  return (value as AuthError).ok === false;
}
