/**
 * إعداد الحساب الرقمي الدقيق (Decimal) للقيم المالية.
 *
 * تُخزَّن القيم المالية والكميات في PostgreSQL كنوع NUMERIC، ويُعيدها Prisma على شكل
 * Prisma.Decimal (المبني على مكتبة decimal.js). نعتمد هذا النوع كـ"مصدر واحد للحقيقة"
 * في احتساب الأسعار والأرصدة لتفادي أخطاء الفاصلة العائمة (floating-point).
 *
 * المتطلبات: 9.2 (دقة احتساب الأرباح والتقارير)، 12.4 (عرض القيم المالية بدقة).
 */
import { Prisma } from "@prisma/client";

/**
 * النوع المالي الدقيق المعتمد في النظام بأكمله.
 * استخدمه بدلاً من `number` في جميع الحسابات المالية والكميات.
 */
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;

/**
 * الإعداد الافتراضي للدقة وأسلوب التقريب للقيم المالية.
 * - precision: عدد الأرقام المعنوية الكافي للمبالغ الكبيرة دون فقدان الدقة.
 * - rounding: التقريب نصف لأعلى (ROUND_HALF_UP) وهو الأسلوب الشائع في المحاسبة.
 */
Decimal.set({
  precision: 30,
  rounding: Decimal.ROUND_HALF_UP,
});

/** القيمة المالية صفر كقيمة Decimal جاهزة لإعادة الاستخدام (مثل الرصيد الابتدائي). */
export const ZERO: Prisma.Decimal = new Decimal(0);

/**
 * يحوّل أي قيمة (رقم/نص/Decimal) إلى Prisma.Decimal بشكل آمن.
 * @example toDecimal("125.50").plus(toDecimal(10)) // 135.50
 */
export function toDecimal(value: Prisma.Decimal.Value): Prisma.Decimal {
  return new Decimal(value);
}
