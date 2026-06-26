/**
 * نقطة التصدير الموحّدة لطبقة المصادقة والصلاحيات (RBAC).
 *
 * تجمع خدمة المصادقة، ومصفوفة الصلاحيات، وحارس الأدوار، وأدوات التجزئة، وإعداد Auth.js،
 * لتسهيل الاستيراد من بقية أجزاء التطبيق عبر `@/lib/auth`.
 *
 * المتطلبات: 1.1, 1.2, 1.3, 1.4, 1.5.
 */
export * from "./types";
export * from "./password";
export * from "./permissions";
export * from "./auth-service";
export * from "./guard";
export { authOptions } from "./config";
