"use client";

/**
 * شاشة تسجيل الدخول — المهمة 13.1 (المتطلبات 1.1, 1.2, 12.1).
 *
 * تستخدم مزوّد بيانات الاعتماد في Auth.js عبر `signIn` دون إعادة توجيه تلقائي، فتعرض
 * رسالة خطأ عربية عامة عند فشل الاعتماد (المتطلب 1.2)، وتنقل المستخدم إلى لوحة التحكّم
 * عند النجاح. الشاشة متجاوبة وباتجاه RTL (المتطلب 12.1).
 */
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorRow } from "@/components/ui/spinner";

const GENERIC_LOGIN_ERROR = "اسم المستخدم أو كلمة المرور غير صحيحة";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4" />
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { status } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  // إن كان المستخدم مسجّلاً مسبقاً، انقله مباشرة إلى اللوحة.
  useEffect(() => {
    if (status === "authenticated") {
      router.replace(callbackUrl);
    }
  }, [status, router, callbackUrl]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });

    setSubmitting(false);

    if (!result || result.error) {
      setError(GENERIC_LOGIN_ERROR);
      return;
    }

    router.replace(callbackUrl);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">تسجيل الدخول</CardTitle>
          <CardDescription>
            النظام المحاسبي — الخليلي والعزوني للزجاج والإكسسوارات والتركيب
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>

            {error ? <ErrorRow message={error} /> : null}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "جارٍ الدخول…" : "دخول"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
