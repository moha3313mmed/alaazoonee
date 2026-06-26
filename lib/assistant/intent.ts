/**
 * تحليل النية (Intent Parsing) للمساعد الذكي — المهام 12.1, 12.2, 12.3.
 *
 * يحوّل هذا الملف الرسائل العربية إلى نية (Intent) = اسم أداة + وسائطها، عبر طبقة مجرّدة
 * (`AssistantModel`) تسمح بإبدال محرّك الفهم لاحقاً بنموذج لغوي كبير (LLM) مع استدعاء الأدوات،
 * مع توفير محرّك افتراضي قائم على القواعد (`RuleBasedModel`) يعمل دون اتصال بالشبكة.
 *
 * عند تعذّر فهم الرسالة تُعاد نية بثقة منخفضة (tool = null) فيطلب المساعد توضيحاً بدلاً من
 * تقديم إجابة غير مؤكدة (المتطلب 10.4).
 */
import type { ToolArgs, ToolName } from "./tools";

/** نتيجة تحليل النية: الأداة المستهدفة، الوسائط المستخرجة، ودرجة الثقة (0..1). */
export interface ParsedIntent {
  tool: ToolName | null;
  args: ToolArgs;
  /** درجة ثقة المحرّك في الفهم؛ أقل من العتبة تعني طلب توضيح. */
  confidence: number;
}

/** سياق اختياري يُمرَّر للمحرّك (مثل الأداة التي يجري جمع حقولها الناقصة). */
export interface ParseContext {
  /** عند جمع الحقول الناقصة لأداة محددة، تُمرَّر هنا لتوجيه الاستخراج. */
  collectingTool?: ToolName;
}

/**
 * طبقة مجرّدة لمحرّك فهم اللغة الطبيعية. التنفيذ الافتراضي قائم على القواعد، ويمكن
 * استبداله بتنفيذ يعتمد على LLM مع استدعاء الأدوات (Function/Tool Calling) دون تغيير
 * بقية المساعد.
 */
export interface AssistantModel {
  parse(message: string, context?: ParseContext): Promise<ParsedIntent> | ParsedIntent;
}

/* ------------------------------------------------------------------ */
/* مساعدات استخراج عربية                                                */
/* ------------------------------------------------------------------ */

/** يحوّل الأرقام العربية-الهندية (٠-٩) إلى أرقام لاتينية لتسهيل التحليل. */
function normalizeDigits(text: string): string {
  const map: Record<string, string> = {
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  };
  return text.replace(/[٠-٩]/g, (d) => map[d] ?? d);
}

/** يستخرج أول قيمة رقمية (مبلغ) من النص، أو null. */
function extractAmount(text: string): number | null {
  const match = normalizeDigits(text).match(/(\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  return Number.isNaN(value) ? null : value;
}

/** يستخرج تسلسل أرقام طويلاً (هاتف، 7 خانات فأكثر)، أو null. */
function extractPhone(text: string): string | null {
  const match = normalizeDigits(text).match(/\d{7,}/);
  return match ? match[0] : null;
}

/**
 * يستخرج اسماً يلي إحدى الكلمات المفتاحية (مثل "العميل"، "باسم").
 * يقتطع حتى علامة وقف شائعة أو كلمة ربط، ويزيل علامات الاستفهام.
 */
function extractNameAfter(text: string, keywords: string[]): string | null {
  for (const kw of keywords) {
    const idx = text.indexOf(kw);
    if (idx === -1) continue;
    let rest = text.slice(idx + kw.length).trim();
    // أوقف عند علامات الترقيم أو كلمات ربط تالية.
    rest = rest.split(/[؟?.,،\n]/)[0].trim();
    rest = rest.replace(/\s+(بمبلغ|بقيمة|هاتف|رقم|على|من|الى|إلى).*$/, "").trim();
    if (rest) return rest;
  }
  return null;
}

/** يتحقق من احتواء النص لأي من الكلمات المفتاحية. */
function hasAny(text: string, keywords: string[]): boolean {
  return keywords.some((kw) => text.includes(kw));
}

/* ------------------------------------------------------------------ */
/* استخراج الفترات الزمنية للمبيعات                                     */
/* ------------------------------------------------------------------ */

/** نتيجة استخراج فترة زمنية: تاريخا البداية والنهاية مع تسمية عربية. */
interface Period {
  from: Date;
  to: Date;
  label: string;
}

/** يحدّد فترة زمنية شائعة من النص العربي (اليوم، الأسبوع، الشهر، السنة...). */
function extractPeriod(text: string, now: Date = new Date()): Period | null {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  if (text.includes("اليوم")) {
    return { from: startOfDay(now), to: endOfDay(now), label: "اليوم" };
  }
  if (text.includes("أمس") || text.includes("امس")) {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y), label: "أمس" };
  }
  if (text.includes("الأسبوع") || text.includes("الاسبوع")) {
    const from = new Date(now);
    from.setDate(now.getDate() - 6);
    return { from: startOfDay(from), to: endOfDay(now), label: "هذا الأسبوع" };
  }
  if (text.includes("الشهر الماضي") || text.includes("الشهر السابق")) {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from, to, label: "الشهر الماضي" };
  }
  if (text.includes("الشهر") || text.includes("شهر")) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { from, to, label: "هذا الشهر" };
  }
  if (text.includes("السنة") || text.includes("العام")) {
    const from = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    const to = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    return { from, to, label: "هذا العام" };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* المحرّك القائم على القواعد                                           */
/* ------------------------------------------------------------------ */

/** كلمات الإجراء الإنشائي تساعد على تمييز "إنشاء فاتورة" عن "الفواتير غير المدفوعة". */
const CREATE_VERBS = ["أنشئ", "انشئ", "إنشاء", "انشاء", "أصدر", "اصدر", "اعمل", "سجّل", "سجل", "أضف", "اضف", "إضافة", "اضافة"];

/**
 * يستخرج وسائط أداة محددة من رسالة (يُستخدم عند جمع الحقول الناقصة عبر عدة رسائل).
 * يدمج المستدعي هذه الوسائط مع ما سبق جمعه.
 */
export function extractArgsForTool(tool: ToolName, message: string): ToolArgs {
  const text = message.trim();
  const args: ToolArgs = {};

  switch (tool) {
    case "get_customer_balance": {
      const name = extractNameAfter(text, ["العميل", "عميل", "للعميل", "باسم", "حساب"]) ?? text;
      if (name) args.customerName = name.replace(/^ال/, "");
      break;
    }
    case "get_sales": {
      const period = extractPeriod(text);
      if (period) {
        args.from = period.from;
        args.to = period.to;
        args.periodLabel = period.label;
      }
      break;
    }
    case "create_invoice": {
      const name = extractNameAfter(text, ["للعميل", "العميل", "عميل", "باسم", "لـ"]);
      if (name) args.customerName = name;
      const amount = extractAmount(text);
      if (amount !== null) args.amount = amount;
      break;
    }
    case "create_customer": {
      const phone = extractPhone(text);
      if (phone) args.phone = phone;
      const withoutPhone = phone ? text.replace(phone, " ") : text;
      const name = extractNameAfter(withoutPhone, ["العميل", "عميل", "اسمه", "باسم", "الاسم"]);
      if (name) args.name = name;
      break;
    }
    case "record_expense": {
      const amount = extractAmount(text);
      if (amount !== null) args.amount = amount;
      const category =
        extractNameAfter(text, ["تصنيف", "فئة", "نوع", "بند", "على"]) ?? null;
      if (category) args.category = category;
      break;
    }
    case "list_unpaid_invoices":
    default:
      break;
  }

  return args;
}

/**
 * المحرّك الافتراضي القائم على القواعد: يطابق كلمات مفتاحية عربية لتحديد الأداة ثم يستخرج
 * وسائطها. يعمل دون اتصال بالشبكة ويعطي نتائج حتمية (deterministic).
 */
export class RuleBasedModel implements AssistantModel {
  parse(message: string, context?: ParseContext): ParsedIntent {
    const text = normalizeDigits(message.trim());

    // عند جمع الحقول الناقصة لأداة محددة، نستخرج وسائطها مباشرةً دون إعادة تصنيف النية.
    if (context?.collectingTool) {
      return {
        tool: context.collectingTool,
        args: extractArgsForTool(context.collectingTool, message),
        confidence: 1,
      };
    }

    const isCreate = hasAny(text, CREATE_VERBS);

    // 1) الفواتير غير المدفوعة (يُفحص قبل "فاتورة" العامة).
    if (hasAny(text, ["غير المدفوعة", "غير مدفوعة", "المتأخرة", "المستحقة", "لم تُدفع", "لم تدفع"])) {
      return { tool: "list_unpaid_invoices", args: {}, confidence: 1 };
    }

    // 2) رصيد عميل.
    if (text.includes("رصيد")) {
      return {
        tool: "get_customer_balance",
        args: extractArgsForTool("get_customer_balance", message),
        confidence: 1,
      };
    }

    // 3) مبيعات فترة.
    if (text.includes("مبيعات") || text.includes("المبيعات")) {
      return {
        tool: "get_sales",
        args: extractArgsForTool("get_sales", message),
        confidence: 1,
      };
    }

    // 4) إضافة عميل.
    if (isCreate && hasAny(text, ["عميل", "زبون"])) {
      return {
        tool: "create_customer",
        args: extractArgsForTool("create_customer", message),
        confidence: 1,
      };
    }

    // 5) تسجيل مصروف.
    if (hasAny(text, ["مصروف", "مصاريف", "صرف"])) {
      return {
        tool: "record_expense",
        args: extractArgsForTool("record_expense", message),
        confidence: 1,
      };
    }

    // 6) إنشاء فاتورة.
    if (hasAny(text, ["فاتورة", "فواتير"]) && (isCreate || text.includes("بمبلغ") || text.includes("بقيمة"))) {
      return {
        tool: "create_invoice",
        args: extractArgsForTool("create_invoice", message),
        confidence: 1,
      };
    }

    // تعذّر الفهم: ثقة منخفضة لطلب التوضيح (المتطلب 10.4).
    return { tool: null, args: {}, confidence: 0 };
  }
}

/** المحرّك الافتراضي الجاهز للاستخدام. */
export const defaultModel = new RuleBasedModel();
