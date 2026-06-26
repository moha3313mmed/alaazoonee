"use client";

import {
  LayoutDashboard,
  ReceiptText,
  Users,
  Truck,
  Boxes,
  Wrench,
  BarChart3,
  Bot,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** خريطة أسماء الأيقونات المستخدمة في التنقّل إلى مكوّنات lucide-react. */
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  ReceiptText,
  Users,
  Truck,
  Boxes,
  Wrench,
  BarChart3,
  Bot,
};

/** يعرض أيقونة تنقّل بالاسم، مع أيقونة افتراضية عند غياب التطابق. */
export function NavIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const Icon = ICONS[name] ?? LayoutDashboard;
  return <Icon className={cn("h-5 w-5 shrink-0", className)} aria-hidden />;
}
