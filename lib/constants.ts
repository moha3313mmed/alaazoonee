/**
 * ثوابت عامة للنظام المحاسبي.
 */

/**
 * وحدة العملة المعتمدة للشركة.
 * المتطلب 12.4: تُعرض القيم المالية مقترنةً بوحدة العملة المعتمدة.
 *
 * يمكن تعديل القيمة الافتراضية هنا أو عبر متغيّر البيئة `NEXT_PUBLIC_CURRENCY_CODE`
 * عند الحاجة لتغيير العملة لاحقاً دون تعديل منطق العرض.
 */
export const CURRENCY = {
  /** رمز العملة وفق ISO 4217 (يُستخدم مع Intl.NumberFormat). */
  code: process.env.NEXT_PUBLIC_CURRENCY_CODE ?? "JOD",
  /** الاسم المعروض بالعربية. */
  label: "دينار أردني",
  /** الرمز المختصر المعروض بجانب القيمة. */
  symbol: "د.أ",
  /** الإعداد المحلي المستخدم لتنسيق الأرقام (أرقام عربية ولاتينية). */
  locale: "ar-JO",
  /** عدد المنازل العشرية المعروضة افتراضياً. */
  fractionDigits: 2,
} as const;

/**
 * ينسّق قيمة مالية ويقرنها بوحدة العملة المعتمدة (المتطلب 12.4).
 *
 * @example
 * formatCurrency(1250.5) // "١٬٢٥٠٫٥٠ د.أ"
 */
export function formatCurrency(
  amount: number,
  options?: { withSymbol?: boolean }
): string {
  const { withSymbol = true } = options ?? {};

  const formatted = new Intl.NumberFormat(CURRENCY.locale, {
    minimumFractionDigits: CURRENCY.fractionDigits,
    maximumFractionDigits: CURRENCY.fractionDigits,
  }).format(amount);

  return withSymbol ? `${formatted} ${CURRENCY.symbol}` : formatted;
}

/** اللغة الأساسية للواجهة. */
export const DEFAULT_LOCALE = "ar";

/** اتجاه الواجهة الأساسي. */
export const DEFAULT_DIRECTION = "rtl";
