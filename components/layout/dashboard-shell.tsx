"use client";

/**
 * هيكل لوحة التحكّم المتجاوب (Responsive Dashboard Shell) — المهمتان 13.1 و 13.2.
 *
 * يوفّر تخطيطاً متجاوباً باللغة العربية واتجاه RTL:
 *  - **سطح المكتب (≥ 768 بكسل، المتطلب 12.3):** شريط جانبي ثابت على اليمين يعرض عناصر
 *    التنقّل المصرّح بها لدور المستخدم.
 *  - **الأجهزة المحمولة (< 768 بكسل، المتطلب 12.2):** شريط علوي مع زرّ يفتح درجاً
 *    منزلقاً (drawer) يحوي نفس عناصر التنقّل، ويُغلق تلقائياً عند اختيار عنصر.
 *
 * يحرس الهيكل الوصول: يعيد التوجيه إلى `/login` عند غياب جلسة سارية (يتكامل مع انتهاء
 * جلسة NextAuth بالخمول — المتطلب 1.5)، ويوفّر زرّ تسجيل الخروج وعرض اسم المستخدم ودوره.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Menu, X, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { NavIcon } from "@/components/layout/icon";
import { navForRole } from "@/lib/ui/nav";

const APP_TITLE = "الخليلي والعزوني";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // حارس الوصول: إعادة التوجيه إلى تسجيل الدخول عند غياب جلسة سارية (المتطلب 1.5).
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // إغلاق الدرج عند تغيّر المسار (تنقّل الجوال).
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const role = session?.user?.role;
  const items = navForRole(role);

  const navList = (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );

  const userBox = (
    <div className="mt-auto space-y-3 border-t pt-4">
      <div className="px-3 text-sm">
        <p className="font-semibold">{session?.user?.name ?? "مستخدم"}</p>
        {role ? <p className="text-xs text-muted-foreground">{role}</p> : null}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <LogOut className="h-4 w-4" />
        تسجيل الخروج
      </Button>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      {/* الشريط الجانبي — سطح المكتب فقط (≥ 768 بكسل) */}
      <aside className="hidden w-64 shrink-0 flex-col border-l bg-card p-4 md:flex">
        <div className="mb-6 px-3">
          <h1 className="text-lg font-bold">{APP_TITLE}</h1>
          <p className="text-xs text-muted-foreground">النظام المحاسبي</p>
        </div>
        {navList}
        {userBox}
      </aside>

      {/* الشريط العلوي — الأجهزة المحمولة فقط (< 768 بكسل) */}
      <header className="flex items-center justify-between border-b bg-card p-4 md:hidden">
        <h1 className="text-base font-bold">{APP_TITLE}</h1>
        <Button
          variant="ghost"
          size="icon"
          aria-label="فتح القائمة"
          onClick={() => setDrawerOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* درج التنقّل المنزلق — الأجهزة المحمولة */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <div className="absolute inset-y-0 right-0 flex w-72 flex-col bg-card p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-3">
              <h1 className="text-lg font-bold">{APP_TITLE}</h1>
              <Button
                variant="ghost"
                size="icon"
                aria-label="إغلاق القائمة"
                onClick={() => setDrawerOpen(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            {navList}
            {userBox}
          </div>
        </div>
      ) : null}

      {/* منطقة المحتوى الرئيسية */}
      <main className="flex-1 overflow-x-hidden bg-background p-4 md:p-8">
        {children}
      </main>
    </div>
  );
}

export default DashboardShell;
