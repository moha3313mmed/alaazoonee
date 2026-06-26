/**
 * خدمة المساعد الذكي (AssistantService) — المهام 12.2 و 12.3.
 *
 * تنسّق هذه الخدمة دورة المحادثة الكاملة:
 *  1. تحوّل الرسالة العربية إلى نية (أداة + وسائط) عبر محرّك الفهم (`AssistantModel`).
 *  2. تطلب توضيحاً بالعربية عند تعذّر الفهم بدلاً من إجابة غير مؤكدة (المتطلب 10.4).
 *  3. تمنع أي أداة لا يصرّح بها دور المستخدم وتعرض رسالة عدم تصريح (المتطلبان 10.5, 11.6).
 *  4. تطلب الحقول الناقصة بالعربية قبل التنفيذ، وتجمعها عبر عدة رسائل (المتطلب 11.5).
 *  5. تعرض ملخّص العملية وتطلب تأكيداً صريحاً قبل تنفيذ أي عملية ذات أثر مالي (المتطلب 11.4).
 *  6. تنفّذ العملية عبر خدمة الأعمال نفسها (مصدر واحد للحقيقة) وتعرض ملخّص النتيجة
 *     (المتطلبات 10.1–10.3, 11.1–11.3).
 *
 * الخدمة عديمة الحالة على مستوى الخادم: تُمرَّر حالة المحادثة (`ConversationState`) ذهاباً
 * وإياباً مع كل نداء، فيتولّى المستدعي (طبقة الـ API/الواجهة) الاحتفاظ بها بين الرسائل.
 */
import type { Session } from "@/lib/auth/types";
import { prisma } from "@/lib/db/client";

import { defaultModel, type AssistantModel } from "./intent";
import {
  TOOLS,
  UNAUTHORIZED_MESSAGE,
  getTool,
  isToolAuthorized,
  type AssistantTool,
  type ToolArgs,
  type ToolName,
} from "./tools";

/** عملية معلّقة بانتظار التأكيد (لعملية ذات أثر مالي). */
export interface PendingAction {
  tool: ToolName;
  args: ToolArgs;
}

/** أداة يجري جمع حقولها الناقصة عبر عدة رسائل. */
export interface CollectingAction {
  tool: ToolName;
  args: ToolArgs;
}

/** حالة المحادثة المتنقّلة بين الرسائل (يحتفظ بها المستدعي). */
export interface ConversationState {
  /** عملية مالية بانتظار التأكيد. */
  pending?: PendingAction;
  /** أداة بانتظار استكمال حقولها الناقصة. */
  collecting?: CollectingAction;
}

/** نوع ردّ المساعد، مُمَيَّز ليتمكّن المستدعي من عرضه بالشكل المناسب. */
export type AssistantReplyKind =
  | "answer" // إجابة استعلام
  | "result" // نتيجة تنفيذ عملية
  | "clarification" // طلب توضيح
  | "need_fields" // طلب حقول ناقصة
  | "confirmation" // طلب تأكيد عملية مالية
  | "cancelled" // إلغاء عملية معلّقة
  | "unauthorized" // عملية غير مصرّح بها
  | "error"; // خطأ في التنفيذ

/** ردّ المساعد الموحّد. */
export interface AssistantReply {
  kind: AssistantReplyKind;
  /** نص الرد بالعربية. */
  message: string;
  /** الأداة المعنية (إن وُجدت). */
  tool?: ToolName;
  /** بيانات إضافية للعرض (نتائج الاستعلام/التنفيذ). */
  data?: unknown;
}

/** نتيجة `handleMessage`: الرد + حالة المحادثة المحدّثة لتمريرها في النداء التالي. */
export interface HandleMessageResult {
  reply: AssistantReply;
  state: ConversationState;
}

/** كلمات تأكيد العملية المعلّقة. */
const CONFIRM_WORDS = ["نعم", "تأكيد", "أكد", "اكد", "موافق", "تمام", "اوافق", "أوافق", "نفّذ", "نفذ"];
/** كلمات إلغاء العملية المعلّقة. */
const CANCEL_WORDS = ["لا", "إلغاء", "الغاء", "ألغِ", "الغ", "تراجع", "رفض", "كنسل"];

/** يتحقق من تطابق الرسالة مع أي كلمة ضمن قائمة (مطابقة على مستوى الكلمات). */
function matchesAny(message: string, words: string[]): boolean {
  const normalized = message.trim();
  return words.some((w) => normalized === w || normalized.startsWith(w + " ") || normalized.includes(w));
}

/** يدمج وسائط جديدة فوق سابقة مع تجاهل القيم الفارغة. */
function mergeArgs(base: ToolArgs, incoming: ToolArgs): ToolArgs {
  const merged: ToolArgs = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (value !== undefined && value !== null && value !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

/** يسجّل تفاعل المساعد (أفضل جهد، لا يعطّل الرد عند فشل التسجيل). */
async function logInteraction(
  session: Session,
  message: string,
  resolvedIntent: string | null,
  executedToolId: string | null,
): Promise<void> {
  try {
    await prisma.assistantLog.create({
      data: {
        userId: session.userId,
        message,
        resolvedIntent: resolvedIntent ?? undefined,
        executedToolId: executedToolId ?? undefined,
      },
    });
  } catch {
    // التسجيل اختياري؛ لا نُفشل الرد بسببه.
  }
}

/**
 * خدمة المساعد الذكي. تقبل محرّك فهم قابلاً للحقن (افتراضياً المحرّك القائم على القواعد)
 * ليتسنّى استبداله بنموذج LLM دون تعديل منطق التنسيق.
 */
export class AssistantService {
  private readonly model: AssistantModel;

  constructor(model: AssistantModel = defaultModel) {
    this.model = model;
  }

  /**
   * يعالج رسالة المستخدم ويعيد ردّاً + حالة محادثة محدّثة.
   *
   * @param session جلسة المستخدم (لفرض الصلاحيات وقصر النتائج).
   * @param message نص الرسالة العربية.
   * @param state حالة المحادثة من النداء السابق (اختيارية).
   */
  async handleMessage(
    session: Session,
    message: string,
    state: ConversationState = {},
  ): Promise<HandleMessageResult> {
    const text = (message ?? "").trim();
    if (!text) {
      return {
        reply: { kind: "clarification", message: "لم أتلقَّ أي رسالة. كيف يمكنني مساعدتك؟" },
        state,
      };
    }

    // (المتطلب 11.4) إذا كانت هناك عملية مالية معلّقة، فالرسالة الحالية ردّ على طلب التأكيد.
    if (state.pending) {
      return this.handleConfirmation(session, text, state.pending);
    }

    // (المتطلب 11.5) إذا كنا نجمع حقولاً ناقصة لأداة، نُكمل الجمع بالرسالة الحالية.
    if (state.collecting) {
      const tool = getTool(state.collecting.tool);
      if (tool) {
        const incoming = await this.model.parse(text, { collectingTool: tool.name });
        const args = mergeArgs(state.collecting.args, incoming.args);
        return this.routeTool(session, tool, args, text);
      }
    }

    // تحليل النية من رسالة جديدة.
    const intent = await this.model.parse(text);

    // (المتطلب 10.4) تعذّر الفهم: طلب توضيح بدلاً من إجابة غير مؤكدة.
    if (!intent.tool || intent.confidence < 0.5) {
      await logInteraction(session, text, null, null);
      return {
        reply: {
          kind: "clarification",
          message:
            "لم أفهم طلبك بدقة. يمكنني مساعدتك في: الاستعلام عن رصيد عميل، أو مبيعات فترة، " +
            "أو الفواتير غير المدفوعة، أو إنشاء فاتورة، أو إضافة عميل، أو تسجيل مصروف. " +
            "هل يمكنك إعادة الصياغة؟",
        },
        state: {},
      };
    }

    const tool = TOOLS[intent.tool];
    return this.routeTool(session, tool, intent.args, text);
  }

  /**
   * يوجّه أداة محدّدة بوسائطها عبر مراحل: الصلاحية → الحقول الناقصة → التأكيد المالي → التنفيذ.
   */
  private async routeTool(
    session: Session,
    tool: AssistantTool,
    args: ToolArgs,
    rawMessage: string,
  ): Promise<HandleMessageResult> {
    // (المتطلبان 10.5, 11.6) منع الأدوات غير المصرّح بها لدور المستخدم.
    if (!isToolAuthorized(session, tool)) {
      await logInteraction(session, rawMessage, tool.name, null);
      return {
        reply: { kind: "unauthorized", message: UNAUTHORIZED_MESSAGE, tool: tool.name },
        state: {},
      };
    }

    // (المتطلب 11.5) طلب الحقول الناقصة بالعربية قبل المتابعة.
    const missing = tool.missingFields(args);
    if (missing.length > 0) {
      return {
        reply: {
          kind: "need_fields",
          message: `لإتمام العملية أحتاج إلى: ${missing.join("، ")}.`,
          tool: tool.name,
          data: { missing },
        },
        // نحتفظ بما جُمع لاستكماله في الرسالة التالية.
        state: { collecting: { tool: tool.name, args } },
      };
    }

    // (المتطلب 11.4) العمليات ذات الأثر المالي تتطلّب عرض ملخّص وطلب تأكيد قبل التنفيذ.
    if (tool.hasFinancialEffect) {
      return {
        reply: {
          kind: "confirmation",
          message: `${tool.summarize(args)}\nهل تؤكّد تنفيذ هذه العملية؟ (نعم/لا)`,
          tool: tool.name,
          data: { args },
        },
        state: { pending: { tool: tool.name, args } },
      };
    }

    // أدوات الاستعلام (بلا أثر مالي): تنفيذ فوري وعرض النتيجة.
    return this.runTool(session, tool, args, rawMessage, "answer");
  }

  /** يعالج ردّ المستخدم على طلب تأكيد عملية مالية معلّقة (المتطلب 11.4). */
  private async handleConfirmation(
    session: Session,
    text: string,
    pending: PendingAction,
  ): Promise<HandleMessageResult> {
    const tool = getTool(pending.tool);
    if (!tool) {
      return { reply: { kind: "error", message: "تعذّر إيجاد العملية المعلّقة." }, state: {} };
    }

    if (matchesAny(text, CANCEL_WORDS)) {
      await logInteraction(session, text, tool.name, null);
      return {
        reply: { kind: "cancelled", message: "تم إلغاء العملية ولم يُنفَّذ أي إجراء.", tool: tool.name },
        state: {},
      };
    }

    if (matchesAny(text, CONFIRM_WORDS)) {
      // (المتطلبان 10.5, 11.6) إعادة التحقق من الصلاحية عند التنفيذ (دفاع في العمق).
      if (!isToolAuthorized(session, tool)) {
        return {
          reply: { kind: "unauthorized", message: UNAUTHORIZED_MESSAGE, tool: tool.name },
          state: {},
        };
      }
      return this.runTool(session, tool, pending.args, text, "result");
    }

    // ردّ غير واضح: إعادة طلب التأكيد مع إبقاء العملية معلّقة.
    return {
      reply: {
        kind: "confirmation",
        message: `لم أفهم ردّك. ${tool.summarize(pending.args)}\nيرجى الرد بـ"نعم" للتأكيد أو "لا" للإلغاء.`,
        tool: tool.name,
        data: { args: pending.args },
      },
      state: { pending },
    };
  }

  /** ينفّذ الأداة عبر الخدمة المقابلة ويحوّل نتيجتها إلى ردّ موحّد. */
  private async runTool(
    session: Session,
    tool: AssistantTool,
    args: ToolArgs,
    rawMessage: string,
    successKind: "answer" | "result",
  ): Promise<HandleMessageResult> {
    try {
      const result = await tool.execute(session, args);
      if (!result.ok) {
        await logInteraction(session, rawMessage, tool.name, null);
        return {
          reply: { kind: "error", message: result.message, tool: tool.name, data: { fields: result.fields } },
          state: {},
        };
      }

      await logInteraction(session, rawMessage, tool.name, tool.name);
      return {
        reply: { kind: successKind, message: result.message, tool: tool.name, data: result.data },
        state: {},
      };
    } catch {
      return {
        reply: { kind: "error", message: "حدث خطأ، يرجى المحاولة لاحقاً.", tool: tool.name },
        state: {},
      };
    }
  }
}

/** نسخة جاهزة من خدمة المساعد بالمحرّك الافتراضي. */
export const assistantService = new AssistantService();

export default assistantService;
