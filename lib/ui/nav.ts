/**
 * تعريف عناصر التنقّل وفلترتها حسب صلاحيات الدور — المهمة 13.1.
 *
 * يربط كل عنصر تنقّل بصلاحية مطلوبة (إن وُجدت)، ثم تُرشَّح القائمة بحسب صلاحيات دور
 * المستخدم الحالي عبر `navForRole`. بذلك لا يُعرض في الشريط الجانبي سوى الشاشات التي
 * يصرّح بها دور المستخدم (المتطلبات 1.3, 1.4) — فمثلاً يرى "الفني" مهام التركيب فقط.
 */
import type { Permission, Role } from "@/lib/auth/types";
import { permissionsForRole } from "@/lib/auth/permissions";

/** عنصر تنقّل واحد في الشريط الجانبي/شريط الجوال. */
export interface NavItem {
  /** المسار داخل التطبيق. */
  href: string;
  /** التسمية العربية المعروضة. */
  label: string;
  /** اسم أيقونة lucide-react. */
  icon: string;
  /** الصلاحية المطلوبة لعرض العنصر؛ غيابها يعني إتاحته لكل جلسة سارية. */
  permission?: Permission;
  /** عند true يظهر العنصر لأي صلاحية ضمن مجاله (يكفي امتلاك إحداها). */
  anyOf?: Permission[];
}

/** قائمة التنقّل الكاملة للنظام. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "الرئيسية", icon: "LayoutDashboard" },
  { href: "/billing", label: "الفوترة وعروض الأسعار", icon: "ReceiptText", permission: "billing:read" },
  { href: "/customers", label: "العملاء", icon: "Users", permission: "customers:read" },
  { href: "/suppliers", label: "الموردون", icon: "Truck", permission: "suppliers:read" },
  { href: "/inventory", label: "المخزون", icon: "Boxes", permission: "inventory:read" },
  {
    href: "/installation",
    label: "التركيب",
    icon: "Wrench",
    anyOf: ["installation:read", "installation:write", "installation:read_assigned", "installation:update_status"],
  },
  { href: "/reports", label: "التقارير", icon: "BarChart3", permission: "reports:read" },
  { href: "/assistant", label: "المساعد الذكي", icon: "Bot" },
];

/** يرشّح عناصر التنقّل بحسب صلاحيات الدور. */
export function navForRole(role: Role | undefined): NavItem[] {
  if (!role) return NAV_ITEMS.filter((item) => !item.permission && !item.anyOf);
  const granted = new Set<Permission>(permissionsForRole(role));

  return NAV_ITEMS.filter((item) => {
    if (item.anyOf) return item.anyOf.some((p) => granted.has(p));
    if (item.permission) return granted.has(item.permission);
    return true; // عناصر متاحة لكل جلسة (الرئيسية/المساعد).
  });
}
