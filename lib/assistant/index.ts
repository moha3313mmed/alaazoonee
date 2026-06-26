/**
 * نقطة التصدير الموحّدة لوحدة المساعد الذكي — المهمة 12.
 *
 * تجمع الأدوات ومحرّك الفهم وخدمة التنسيق لتسهيل الاستيراد عبر `@/lib/assistant`.
 *
 * المتطلبات: 10.1–10.5 (الاستعلام)، 11.1–11.6 (التنفيذ).
 */
export * from "./tools";
export * from "./intent";
export * from "./assistantService";
export { assistantService as default } from "./assistantService";
