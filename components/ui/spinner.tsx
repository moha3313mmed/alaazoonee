import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

/** مؤشّر تحميل دوّار موحّد لحالات الجلب في الواجهة. */
export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("h-5 w-5 animate-spin text-muted-foreground", className)}
      aria-label="جارٍ التحميل"
    />
  );
}

/** صفّ تحميل بنص عربي يُعرض أثناء جلب البيانات. */
export function LoadingRow({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

/** رسالة خطأ موحّدة بالعربية. */
export function ErrorRow({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

/** حالة فارغة موحّدة. */
export function EmptyRow({ label = "لا توجد بيانات لعرضها." }: { label?: string }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">{label}</div>
  );
}
