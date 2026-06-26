import { redirect } from "next/navigation";

/**
 * الصفحة الجذرية: تحوّل المستخدم إلى لوحة التحكّم.
 * يتولّى هيكل اللوحة بدوره إعادة التوجيه إلى `/login` إن لم تكن هناك جلسة سارية.
 */
export default function HomePage() {
  redirect("/dashboard");
}
