"use client";

/**
 * شاشة الفوترة وعروض الأسعار — المهمة 13.1 (المتطلبات 4.1, 4.5, 4.6, 5.1, 5.3, 12.4).
 *
 * تتيح:
 *  - بناء بنود مسعّرة بالقياس (عرض × ارتفاع × سعر المتر) أو بالقطعة (كمية × سعر وحدة)
 *    ضمن المستند نفسه (المتطلبات 4.1, 4.6).
 *  - حفظ المستند كعرض سعر (`POST /api/quotes`) أو إصداره فاتورة مباشرة
 *    (`POST /api/invoices`).
 *  - تحويل عرض سعر إلى فاتورة (`POST /api/quotes/{id}/convert`) — المتطلب 4.5.
 *  - تسجيل دفعة على فاتورة (`POST /api/invoices/{id}/payments`) وعرض حالتها المحدّثة
 *    (المتطلبات 5.3–5.6).
 *
 * تعرض جميع القيم المالية مقترنةً بوحدة العملة (المتطلب 12.4) عبر TanStack Query.
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { money, labelOf, INVOICE_STATUS_LABELS, QUOTE_STATUS_LABELS } from "@/lib/ui/format";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorRow } from "@/components/ui/spinner";

interface Customer {
  id: string;
  name: string;
}

interface Invoice {
  id: string;
  number: string;
  netTotal: string | number;
  paidAmount: string | number;
  remainingAmount: string | number;
  status: string;
}

interface Quote {
  id: string;
  status: string;
}

type LineKind = "BY_MEASURE" | "BY_PIECE";

interface LineItemForm {
  key: string;
  kind: LineKind;
  description: string;
  widthM: string;
  heightM: string;
  pricePerSqm: string;
  quantity: string;
  unitPrice: string;
}

let keyCounter = 0;
function newItem(): LineItemForm {
  keyCounter += 1;
  return {
    key: `item-${keyCounter}`,
    kind: "BY_MEASURE",
    description: "",
    widthM: "",
    heightM: "",
    pricePerSqm: "",
    quantity: "",
    unitPrice: "",
  };
}

/** يبني حمولة البند المرسلة إلى الـ API بحسب نوع التسعير. */
function toPayloadItem(item: LineItemForm) {
  if (item.kind === "BY_MEASURE") {
    return {
      kind: "BY_MEASURE",
      description: item.description,
      widthM: Number(item.widthM),
      heightM: Number(item.heightM),
      pricePerSqm: Number(item.pricePerSqm),
    };
  }
  return {
    kind: "BY_PIECE",
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
  };
}

export default function BillingPage() {
  const [customerId, setCustomerId] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [taxPct, setTaxPct] = useState("0");
  const [items, setItems] = useState<LineItemForm[]>([newItem()]);
  const [docError, setDocError] = useState<string | null>(null);

  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);
  const [lastQuote, setLastQuote] = useState<Quote | null>(null);

  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ["customers", ""],
    queryFn: () => apiGet<{ customers: Customer[] }>("/api/customers?q="),
  });

  const docPayload = () => ({
    customerId,
    discountPct: Number(discountPct) || 0,
    taxPct: Number(taxPct) || 0,
    items: items.map(toPayloadItem),
  });

  const createQuote = useMutation({
    mutationFn: () => apiPost<{ quote: Quote }>("/api/quotes", docPayload()),
    onSuccess: (data) => {
      setDocError(null);
      setLastQuote(data.quote);
    },
    onError: (e: unknown) =>
      setDocError(e instanceof ApiError ? e.message : "تعذّر حفظ عرض السعر"),
  });

  const createInvoice = useMutation({
    mutationFn: () => apiPost<{ invoice: Invoice }>("/api/invoices", docPayload()),
    onSuccess: (data) => {
      setDocError(null);
      setLastInvoice(data.invoice);
    },
    onError: (e: unknown) =>
      setDocError(e instanceof ApiError ? e.message : "تعذّر إصدار الفاتورة"),
  });

  const convertQuote = useMutation({
    mutationFn: (quoteId: string) =>
      apiPost<{ invoice: Invoice }>(`/api/quotes/${quoteId}/convert`, {}),
    onSuccess: (data) => {
      setDocError(null);
      setLastQuote(null);
      setLastInvoice(data.invoice);
    },
    onError: (e: unknown) =>
      setDocError(e instanceof ApiError ? e.message : "تعذّر تحويل عرض السعر"),
  });

  const recordPayment = useMutation({
    mutationFn: (invoiceId: string) =>
      apiPost<{ invoice: Invoice }>(`/api/invoices/${invoiceId}/payments`, {
        amount: Number(paymentAmount),
      }),
    onSuccess: (data) => {
      setPaymentError(null);
      setPaymentAmount("");
      setLastInvoice(data.invoice);
    },
    onError: (e: unknown) =>
      setPaymentError(e instanceof ApiError ? e.message : "تعذّر تسجيل الدفعة"),
  });

  const customers = customersQuery.data?.customers ?? [];
  const busy = createQuote.isPending || createInvoice.isPending;

  function updateItem(key: string, patch: Partial<LineItemForm>) {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="الفوترة وعروض الأسعار"
        description="إنشاء عروض الأسعار والفواتير بالتسعير بالقياس وبالقطعة، وتسجيل المدفوعات."
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">مستند جديد</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-1">
              <Label htmlFor="customer">العميل</Label>
              <Select
                id="customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— اختر العميل —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="discount">نسبة الخصم %</Label>
              <Input
                id="discount"
                type="number"
                min="0"
                max="100"
                step="any"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tax">نسبة الضريبة %</Label>
              <Input
                id="tax"
                type="number"
                min="0"
                max="100"
                step="any"
                value={taxPct}
                onChange={(e) => setTaxPct(e.target.value)}
              />
            </div>
          </div>

          {/* بنود المستند */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">البنود</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setItems((prev) => [...prev, newItem()])}
              >
                <Plus className="h-4 w-4" />
                إضافة بند
              </Button>
            </div>

            {items.map((item) => (
              <div
                key={item.key}
                className="rounded-md border p-4"
              >
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="flex-1 space-y-2">
                    <Label>الوصف</Label>
                    <Input
                      value={item.description}
                      onChange={(e) =>
                        updateItem(item.key, { description: e.target.value })
                      }
                      placeholder="وصف البند"
                    />
                  </div>
                  <div className="w-full space-y-2 sm:w-44">
                    <Label>نوع التسعير</Label>
                    <Select
                      value={item.kind}
                      onChange={(e) =>
                        updateItem(item.key, { kind: e.target.value as LineKind })
                      }
                    >
                      <option value="BY_MEASURE">بالقياس (متر مربع)</option>
                      <option value="BY_PIECE">بالقطعة</option>
                    </Select>
                  </div>
                  {items.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="حذف البند"
                      onClick={() =>
                        setItems((prev) => prev.filter((it) => it.key !== item.key))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  ) : null}
                </div>

                {item.kind === "BY_MEASURE" ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label>العرض (م)</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={item.widthM}
                        onChange={(e) => updateItem(item.key, { widthM: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>الارتفاع (م)</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={item.heightM}
                        onChange={(e) => updateItem(item.key, { heightM: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>سعر المتر المربع</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={item.pricePerSqm}
                        onChange={(e) =>
                          updateItem(item.key, { pricePerSqm: e.target.value })
                        }
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>الكمية</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>سعر الوحدة</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={item.unitPrice}
                        onChange={(e) => updateItem(item.key, { unitPrice: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {docError ? <ErrorRow message={docError} /> : null}

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !customerId}
              onClick={() => createQuote.mutate()}
            >
              حفظ كعرض سعر
            </Button>
            <Button
              type="button"
              disabled={busy || !customerId}
              onClick={() => createInvoice.mutate()}
            >
              إصدار فاتورة
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* عرض السعر الأخير */}
      {lastQuote ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">عرض السعر المُنشأ</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 text-sm">
              <p>المعرّف: {lastQuote.id}</p>
              <p>
                الحالة:{" "}
                <Badge variant="secondary">
                  {labelOf(QUOTE_STATUS_LABELS, lastQuote.status)}
                </Badge>
              </p>
            </div>
            <Button
              type="button"
              disabled={convertQuote.isPending}
              onClick={() => convertQuote.mutate(lastQuote.id)}
            >
              {convertQuote.isPending ? "جارٍ التحويل…" : "تحويل إلى فاتورة"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* الفاتورة الأخيرة + تسجيل دفعة */}
      {lastInvoice ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              الفاتورة رقم {lastInvoice.number}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <Stat label="الإجمالي الصافي" value={money(lastInvoice.netTotal)} />
              <Stat label="المدفوع" value={money(lastInvoice.paidAmount)} />
              <Stat label="المتبقّي" value={money(lastInvoice.remainingAmount)} />
              <div>
                <p className="text-xs text-muted-foreground">الحالة</p>
                <Badge
                  variant={
                    lastInvoice.status === "PAID"
                      ? "success"
                      : lastInvoice.status === "PARTIALLY_PAID"
                        ? "warning"
                        : "secondary"
                  }
                >
                  {labelOf(INVOICE_STATUS_LABELS, lastInvoice.status)}
                </Badge>
              </div>
            </div>

            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                recordPayment.mutate(lastInvoice.id);
              }}
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="payment">قيمة الدفعة</Label>
                <Input
                  id="payment"
                  type="number"
                  step="any"
                  min="0"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={recordPayment.isPending}>
                {recordPayment.isPending ? "جارٍ التسجيل…" : "تسجيل دفعة"}
              </Button>
            </form>
            {paymentError ? <ErrorRow message={paymentError} /> : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}
