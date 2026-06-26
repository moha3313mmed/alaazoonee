/**
 * خدمة الفوترة والتسعير (BillingService) — المهمة 5 (5.1 + 5.2).
 *
 * تمثّل المصدر الموحّد لمنطق التسعير وعروض الأسعار الذي تستخدمه الواجهة والمساعد الذكي معاً
 * (مبدأ "مصدر واحد للحقيقة"). تغطّي هذه الوحدة:
 *
 *  - احتساب سعر البند بالقياس (العرض × الارتفاع × سعر المتر المربع) وبالقطعة (الكمية × سعر الوحدة).
 *    (المهمة 5.1 — المتطلبات 4.1, 4.6)
 *  - رفض أي بند بالقياس قيمه (العرض/الارتفاع/سعر المتر) ≤ 0 مع رسالة عربية واضحة.
 *    (المهمة 5.1 — المتطلب 4.4)
 *  - احتساب إجمالي عرض السعر (مجموع البنود) وتطبيق الخصم والضريبة لاحتساب الصافي.
 *    (المهمة 5.1 — المتطلبات 4.2, 4.3)
 *  - حفظ عرض السعر ببنوده ونسب الخصم/الضريبة وحالته، وتحويله إلى فاتورة مع الاحتفاظ
 *    بجميع البنود والقيم. (المهمة 5.2 — المتطلب 4.5)
 *
 * ملاحظة بشأن الدقة: تُجرى جميع الحسابات المالية بنوع Decimal لتفادي أخطاء الفاصلة العائمة
 * (المتطلبات 9.2, 12.4). وتُنفَّذ العمليات متعددة الخطوات (تحويل العرض إلى فاتورة) داخل
 * معاملة قاعدة بيانات (transaction) لضمان التماسك.
 */
import {
  InvoiceStatus,
  LineItemKind,
  Prisma,
  QuoteStatus,
  type Invoice,
  type InvoiceItem,
  type Payment,
  type Quote,
  type QuoteItem,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { Decimal, ZERO, toDecimal } from "@/lib/db/decimal";
import { CustomerService } from "@/lib/services/customerService";

/** القيم العربية المعتمدة لرسائل الأخطاء (وثيقة التصميم: قسم معالجة الأخطاء). */
export const BILLING_MESSAGES = {
  /** المتطلب 4.4: رفض البند بالقياس بقيم ≤ 0. */
  INVALID_MEASURE: "قيم القياس يجب أن تكون أكبر من صفر",
  /** قيم البند بالقطعة (الكمية/سعر الوحدة) يجب أن تكون أكبر من صفر. */
  INVALID_PIECE: "قيم البند بالقطعة يجب أن تكون أكبر من صفر",
  /** نوع تسعير غير معروف للبند. */
  INVALID_KIND: "نوع تسعير البند غير صالح",
  /** نسبة الخصم خارج النطاق المسموح (0 إلى 100). */
  INVALID_DISCOUNT: "نسبة الخصم يجب أن تكون بين 0 و 100",
  /** نسبة الضريبة يجب ألا تكون سالبة. */
  INVALID_TAX: "نسبة الضريبة يجب أن تكون صفراً أو أكثر",
  /** عرض السعر يجب أن يحتوي بنداً واحداً على الأقل. */
  EMPTY_QUOTE: "عرض السعر يجب أن يتضمّن بنداً واحداً على الأقل",
  /** معرّف العميل مطلوب لإنشاء عرض السعر. */
  CUSTOMER_REQUIRED: "معرّف العميل مطلوب",
  /** عرض السعر غير موجود. */
  QUOTE_NOT_FOUND: "عرض السعر غير موجود",
  /** عرض السعر سبق تحويله إلى فاتورة أو أُلغي. */
  QUOTE_NOT_CONVERTIBLE: "لا يمكن تحويل عرض السعر في حالته الحالية",
  /** الفاتورة يجب أن تتضمّن بنداً واحداً على الأقل. */
  EMPTY_INVOICE: "الفاتورة يجب أن تتضمّن بنداً واحداً على الأقل",
  /** العميل غير موجود. */
  CUSTOMER_NOT_FOUND: "العميل غير موجود",
  /** الفاتورة غير موجودة. */
  INVOICE_NOT_FOUND: "الفاتورة غير موجودة",
  /** المتطلب 5.6: رفض الدفعة التي تتجاوز المبلغ المتبقي. */
  PAYMENT_EXCEEDS_REMAINING: "قيمة الدفعة تتجاوز المبلغ المتبقي",
  /** قيمة الدفعة يجب أن تكون أكبر من صفر. */
  INVALID_PAYMENT: "قيمة الدفعة يجب أن تكون أكبر من صفر",
} as const;

/**
 * خطأ خدمة موحّد بنمط مُمَيَّز (discriminated union) يُعاد بدلاً من رمي الاستثناءات،
 * ليتيح للمستدعي عرض رسالة عربية واضحة للمستخدم.
 */
export type BillingError =
  | { error: "VALIDATION"; message: string; fields?: string[] }
  | { error: "NOT_FOUND"; message: string }
  | { error: "CONFLICT"; message: string };

/**
 * حارس نوع للتفريق بين نتيجة ناجحة وخطأ خدمة.
 * @example
 * const total = computeLineTotal(item);
 * if (isBillingError(total)) { // اعرض total.message } else { // total هو Decimal }
 */
export function isBillingError(value: unknown): value is BillingError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

/**
 * مدخلات بند تسعير واحد (عرض سعر/فاتورة). تطابق بنية QuoteItem/InvoiceItem في المخطط.
 * للبنود بالقياس تُستخدم widthM/heightM/pricePerSqm، وللبنود بالقطعة quantity/unitPrice.
 */
export interface LineItemInput {
  kind: LineItemKind;
  description?: string;
  /** العرض بالمتر (للبنود بالقياس). */
  widthM?: Prisma.Decimal.Value | null;
  /** الارتفاع بالمتر (للبنود بالقياس). */
  heightM?: Prisma.Decimal.Value | null;
  /** سعر المتر المربع (للبنود بالقياس). */
  pricePerSqm?: Prisma.Decimal.Value | null;
  /** الكمية (للبنود بالقطعة). */
  quantity?: Prisma.Decimal.Value | null;
  /** سعر الوحدة (للبنود بالقطعة). */
  unitPrice?: Prisma.Decimal.Value | null;
  /** ربط البند بصنف مخزون (اختياري) للخصم لاحقاً عند الاعتماد. */
  inventoryItemId?: string | null;
}

/** مدخلات إنشاء عرض سعر جديد ببنوده ونسب الخصم/الضريبة. */
export interface CreateQuoteInput {
  customerId: string;
  discountPct?: Prisma.Decimal.Value;
  taxPct?: Prisma.Decimal.Value;
  items: LineItemInput[];
}

/**
 * مدخلات إنشاء فاتورة مباشرة (دون عرض سعر) ببنودها ونسب الخصم/الضريبة.
 * تطابق بنية CreateQuoteInput إذ تشترك الفاتورة وعرض السعر في بنية البنود نفسها.
 */
export interface CreateInvoiceInput {
  customerId: string;
  discountPct?: Prisma.Decimal.Value;
  taxPct?: Prisma.Decimal.Value;
  items: LineItemInput[];
}

/** الدقة المعتمدة لتخزين القيم المالية (NUMERIC(14,3) في المخطط). */
const MONEY_SCALE = 3;

/**
 * يحوّل قيمة إلى Decimal بشكل آمن، ويعيد null إذا كانت غائبة أو غير صالحة.
 * يُستخدم قبل التحقق من الإشارة (> 0) في احتساب البنود.
 */
function parseDecimal(
  value: Prisma.Decimal.Value | null | undefined,
): Prisma.Decimal | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    const d = toDecimal(value);
    return d.isNaN() ? null : d;
  } catch {
    return null;
  }
}

/** يقرّب قيمة مالية إلى دقة التخزين (3 منازل عشرية) بأسلوب التقريب نصف لأعلى. */
function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
}

/**
 * يحتسب سعر البند:
 *  - بالقياس: المساحة (العرض × الارتفاع) × سعر المتر المربع. (المتطلب 4.1)
 *  - بالقطعة: الكمية × سعر الوحدة. (المتطلب 4.6)
 *
 * (المتطلب 4.4) يُرفض البند بالقياس إذا كانت أيٌّ من قيمه (العرض/الارتفاع/سعر المتر) ≤ 0،
 * وبالمثل يُرفض البند بالقطعة إذا كانت الكمية أو سعر الوحدة ≤ 0.
 *
 * @returns قيمة Decimal للسعر الإجمالي للبند، أو BillingError عند قيم غير صالحة.
 */
export function computeLineTotal(
  item: LineItemInput,
): Prisma.Decimal | BillingError {
  if (item.kind === LineItemKind.BY_MEASURE) {
    const width = parseDecimal(item.widthM);
    const height = parseDecimal(item.heightM);
    const rate = parseDecimal(item.pricePerSqm);

    if (
      !width ||
      !height ||
      !rate ||
      !width.greaterThan(ZERO) ||
      !height.greaterThan(ZERO) ||
      !rate.greaterThan(ZERO)
    ) {
      return {
        error: "VALIDATION",
        message: BILLING_MESSAGES.INVALID_MEASURE,
        fields: ["widthM", "heightM", "pricePerSqm"],
      };
    }

    return width.times(height).times(rate);
  }

  if (item.kind === LineItemKind.BY_PIECE) {
    const quantity = parseDecimal(item.quantity);
    const unitPrice = parseDecimal(item.unitPrice);

    if (
      !quantity ||
      !unitPrice ||
      !quantity.greaterThan(ZERO) ||
      !unitPrice.greaterThan(ZERO)
    ) {
      return {
        error: "VALIDATION",
        message: BILLING_MESSAGES.INVALID_PIECE,
        fields: ["quantity", "unitPrice"],
      };
    }

    return quantity.times(unitPrice);
  }

  return { error: "VALIDATION", message: BILLING_MESSAGES.INVALID_KIND, fields: ["kind"] };
}

/**
 * يحتسب إجمالي عرض السعر كمجموع أسعار جميع بنوده. (المتطلب 4.2)
 * يعيد أول BillingError يصادفه إذا كان أحد البنود غير صالح.
 *
 * @returns مجموع أسعار البنود كـ Decimal، أو BillingError.
 */
export function computeQuoteSubtotal(
  items: LineItemInput[],
): Prisma.Decimal | BillingError {
  let subtotal: Prisma.Decimal = new Decimal(0);

  for (const item of items) {
    const total = computeLineTotal(item);
    if (isBillingError(total)) return total;
    subtotal = subtotal.plus(total);
  }

  return subtotal;
}

/**
 * يطبّق نسبة الخصم ثم نسبة الضريبة على الإجمالي ويعيد الصافي. (المتطلب 4.3)
 *
 * الصيغة: الصافي = الإجمالي × (1 − نسبة الخصم/100) × (1 + نسبة الضريبة/100).
 * النسب تُمرَّر كأرقام مئوية (مثال: 15 تعني 15%).
 *
 * @param subtotal إجمالي البنود قبل الخصم والضريبة.
 * @param discountPct نسبة الخصم المئوية (0 إلى 100).
 * @param taxPct نسبة الضريبة المئوية (≥ 0).
 * @returns الصافي مقرّباً لدقة التخزين، أو BillingError عند نِسَب غير صالحة.
 */
export function applyDiscountAndTax(
  subtotal: Prisma.Decimal.Value,
  discountPct: Prisma.Decimal.Value = 0,
  taxPct: Prisma.Decimal.Value = 0,
): Prisma.Decimal | BillingError {
  const base = parseDecimal(subtotal) ?? ZERO;
  const discount = parseDecimal(discountPct);
  const tax = parseDecimal(taxPct);

  if (!discount || discount.lessThan(ZERO) || discount.greaterThan(new Decimal(100))) {
    return {
      error: "VALIDATION",
      message: BILLING_MESSAGES.INVALID_DISCOUNT,
      fields: ["discountPct"],
    };
  }
  if (!tax || tax.lessThan(ZERO)) {
    return { error: "VALIDATION", message: BILLING_MESSAGES.INVALID_TAX, fields: ["taxPct"] };
  }

  const HUNDRED = new Decimal(100);
  const discountFactor = HUNDRED.minus(discount).dividedBy(HUNDRED); // (1 − d/100)
  const taxFactor = HUNDRED.plus(tax).dividedBy(HUNDRED); // (1 + t/100)

  return roundMoney(base.times(discountFactor).times(taxFactor));
}

/**
 * يحوّل LineItemInput إلى بيانات حقول البند المخزّنة (مشتركة بين QuoteItem و InvoiceItem)،
 * مع تعيين الحقول غير المتعلقة بنوع التسعير إلى null وضبط lineTotal المحسوب مقرّباً.
 */
function toItemData(item: LineItemInput, lineTotal: Prisma.Decimal) {
  const isMeasure = item.kind === LineItemKind.BY_MEASURE;
  return {
    kind: item.kind,
    description: item.description ?? "",
    widthM: isMeasure ? parseDecimal(item.widthM) : null,
    heightM: isMeasure ? parseDecimal(item.heightM) : null,
    pricePerSqm: isMeasure ? parseDecimal(item.pricePerSqm) : null,
    quantity: isMeasure ? null : parseDecimal(item.quantity),
    unitPrice: isMeasure ? null : parseDecimal(item.unitPrice),
    inventoryItemId: item.inventoryItemId ?? null,
    lineTotal: roundMoney(lineTotal),
  };
}

/**
 * ينشئ عرض سعر جديد ببنوده ونسب الخصم/الضريبة، بحالة ابتدائية "مسودة" (DRAFT). (المهمة 5.2)
 *
 * يتحقق من وجود العميل والبنود، ويحتسب lineTotal لكل بند، ويرفض أي قيم غير صالحة
 * (المتطلبات 4.1, 4.4, 4.6) قبل الحفظ.
 *
 * @returns عرض السعر المحفوظ متضمناً بنوده، أو BillingError.
 */
export async function createQuote(
  input: CreateQuoteInput,
): Promise<(Quote & { items: QuoteItem[] }) | BillingError> {
  const customerId = (input?.customerId ?? "").trim();
  if (!customerId) {
    return { error: "VALIDATION", message: BILLING_MESSAGES.CUSTOMER_REQUIRED, fields: ["customerId"] };
  }

  const items = input?.items ?? [];
  if (items.length === 0) {
    return { error: "VALIDATION", message: BILLING_MESSAGES.EMPTY_QUOTE, fields: ["items"] };
  }

  // احتسب كل بند وارفض أول قيمة غير صالحة. (المتطلبات 4.1, 4.4, 4.6)
  const itemsData = [];
  for (const item of items) {
    const lineTotal = computeLineTotal(item);
    if (isBillingError(lineTotal)) return lineTotal;
    itemsData.push(toItemData(item, lineTotal));
  }

  // تحقّق من نسب الخصم/الضريبة عبر إعادة استخدام منطق applyDiscountAndTax. (المتطلب 4.3)
  const discountPct = input.discountPct ?? 0;
  const taxPct = input.taxPct ?? 0;
  const netCheck = applyDiscountAndTax(0, discountPct, taxPct);
  if (isBillingError(netCheck)) return netCheck;

  return prisma.quote.create({
    data: {
      customerId,
      discountPct: toDecimal(discountPct),
      taxPct: toDecimal(taxPct),
      status: QuoteStatus.DRAFT,
      items: { create: itemsData },
    },
    include: { items: true },
  });
}

/**
 * يولّد رقم فاتورة فريداً تسلسلياً بصيغة INV-XXXXXX داخل المعاملة.
 * (المتطلب 5.1: رقم فريد للفاتورة — يُستكمل في المهمة 7.)
 */
async function nextInvoiceNumber(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.invoice.count();
  return `INV-${String(count + 1).padStart(6, "0")}`;
}

/**
 * يحوّل عرض سعر معتمَداً إلى فاتورة مع الاحتفاظ بجميع بنوده وقيمه. (المتطلب 4.5 / المهمة 5.2)
 *
 * يُنشئ فاتورة برقم فريد وتاريخ إصدار، وينسخ بنود العرض كما هي، ويحتسب الإجمالي والصافي
 * (بعد الخصم والضريبة)، ويضبط المتبقي = الصافي والحالة "غير مدفوعة"، ثم يحدّث حالة العرض
 * إلى "محوّل" (CONVERTED). تُنفَّذ الخطوات داخل معاملة واحدة لضمان التماسك.
 *
 * اعتماد الفاتورة: عند إنشائها يزداد رصيد العميل المستحق بقيمة صافي الفاتورة عبر
 * CustomerService.applyTransaction ضمن المعاملة نفسها. (المتطلب 5.2)
 *
 * @returns الفاتورة المنشأة، أو BillingError إذا تعذّر التحويل.
 */
export async function convertQuoteToInvoice(
  quoteId: string,
): Promise<Invoice | BillingError> {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quote.findUnique({
      where: { id: quoteId },
      include: { items: true },
    });

    if (!quote) {
      return { error: "NOT_FOUND", message: BILLING_MESSAGES.QUOTE_NOT_FOUND } satisfies BillingError;
    }

    // يُمنع التحويل إذا سبق تحويل العرض أو أُلغي. (تماسك المتطلب 4.5)
    if (quote.status === QuoteStatus.CONVERTED || quote.status === QuoteStatus.CANCELLED) {
      return {
        error: "CONFLICT",
        message: BILLING_MESSAGES.QUOTE_NOT_CONVERTIBLE,
      } satisfies BillingError;
    }

    // الإجمالي = مجموع lineTotal للبنود المخزّنة. (المتطلب 4.2)
    const subtotal = quote.items.reduce<Prisma.Decimal>(
      (sum, item) => sum.plus(new Decimal(item.lineTotal)),
      new Decimal(0),
    );

    // الصافي بعد الخصم والضريبة. (المتطلب 4.3)
    const netResult = applyDiscountAndTax(subtotal, quote.discountPct, quote.taxPct);
    if (isBillingError(netResult)) return netResult;
    const netTotal = netResult;

    const number = await nextInvoiceNumber(tx);

    const invoice = await tx.invoice.create({
      data: {
        number,
        customerId: quote.customerId,
        quoteId: quote.id,
        subtotal: roundMoney(subtotal),
        discountPct: quote.discountPct,
        taxPct: quote.taxPct,
        netTotal,
        paidAmount: ZERO,
        remainingAmount: netTotal,
        status: InvoiceStatus.UNPAID,
        // نسخ البنود كما هي مع الاحتفاظ بقيمها. (المتطلب 4.5)
        items: {
          create: quote.items.map((item) => ({
            kind: item.kind,
            description: item.description,
            widthM: item.widthM,
            heightM: item.heightM,
            pricePerSqm: item.pricePerSqm,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            inventoryItemId: item.inventoryItemId,
            lineTotal: item.lineTotal,
          })),
        },
      },
    });

    await tx.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.CONVERTED },
    });

    // اعتماد الفاتورة: زيادة رصيد العميل المستحق بقيمة الصافي. (المتطلب 5.2)
    await CustomerService.applyTransaction(quote.customerId, netTotal, tx);

    return invoice;
  });
}

/**
 * ينشئ فاتورة مباشرة لعميل (دون عرض سعر مسبق) ويعتمدها فوراً. (المهمة 7.1 — المتطلبات 5.1, 5.2)
 *
 * (المتطلب 5.1) يولّد رقماً فريداً للفاتورة بصيغة INV-XXXXXX ويسجّل تاريخ الإصدار تلقائياً
 * (issueDate الافتراضي = الآن)، ويحتسب lineTotal لكل بند والإجمالي والصافي بعد الخصم والضريبة،
 * ويرفض أي قيم بنود غير صالحة (المتطلبات 4.1, 4.4, 4.6).
 *
 * (المتطلب 5.2) عند اعتماد الفاتورة (إنشائها) يزداد رصيد العميل المستحق بقيمة صافي الفاتورة
 * عبر CustomerService.applyTransaction، وتُنفَّذ كل الخطوات داخل معاملة واحدة لضمان التماسك.
 *
 * @returns الفاتورة المنشأة متضمنةً بنودها، أو BillingError عند مدخلات غير صالحة أو غياب العميل.
 */
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<(Invoice & { items: InvoiceItem[] }) | BillingError> {
  const customerId = (input?.customerId ?? "").trim();
  if (!customerId) {
    return { error: "VALIDATION", message: BILLING_MESSAGES.CUSTOMER_REQUIRED, fields: ["customerId"] };
  }

  const items = input?.items ?? [];
  if (items.length === 0) {
    return { error: "VALIDATION", message: BILLING_MESSAGES.EMPTY_INVOICE, fields: ["items"] };
  }

  // احتسب كل بند وارفض أول قيمة غير صالحة، وراكم الإجمالي. (المتطلبات 4.1, 4.4, 4.6)
  const itemsData = [];
  let subtotal: Prisma.Decimal = new Decimal(0);
  for (const item of items) {
    const lineTotal = computeLineTotal(item);
    if (isBillingError(lineTotal)) return lineTotal;
    itemsData.push(toItemData(item, lineTotal));
    subtotal = subtotal.plus(lineTotal);
  }

  // الصافي بعد الخصم والضريبة (يتحقق أيضاً من صحة النِسَب). (المتطلب 4.3)
  const discountPct = input.discountPct ?? 0;
  const taxPct = input.taxPct ?? 0;
  const netResult = applyDiscountAndTax(subtotal, discountPct, taxPct);
  if (isBillingError(netResult)) return netResult;
  const netTotal = netResult;

  return prisma.$transaction(async (tx) => {
    // تأكد من وجود العميل قبل الاعتماد لإرجاع خطأ واضح بدلاً من فشل قيد المفتاح الأجنبي.
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return { error: "NOT_FOUND", message: BILLING_MESSAGES.CUSTOMER_NOT_FOUND } satisfies BillingError;
    }

    const number = await nextInvoiceNumber(tx);

    const invoice = await tx.invoice.create({
      data: {
        number,
        customerId,
        subtotal: roundMoney(subtotal),
        discountPct: toDecimal(discountPct),
        taxPct: toDecimal(taxPct),
        netTotal,
        paidAmount: ZERO,
        remainingAmount: netTotal,
        status: InvoiceStatus.UNPAID,
        items: { create: itemsData },
      },
      include: { items: true },
    });

    // اعتماد الفاتورة: زيادة رصيد العميل المستحق بقيمة الصافي. (المتطلب 5.2)
    await CustomerService.applyTransaction(customerId, netTotal, tx);

    return invoice;
  });
}

/**
 * يصنّف حالة الفاتورة اعتماداً على المبلغ المتبقي والمدفوع. (المتطلبات 5.4, 5.5)
 *
 *  - المتبقي ≤ 0  ⇒ "مدفوعة بالكامل" (PAID). (المتطلب 5.5)
 *  - المتبقي > 0 ومدفوع شيء  ⇒ "مدفوعة جزئياً" (PARTIALLY_PAID). (المتطلب 5.4)
 *  - المتبقي > 0 ولم يُدفع شيء  ⇒ "غير مدفوعة" (UNPAID). (المتطلب 5.4)
 *
 * دالة خالصة (pure) لا تمسّ قاعدة البيانات، تقبل الحقول المالية فقط لتسهيل إعادة الاستخدام.
 */
export function classifyStatus(invoice: {
  paidAmount: Prisma.Decimal.Value;
  remainingAmount: Prisma.Decimal.Value;
}): InvoiceStatus {
  const paid = toDecimal(invoice.paidAmount);
  const remaining = toDecimal(invoice.remainingAmount);

  if (remaining.lessThanOrEqualTo(ZERO)) return InvoiceStatus.PAID;
  if (paid.greaterThan(ZERO)) return InvoiceStatus.PARTIALLY_PAID;
  return InvoiceStatus.UNPAID;
}

/**
 * يسجّل دفعة على فاتورة: يخصمها من المبلغ المتبقي، ويعيد تصنيف حالة الفاتورة،
 * ويحدّث رصيد العميل المستحق. (المهمة 7.2 — المتطلبات 5.3, 5.4, 5.5, 5.6)
 *
 * (المتطلب 5.6) تُرفض الدفعة التي تتجاوز المبلغ المتبقي مع رسالة عربية واضحة.
 * (المتطلب 5.3) يُنشأ سجل دفعة، ويُنقَص المتبقي ويُزاد المدفوع، ويُقلَّل رصيد العميل بقيمة الدفعة.
 * (المتطلبات 5.4, 5.5) تُعاد حالة الفاتورة عبر classifyStatus.
 *
 * تُنفَّذ كل الخطوات داخل معاملة واحدة لضمان التماسك بين الفاتورة والدفعة ورصيد العميل.
 *
 * @returns الفاتورة المحدَّثة متضمنةً مدفوعاتها، أو BillingError عند قيمة غير صالحة/تجاوز/عدم وجود.
 */
export async function recordPayment(
  invoiceId: string,
  amount: Prisma.Decimal.Value,
): Promise<(Invoice & { payments: Payment[] }) | BillingError> {
  const parsed = parseDecimal(amount);
  if (!parsed || !parsed.greaterThan(ZERO)) {
    return { error: "VALIDATION", message: BILLING_MESSAGES.INVALID_PAYMENT, fields: ["amount"] };
  }
  const paymentAmount = roundMoney(parsed);

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      return { error: "NOT_FOUND", message: BILLING_MESSAGES.INVOICE_NOT_FOUND } satisfies BillingError;
    }

    const remaining = new Decimal(invoice.remainingAmount);

    // (المتطلب 5.6) رفض الدفعة التي تتجاوز المبلغ المتبقي.
    if (paymentAmount.greaterThan(remaining)) {
      return {
        error: "CONFLICT",
        message: BILLING_MESSAGES.PAYMENT_EXCEEDS_REMAINING,
      } satisfies BillingError;
    }

    const newPaid = roundMoney(new Decimal(invoice.paidAmount).plus(paymentAmount));
    const newRemaining = roundMoney(new Decimal(invoice.netTotal).minus(newPaid));
    const status = classifyStatus({ paidAmount: newPaid, remainingAmount: newRemaining });

    // (المتطلب 5.3) تسجيل الدفعة وتحديث مبالغ الفاتورة وحالتها.
    await tx.payment.create({
      data: { invoiceId, amount: paymentAmount },
    });

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        status,
      },
      include: { payments: { orderBy: { date: "desc" } } },
    });

    // (المتطلب 5.3) تقليل رصيد العميل المستحق بقيمة الدفعة (delta سالب).
    await CustomerService.applyTransaction(invoice.customerId, paymentAmount.negated(), tx);

    return updated;
  });
}

/** واجهة الخدمة مجمّعة لتسهيل الاستيراد والاستخدام في طبقة الـ API والمساعد الذكي. */
export const BillingService = {
  computeLineTotal,
  computeQuoteSubtotal,
  applyDiscountAndTax,
  createQuote,
  convertQuoteToInvoice,
  createInvoice,
  recordPayment,
  classifyStatus,
  isBillingError,
} as const;

export default BillingService;
