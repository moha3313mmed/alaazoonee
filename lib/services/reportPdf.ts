/**
 * توليد ملفات PDF للتقارير (Report PDF Renderer) — جزء من المهمة 10.2.
 *
 * تعزل هذه الوحدة الاعتمادية على مكتبة `@react-pdf/renderer` عن بقية الشيفرة، وتُستورَد
 * ديناميكياً من {@link ./reportExport} عند طلب صيغة PDF فقط. تستهلك النموذج الوسيط
 * المحايد للصيغة ({@link ReportDocument}) فتعرض كل جدول معنون في تخطيط مرتّب باتجاه RTL.
 *
 * دعم العربية: لا تتضمّن خطوط react-pdf الافتراضية (Helvetica) محارف عربية، لذا تُسجَّل
 * عائلة خط عربية (Cairo افتراضياً) عند توفّر مصدرها. يمكن تخصيص مصدر الخط عبر متغيّرات
 * البيئة `REPORT_PDF_FONT_URL` و`REPORT_PDF_FONT_BOLD_URL` (مسار ملف أو رابط TTF).
 */
import { createElement, type ReactElement } from "react";
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import type { ReportDocument, ReportTable } from "@/lib/services/reportExport";

/** اسم عائلة الخط العربي المستخدمة في مستندات PDF. */
const ARABIC_FONT_FAMILY = "Cairo";

/** مصادر الخط العربي الافتراضية (قابلة للتخصيص عبر متغيّرات البيئة). */
const FONT_REGULAR_SRC =
  process.env.REPORT_PDF_FONT_URL ??
  "https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hOA-W1Q.ttf";
const FONT_BOLD_SRC =
  process.env.REPORT_PDF_FONT_BOLD_URL ??
  "https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvangtZmpQdkhzfH5lkSs2SgRjCAGMQ1z0hOA-W1Q.ttf";

let fontRegistered = false;

/**
 * يسجّل عائلة الخط العربي مرّة واحدة. في حال تعذّر التسجيل (مثل غياب مصدر الخط) لا تُرمى
 * استثناءات تُعطّل التوليد؛ يُكتفى بتسجيل تحذير ويستمر التوليد بالخط الافتراضي.
 */
function ensureArabicFont(): void {
  if (fontRegistered) return;
  try {
    Font.register({
      family: ARABIC_FONT_FAMILY,
      fonts: [
        { src: FONT_REGULAR_SRC },
        { src: FONT_BOLD_SRC, fontWeight: "bold" },
      ],
    });
    fontRegistered = true;
  } catch (error) {
    console.warn("تعذّر تسجيل الخط العربي لتقارير PDF؛ سيُستخدم الخط الافتراضي.", error);
  }
}

const styles = StyleSheet.create({
  page: {
    fontFamily: ARABIC_FONT_FAMILY,
    fontSize: 10,
    paddingVertical: 32,
    paddingHorizontal: 28,
    direction: "rtl",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "right",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    textAlign: "right",
    color: "#555555",
    marginBottom: 16,
  },
  tableTitle: {
    fontSize: 13,
    fontWeight: "bold",
    textAlign: "right",
    marginTop: 14,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row-reverse",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  headerRow: {
    flexDirection: "row-reverse",
    backgroundColor: "#f2f2f2",
    borderBottomWidth: 1,
    borderBottomColor: "#bbbbbb",
  },
  cell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 6,
    textAlign: "right",
  },
  headerCell: {
    fontWeight: "bold",
  },
  emptyNote: {
    textAlign: "right",
    color: "#888888",
    paddingVertical: 6,
  },
});

/** يبني صفّاً (رؤوس أو بيانات) من خلايا نصّية. */
function renderRow(cells: string[], isHeader: boolean, key: string): ReactElement {
  return createElement(
    View,
    { key, style: isHeader ? styles.headerRow : styles.row },
    cells.map((cell, index) =>
      createElement(
        Text,
        {
          key: `${key}-c${index}`,
          style: isHeader ? [styles.cell, styles.headerCell] : styles.cell,
        },
        cell,
      ),
    ),
  );
}

/** يبني عرض جدول واحد (عنوان + رؤوس + صفوف، أو ملاحظة فراغ). */
function renderTable(table: ReportTable, tableIndex: number): ReactElement {
  const key = `t${tableIndex}`;
  const children: ReactElement[] = [
    createElement(Text, { key: `${key}-title`, style: styles.tableTitle }, table.title),
    renderRow(table.headers, true, `${key}-h`),
  ];

  if (table.rows.length === 0) {
    children.push(
      createElement(Text, { key: `${key}-empty`, style: styles.emptyNote }, "لا توجد بيانات"),
    );
  } else {
    table.rows.forEach((row, rowIndex) => {
      children.push(renderRow(row, false, `${key}-r${rowIndex}`));
    });
  }

  return createElement(View, { key }, children);
}

/** يبني عنصر مستند PDF كاملاً من {@link ReportDocument}. */
function buildDocumentElement(doc: ReportDocument): ReactElement {
  const header: ReactElement[] = [
    createElement(Text, { key: "title", style: styles.title }, doc.title),
  ];
  if (doc.subtitle) {
    header.push(createElement(Text, { key: "subtitle", style: styles.subtitle }, doc.subtitle));
  }

  const tables = doc.tables.map((table, index) => renderTable(table, index));

  return createElement(
    Document,
    { title: doc.title },
    createElement(Page, { size: "A4", style: styles.page }, [...header, ...tables]),
  );
}

/**
 * يولّد ملف PDF من {@link ReportDocument} ويعيده كبايتات جاهزة للتنزيل أو الحفظ.
 *
 * @param doc النموذج الوسيط للتقرير.
 * @returns بايتات ملف PDF (Buffer وهو امتداد لـ Uint8Array).
 */
export async function renderReportToPdf(doc: ReportDocument): Promise<Uint8Array> {
  ensureArabicFont();
  return renderToBuffer(buildDocumentElement(doc));
}

export default renderReportToPdf;
