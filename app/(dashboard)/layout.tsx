/**
 * تخطيط مجموعة مسارات لوحة التحكّم — المهمتان 13.1 و 13.2.
 *
 * يلفّ كل شاشات اللوحة (الفوترة، العملاء، الموردون، المخزون، التركيب، التقارير، المساعد)
 * بالهيكل المتجاوب المشترك الذي يفرض حارس الجلسة ويعرض التنقّل المصرّح به للدور.
 */
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DashboardShell>{children}</DashboardShell>;
}
