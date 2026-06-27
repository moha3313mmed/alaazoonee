/**
 * نقاط نهاية المصروفات (Expenses API) — المهمة 11.1.
 *
 *  - GET  /api/expenses?from=...&to=... : قائمة المصروفات وإجماليها ضمن نطاق زمني
 *                                          (expenses:read).
 *  - POST /api/expenses                 : تسجيل مصروف جديد (expenses:write).
 *
 * عند ربط المصروف بمورد تحدّث الخدمة رصيد المورد. تُحوَّل أخطاء التحقق (المبلغ ≤ 0 أو
 * غياب التصنيف) إلى 400 بالعربية.
 *
 * المتطلبات: 6.1/6.2/6.3/6.4 (تسجيل المصروف والتحقق والربط بمورد والعرض الزمني)،
 *            1.3 (فرض الصلاحيات).
 */
import { withApi } from "@/lib/api/handler";
import {
  fail,
  ok,
  parseJsonBody,
  INVALID_BODY_MESSAGE,
} from "@/lib/api/respond";
import {
  ExpenseService,
  isExpenseValidationError,
} from "@/lib/services/expenseService";

// تشغيل المسار ديناميكياً دائماً لأنه يقرأ جلسة المستخدم (headers) ويصل لقاعدة البيانات.
export const dynamic = "force-dynamic";

/** يحلّل قيمة تاريخ من نص الاستعلام، ويعيد null عند غيابها أو عدم صلاحيتها. */
function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** GET /api/expenses — قائمة المصروفات وإجماليها ضمن نطاق زمني. */
export const GET = withApi("expenses:read", async ({ request }) => {
  const params = new URL(request.url).searchParams;
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"));

  if (!from || !to) {
    return fail("النطاق الزمني (from و to) مطلوب وبصيغة تاريخ صالحة", 400, [
      "from",
      "to",
    ]);
  }
  if (from.getTime() > to.getTime()) {
    return fail("تاريخ البداية يجب ألا يتجاوز تاريخ النهاية", 400, ["from", "to"]);
  }

  const result = await ExpenseService.listExpenses({ from, to });
  return ok(result);
});

/** جسم تسجيل مصروف. */
interface RecordExpenseBody {
  amount?: unknown;
  date?: unknown;
  category?: unknown;
  supplierId?: unknown;
}

/** POST /api/expenses — تسجيل مصروف جديد. */
export const POST = withApi("expenses:write", async ({ request }) => {
  const body = await parseJsonBody<RecordExpenseBody>(request);
  if (!body || typeof body !== "object") {
    return fail(INVALID_BODY_MESSAGE, 400);
  }

  const amount = body.amount;
  if (typeof amount !== "number" && typeof amount !== "string") {
    return fail("قيمة المبلغ مطلوبة", 400, ["amount"]);
  }

  let date: Date | undefined;
  if (typeof body.date === "string") {
    const parsed = new Date(body.date);
    if (Number.isNaN(parsed.getTime())) {
      return fail("صيغة التاريخ غير صالحة", 400, ["date"]);
    }
    date = parsed;
  }

  const result = await ExpenseService.recordExpense({
    amount,
    date,
    category: typeof body.category === "string" ? body.category : "",
    supplierId:
      typeof body.supplierId === "string" ? body.supplierId : undefined,
  });

  if (isExpenseValidationError(result)) {
    return fail(result.message, 400, result.fields);
  }

  return ok({ expense: result }, 201);
});
