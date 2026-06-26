"use client";

/**
 * شاشة المساعد الذكي — المهمة 13.1 (المتطلبات 10.1–10.5, 11.1–11.6, 12.1).
 *
 * واجهة محادثة عربية تُرسل رسائل المستخدم إلى `POST /api/assistant` وتعرض ردّ المساعد،
 * مع تمرير حالة المحادثة (`state`) ذهاباً وإياباً بين الرسائل لإتمام تدفّقات طلب الحقول
 * الناقصة وتأكيد العمليات المالية عبر عدّة رسائل (المتطلبان 11.4, 11.5). يُميَّز نوع الردّ
 * (تأكيد/تحذير/خطأ) بصرياً.
 */
import { useRef, useState, useEffect } from "react";
import { Send, Bot, User as UserIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";

import { apiPost, ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

type ReplyKind =
  | "answer"
  | "result"
  | "clarification"
  | "need_fields"
  | "confirmation"
  | "cancelled"
  | "unauthorized"
  | "error";

interface AssistantReply {
  kind: ReplyKind;
  message: string;
  tool?: string;
  data?: unknown;
}

interface AssistantResponse {
  reply: AssistantReply;
  state: Record<string, unknown>;
}

interface ChatMessage {
  id: number;
  author: "user" | "assistant";
  text: string;
  kind?: ReplyKind;
}

/** لون شارة نوع الردّ. */
function bubbleClass(kind?: ReplyKind): string {
  switch (kind) {
    case "confirmation":
    case "need_fields":
      return "bg-amber-50 text-amber-900 border border-amber-200";
    case "unauthorized":
    case "error":
      return "bg-destructive/10 text-destructive border border-destructive/30";
    case "result":
      return "bg-emerald-50 text-emerald-900 border border-emerald-200";
    default:
      return "bg-muted text-foreground";
  }
}

let msgId = 0;

export default function AssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: ++msgId,
      author: "assistant",
      text:
        "مرحباً! يمكنني مساعدتك في الاستعلام عن رصيد عميل، أو مبيعات فترة، أو الفواتير غير " +
        "المدفوعة، وكذلك إنشاء فاتورة أو إضافة عميل أو تسجيل مصروف. كيف أساعدك؟",
      kind: "answer",
    },
  ]);
  const [input, setInput] = useState("");
  // حالة المحادثة المتنقّلة بين الرسائل (تأكيد/جمع حقول).
  const [conversationState, setConversationState] = useState<Record<string, unknown>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const sendMessage = useMutation({
    mutationFn: (message: string) =>
      apiPost<AssistantResponse>("/api/assistant", {
        message,
        state: conversationState,
      }),
    onSuccess: (data) => {
      setConversationState(data.state ?? {});
      setMessages((prev) => [
        ...prev,
        {
          id: ++msgId,
          author: "assistant",
          text: data.reply.message,
          kind: data.reply.kind,
        },
      ]);
    },
    onError: (error: unknown) => {
      setMessages((prev) => [
        ...prev,
        {
          id: ++msgId,
          author: "assistant",
          text: error instanceof ApiError ? error.message : "حدث خطأ، يرجى المحاولة لاحقاً.",
          kind: "error",
        },
      ]);
    },
  });

  // التمرير لأسفل عند إضافة رسالة.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sendMessage.isPending) return;
    setMessages((prev) => [...prev, { id: ++msgId, author: "user", text }]);
    setInput("");
    sendMessage.mutate(text);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col">
      <PageHeader
        title="المساعد الذكي"
        description="استعلم عن البيانات ونفّذ العمليات عبر المحادثة بالعربية."
      />

      <Card className="flex flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex items-start gap-2",
                msg.author === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  msg.author === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                )}
              >
                {msg.author === "user" ? (
                  <UserIcon className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>
              <div
                className={cn(
                  "max-w-[75%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm",
                  msg.author === "user"
                    ? "bg-primary text-primary-foreground"
                    : bubbleClass(msg.kind)
                )}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {sendMessage.isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="h-4 w-4" />
              <span>يكتب…</span>
            </div>
          ) : null}
        </div>

        <form onSubmit={handleSend} className="flex gap-2 border-t p-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="اكتب رسالتك…"
            disabled={sendMessage.isPending}
          />
          <Button type="submit" size="icon" disabled={sendMessage.isPending} aria-label="إرسال">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
