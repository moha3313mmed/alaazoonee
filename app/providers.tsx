"use client";

/**
 * مزوّدو حالة التطبيق (Client Providers) — المهمة 13.1.
 *
 * يجمع هذا المكوّن مزوّدَي الحالة العامّين المطلوبَين على مستوى الجذر:
 *  - `SessionProvider` (Auth.js/NextAuth): يتيح قراءة جلسة المستخدم ودوره في الواجهة
 *    لفرض عرض العناصر المصرّح بها وإعادة التوجيه إلى تسجيل الدخول عند انتهاء الجلسة.
 *  - `QueryClientProvider` (TanStack Query): إدارة حالة الخادم (جلب/تخزين مؤقت/إبطال)
 *    لاستهلاك نقاط نهاية الـ API الموحّدة عبر كل الشاشات.
 *
 * يُنشأ `QueryClient` مرّة واحدة لكل تحميل عميل عبر `useState` لتفادي إعادة إنشائه
 * في كل تصيير (re-render).
 */
import { useState, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // تقليل إعادة الجلب المتكرّر؛ البيانات المالية تُبطَّل يدوياً بعد كل عملية كتابة.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionProvider>
  );
}

export default Providers;
