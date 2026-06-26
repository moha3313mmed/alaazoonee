/**
 * أدوات تنسيق للعرض في الواجهة (Display Formatting) — المهمة 13.1.
 *
 * يجمع هذا الملف مساعدات عرض موحّدة باللغة العربية:
 *  - `toNumber`: تحويل قيم Decimal المُعادة كسلاسل نصّية من الـ API إلى أرقام.
 *  - `money`: تنسيق قيمة مالية مقترنةً بوحدة العملة (المتطلب 12.4) مع قبول القيم النصّية.
 *  - خرائط ترجمة قيم القوائم المعدودة (enum) من مفاتيح Prisma اللاتينية إلى نصوص عربية.
 *  - `formatDate`: تنسيق التواريخ بالعربية.
 */
import { formatCurrency } from "@/lib/constants";

/** يحوّل قيمة (رقم أو سلسلة Decimal) إلى رقم، ويعيد 0 عند التعذّر. */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** ينسّق قيمة مالية (تقبل رقماً أو سلسلة Decimal) مقترنةً بوحدة العملة (المتطلب 12.4). */
export function money(value: unknown): string {
  return formatCurrency(toNumber(value));
}

/** ترجمة وحدة قياس المخزون من مفتاح Prisma إلى نص عربي (المتطلب 7.6). */
export const UNIT_LABELS: Record<string, string> = {
  SQUARE_METER: "متر مربع",
  PIECE: "قطعة",
};

/** ترجمة حالة الفاتورة من مفتاح Prisma إلى نص عربي (المتطلبات 5.4, 5.5). */
export const INVOICE_STATUS_LABELS: Record<string, string> = {
  UNPAID: "غير مدفوعة",
  PARTIALLY_PAID: "مدفوعة جزئياً",
  PAID: "مدفوعة بالكامل",
};

/** ترجمة حالة عرض السعر من مفتاح Prisma إلى نص عربي. */
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  APPROVED: "معتمد",
  CONVERTED: "محوّل",
  CANCELLED: "ملغى",
};

/** ترجمة حالة مهمة التركيب من مفتاح Prisma إلى نص عربي (المتطلبات 8.1, 8.3). */
export const JOB_STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "مجدولة",
  IN_PROGRESS: "قيد التنفيذ",
  COMPLETED: "مكتملة",
  CANCELLED: "ملغاة",
};

/** يعيد التسمية العربية لقيمة معدودة أو القيمة نفسها عند غياب الترجمة. */
export function labelOf(map: Record<string, string>, value: unknown): string {
  const key = String(value ?? "");
  return map[key] ?? key;
}

/** ينسّق تاريخاً (أو نصّاً) بصيغة عربية مقروءة. */
export function formatDate(value: unknown): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ar", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}
