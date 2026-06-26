/**
 * تصدير التقارير (Report Export) — المهمة 10.2.
 *
 * توفّر هذه الوحدة تصدير مخرجات {@link import("./reportService")} (المبيعات، الأرباح،
 * الذمم، المخزون) بصيغتين قابلتين للطباعة أو الحفظ (المتطلب 9.5):
 *
 *  - **CSV**: تسلسل نصّي متوافق مع Excel، مع بادئة BOM بترميز UTF-8 لضمان عرض الأحرف
 *    العربية بشكل صحيح، ومعالجة التهريب (escaping) للفواصل وعلامات الاقتباس والأسطر.
 *  - **PDF**: مستند مُنسَّق يُولَّد عبر مكتبة `@react-pdf/renderer`. ولأن توليد PDF يتطلّب
 *    اعتمادية خارجية، يُعزل ذلك في وحدة منفصلة ({@link ./reportPdf}) تُستورَد ديناميكياً
 *    عند الحاجة فقط، بحيث يظلّ مسار CSV وبقية الشيفرة مستقلّين عن تلك الاعتمادية.
 *
 * مبدأ التصميم: تُحوَّل بيانات التقرير أولاً إلى نموذج وسيط محايد للصيغة
 * ({@link ReportDocument}) يضمّ جداول معنونة، ثم تستهلك صيغتا CSV و PDF هذا النموذج نفسه
 * (مصدر واحد لتمثيل التقرير). تُنسَّق القيم المالية عبر {@link formatCurrency} للحفاظ على
 * اتساق وحدة العملة عبر النظام (المتطلب 12.4).
 */
import { UnitKind, type Prisma } from "@prisma/client";

import { toDecimal } from "@/lib/db/decimal";
import { formatCurrency } from "@/lib/constants";
import type {
  DateRange,
  InventoryReport,
  ProfitReport,
  ReceivablesReport,
  SalesReport,
} from "@/lib/services/reportService";

/** الصيغ المدعومة لتصدير التقارير (المتطلب 9.5). */
export type ExportFormat = "pdf" | "csv";

/**
 * بيانات التقرير المُراد تصديرها، كاتحاد مُميَّز (discriminated union) فوق أنواع نتائج
 * {@link import("./reportService")}. يحمل كل نوع بياناته إضافةً إلى النطاق الزمني عند انطباقه.
 */
export type ReportData =
  | { type: "sales"; range: DateRange; data: SalesReport }
  | { type: "profit"; range: DateRange; data: ProfitReport }
  | { type: "receivables"; data: ReceivablesReport }
  | { type: "inventory"; data: InventoryReport };

/** جدول معنون ضمن مستند التقرير (عنوان + رؤوس أعمدة + صفوف نصّية جاهزة للعرض). */
export interface ReportTable {
  /** عنوان القسم/الجدول بالعربية. */
  title: string;
  /** رؤوس الأعمدة بالعربية. */
  headers: string[];
  /** صفوف البيانات، كل خلية سلسلة نصّية منسّقة وجاهزة للعرض. */
  rows: string[][];
}

/** النموذج الوسيط المحايد للصيغة الذي تستهلكه كل من صيغتي CSV و PDF. */
export interface ReportDocument {
  /** عنوان التقرير الرئيسي. */
  title: string;
  /** عنوان فرعي اختياري (مثل النطاق الزمني وتاريخ الإصدار). */
  subtitle?: string;
  /** جداول المحتوى (قد يضمّ التقرير أكثر من جدول، مثل الذمم والمخزون). */
  tables: ReportTable[];
}

/** ناتج التصدير: محتوى ثنائي مع نوع المحتوى واسم الملف المقترح. */
export interface FileBlob {
  /** اسم الملف المقترح مع الامتداد. */
  filename: string;
  /** نوع المحتوى (MIME) المناسب للتنزيل. */
  mimeType: string;
  /** محتوى الملف الثنائي (CSV نصّي مُرمَّز UTF-8 مع BOM، أو PDF). */
  content: Uint8Array;
}

/** بادئة ترتيب البايتات (UTF-8 BOM) لضمان قراءة Excel للأحرف العربية بشكل صحيح. */
const UTF8_BOM = "\uFEFF";

/** فاصل الأسطر CRLF لأقصى توافق مع برامج الجداول (مثل Excel). */
const CRLF = "\r\n";

/** التسميات العربية لوحدات قياس المخزون (أسماء enum من Prisma → العربية). */
const UNIT_LABELS: Record<UnitKind, string> = {
  [UnitKind.SQUARE_METER]: "متر مربع",
  [UnitKind.PIECE]: "قطعة",
};

/** ينسّق قيمة Decimal كمبلغ مالي مقترن بوحدة العملة المعتمدة (المتطلب 12.4). */
function money(value: Prisma.Decimal.Value): string {
  return formatCurrency(toDecimal(value).toNumber());
}

/** ينسّق قيمة Decimal ككمية رقمية دون رمز عملة (للكميات وحدود إعادة الطلب). */
function quantity(value: Prisma.Decimal.Value): string {
  return toDecimal(value).toString();
}

/** ينسّق تاريخاً بصيغة عربية مختصرة (سنة/شهر/يوم). */
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ar-JO", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** يبني عنواناً فرعياً يصف النطاق الزمني للتقرير. */
function rangeSubtitle(range: DateRange): string {
  return `الفترة من ${formatDate(range.from)} إلى ${formatDate(range.to)}`;
}

/**
 * يحوّل {@link ReportData} إلى {@link ReportDocument} وسيط محايد للصيغة.
 * هذا التحويل هو الموضع الوحيد الذي يُترجم فيه شكل بيانات كل تقرير إلى جداول معروضة،
 * فتشترك فيه صيغتا CSV و PDF دون تكرار منطق العرض.
 */
export function toReportDocument(report: ReportData): ReportDocument {
  switch (report.type) {
    case "sales":
      return {
        title: "تقرير المبيعات",
        subtitle: rangeSubtitle(report.range),
        tables: [
          {
            title: "ملخّص المبيعات",
            headers: ["البيان", "القيمة"],
            rows: [
              ["إجمالي المبيعات", money(report.data.totalSales)],
              ["عدد الفواتير", String(report.data.invoiceCount)],
            ],
          },
        ],
      };

    case "profit":
      return {
        title: "تقرير الأرباح",
        subtitle: rangeSubtitle(report.range),
        tables: [
          {
            title: "تفصيل الأرباح",
            headers: ["البيان", "القيمة"],
            rows: [
              ["إجمالي المبيعات", money(report.data.totalSales)],
              ["إجمالي المصروفات", money(report.data.totalExpenses)],
              ["تكلفة البضاعة المباعة", money(report.data.costOfGoodsSold)],
              ["صافي الربح", money(report.data.profit)],
            ],
          },
        ],
      };

    case "receivables":
      return {
        title: "تقرير الذمم",
        tables: [
          {
            title: "أرصدة العملاء المستحقة",
            headers: ["الاسم", "الهاتف", "الرصيد"],
            rows: report.data.customers.map((entry) => [
              entry.name,
              entry.phone,
              money(entry.balance),
            ]),
          },
          {
            title: "مستحقات الموردين",
            headers: ["الاسم", "الهاتف", "الرصيد"],
            rows: report.data.suppliers.map((entry) => [
              entry.name,
              entry.phone,
              money(entry.balance),
            ]),
          },
        ],
      };

    case "inventory": {
      const itemRow = (item: InventoryReport["items"][number]): string[] => [
        item.name,
        UNIT_LABELS[item.unit],
        quantity(item.quantity),
        quantity(item.reorderLevel),
      ];

      return {
        title: "تقرير المخزون",
        tables: [
          {
            title: "جميع الأصناف",
            headers: ["الصنف", "الوحدة", "الكمية", "حد إعادة الطلب"],
            rows: report.data.items.map(itemRow),
          },
          {
            title: "أصناف بلغت حد إعادة الطلب",
            headers: ["الصنف", "الوحدة", "الكمية", "حد إعادة الطلب"],
            rows: report.data.lowStock.map(itemRow),
          },
        ],
      };
    }
  }
}

/**
 * يهرّب خلية CSV واحدة وفق RFC 4180: تُحاط الخلية بعلامتي اقتباس إذا تضمّنت فاصلة أو
 * علامة اقتباس أو سطراً جديداً أو فراغاً في الطرفين، وتُضاعَف علامات الاقتباس بداخلها.
 */
function escapeCsvCell(value: string): string {
  const needsQuoting = /[",\r\n]/.test(value) || value !== value.trim();
  if (!needsQuoting) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/** يحوّل صفّاً من الخلايا إلى سطر CSV مهرّب. */
function toCsvRow(cells: string[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * يسلسل {@link ReportDocument} إلى نصّ CSV.
 *
 * - يُمكِّن العنوان والعنوان الفرعي وكل جدول (عنوانه ورؤوسه وصفوفه) ضمن النص.
 * - تُفصَل الجداول المتعددة بسطر فارغ لتسهيل القراءة في برامج الجداول.
 * - تُستخدم نهايات أسطر CRLF توافقاً مع Excel. (لا تُضاف بادئة BOM هنا؛ تُضاف عند الترميز.)
 */
export function toCsv(doc: ReportDocument): string {
  const lines: string[] = [];

  lines.push(toCsvRow([doc.title]));
  if (doc.subtitle) lines.push(toCsvRow([doc.subtitle]));

  for (const table of doc.tables) {
    lines.push(""); // سطر فاصل قبل كل جدول
    lines.push(toCsvRow([table.title]));
    lines.push(toCsvRow(table.headers));
    for (const row of table.rows) {
      lines.push(toCsvRow(row));
    }
  }

  return lines.join(CRLF);
}

/** يولّد جزء الاسم اللاتيني الآمن للملف بحسب نوع التقرير. */
const FILENAME_SLUG: Record<ReportData["type"], string> = {
  sales: "sales",
  profit: "profit",
  receivables: "receivables",
  inventory: "inventory",
};

/** يبني اسم ملف مقترحاً مع طابع زمني وامتداد الصيغة. */
function buildFilename(type: ReportData["type"], format: ExportFormat): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `report-${FILENAME_SLUG[type]}-${stamp}.${format}`;
}

/** يرمّز نص CSV إلى بايتات UTF-8 مع بادئة BOM (لتوافق العربية في Excel). */
function encodeCsv(csv: string): Uint8Array {
  return new TextEncoder().encode(UTF8_BOM + csv);
}

/**
 * يصدّر تقريراً بالصيغة المطلوبة (المتطلب 9.5).
 *
 * - **csv**: يُسلسَل ويُرمَّز فوراً (لا اعتمادية خارجية).
 * - **pdf**: تُستورَد وحدة التوليد ديناميكياً عند الحاجة فقط، فلا يتحمّل مسار CSV ولا بقية
 *   الشيفرة تبعية مكتبة PDF.
 *
 * @param report بيانات التقرير المُراد تصديرها.
 * @param format الصيغة المطلوبة: "csv" أو "pdf".
 * @returns {@link FileBlob} يحوي المحتوى الثنائي ونوعه واسم الملف المقترح.
 */
export async function exportReport(
  report: ReportData,
  format: ExportFormat,
): Promise<FileBlob> {
  const doc = toReportDocument(report);
  const filename = buildFilename(report.type, format);

  if (format === "csv") {
    return {
      filename,
      mimeType: "text/csv; charset=utf-8",
      content: encodeCsv(toCsv(doc)),
    };
  }

  // التوليد بصيغة PDF معزول في وحدة منفصلة تُستورَد ديناميكياً (تعتمد على @react-pdf/renderer).
  const { renderReportToPdf } = await import("@/lib/services/reportPdf");
  return {
    filename,
    mimeType: "application/pdf",
    content: await renderReportToPdf(doc),
  };
}

/** واجهة التصدير مجمّعة لتسهيل الاستيراد في طبقة الـ API والواجهة. */
export const ReportExport = {
  exportReport,
  toReportDocument,
  toCsv,
} as const;

export default ReportExport;
