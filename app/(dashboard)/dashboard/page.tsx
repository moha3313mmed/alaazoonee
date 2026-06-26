"use client";

/**
 * الشاشة الرئيسية للوحة التحكّم — المهمتان 13.1 و 13.2.
 *
 * تعرض لمحة سريعة مخصّصة حسب صلاحيات الدور: مؤشّر المبيعات (آخر 30 يوماً) وتنبيهات نقص
 * المخزون للمصرّح بهم، إضافةً إلى روابط تنقّل سريعة للشاشات المتاحة. تستهلك التقارير عبر
 * TanStack Query وتعرض القيم المالية مقترنةً بوحدة العملة (المتطلب 12.4).
 */
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { apiGet } from "@/lib/api/client";
import { money } from "@/lib/ui/format";
import { permissionsForRole } from "@/lib/auth/permissions";
import { navForRole } from "@/lib/ui/nav";
import { PageHeader } from "@/components/layout/page-header";
import { NavIcon } from "@/components/layout/icon";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingRow } from "@/components/ui/spinner";

interface SalesReport {
  totalSales: string | number;
  invoiceCount: number;
}
interface InventoryReport {
  lowStock: { id: string; name: string }[];
}

function last30Days() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return `from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const granted = new Set(role ? permissionsForRole(role) : []);
  const canReports = granted.has("reports:read");
  const canInventory = granted.has("inventory:read");

  const salesQuery = useQuery({
    queryKey: ["dashboard-sales"],
    queryFn: () => apiGet<SalesReport>(`/api/reports/sales?${last30Days()}`),
    enabled: canReports,
  });

  const inventoryQuery = useQuery({
    queryKey: ["dashboard-inventory"],
    queryFn: () => apiGet<InventoryReport>("/api/inventory"),
    enabled: canInventory,
  });

  // روابط التنقّل السريعة عدا الرئيسية نفسها.
  const quickLinks = navForRole(role).filter((item) => item.href !== "/dashboard");
  const lowStock = inventoryQuery.data?.lowStock ?? [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`مرحباً، ${session?.user?.name ?? "مستخدم"}`}
        description="لمحة سريعة عن نشاط النظام والوصول إلى الشاشات."
      />

      {/* مؤشّرات سريعة */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {canReports ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">
                مبيعات آخر 30 يوماً
              </CardTitle>
            </CardHeader>
            <CardContent>
              {salesQuery.isLoading ? (
                <LoadingRow />
              ) : (
                <>
                  <p className="text-2xl font-bold">
                    {money(salesQuery.data?.totalSales)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    عدد الفواتير: {salesQuery.data?.invoiceCount ?? 0}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {canInventory ? (
          <Card
            className={
              lowStock.length > 0 ? "border-amber-300 bg-amber-50" : undefined
            }
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground">
                {lowStock.length > 0 ? (
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                ) : null}
                تنبيهات نقص المخزون
              </CardTitle>
            </CardHeader>
            <CardContent>
              {inventoryQuery.isLoading ? (
                <LoadingRow />
              ) : (
                <>
                  <p className="text-2xl font-bold">{lowStock.length}</p>
                  <p className="text-sm text-muted-foreground">
                    {lowStock.length > 0
                      ? "أصناف بلغت حد إعادة الطلب"
                      : "لا توجد أصناف تحتاج إعادة طلب"}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>

      {/* روابط سريعة */}
      <h2 className="mb-3 text-lg font-semibold">الوصول السريع</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {quickLinks.map((item) => (
          <Link key={item.href} href={item.href}>
            <Card className="transition-colors hover:bg-accent">
              <CardContent className="flex items-center gap-3 p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                  <NavIcon name={item.icon} />
                </div>
                <span className="font-medium">{item.label}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
