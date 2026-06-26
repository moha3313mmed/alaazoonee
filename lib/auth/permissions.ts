/**
 * مصفوفة الصلاحيات وفرض الأدوار (RBAC) — المهمة 2.2.
 *
 * يعرّف هذا الملف صلاحيات كل دور ودالة `authorize` التي تتحقق من امتلاك الجلسة
 * للصلاحية المطلوبة، إضافة إلى الرسالة الموحّدة عند تجاوز الصلاحية.
 *
 * المتطلبات: 1.3 (منع تنفيذ ما هو خارج نطاق الدور مع رسالة عدم تصريح)،
 *            1.4 (دعم الأدوار: مدير، محاسب، فني).
 */
import type { Permission, Role, Session } from "./types";

/** الرسالة العربية الموحّدة عند تجاوز الصلاحية (سياسة معالجة الأخطاء). */
export const UNAUTHORIZED_MESSAGE = "غير مصرّح لك بتنفيذ هذه العملية";

/** القائمة الكاملة لجميع الصلاحيات (يملكها المدير). */
const ALL_PERMISSIONS: readonly Permission[] = [
  "billing:read",
  "billing:write",
  "customers:read",
  "customers:write",
  "suppliers:read",
  "suppliers:write",
  "expenses:read",
  "expenses:write",
  "inventory:read",
  "inventory:write",
  "reports:read",
  "installation:read",
  "installation:write",
  "installation:read_assigned",
  "installation:update_status",
  "users:manage",
];

/**
 * مصفوفة الصلاحيات لكل دور (المتطلبات 1.3, 1.4):
 * - **مدير**: جميع الصلاحيات.
 * - **محاسب**: الفوترة والعملاء والموردون والمصروفات والمخزون والتقارير.
 * - **فني**: عرض مهام التركيب المسندة إليه وتحديث حالتها فقط.
 */
export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  مدير: new Set(ALL_PERMISSIONS),
  محاسب: new Set<Permission>([
    "billing:read",
    "billing:write",
    "customers:read",
    "customers:write",
    "suppliers:read",
    "suppliers:write",
    "expenses:read",
    "expenses:write",
    "inventory:read",
    "inventory:write",
    "reports:read",
  ]),
  فني: new Set<Permission>([
    "installation:read_assigned",
    "installation:update_status",
  ]),
};

/**
 * يتحقق من صلاحية دور الجلسة لتنفيذ عملية معيّنة (المتطلب 1.3).
 * @returns `true` إذا كان الدور يملك الصلاحية، وإلا `false`.
 */
export function authorize(session: Session, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[session.role];
  if (!permissions) {
    return false;
  }
  return permissions.has(permission);
}

/** يعيد جميع الصلاحيات الممنوحة لدور محدد (مفيد للواجهة والاختبارات). */
export function permissionsForRole(role: Role): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}
