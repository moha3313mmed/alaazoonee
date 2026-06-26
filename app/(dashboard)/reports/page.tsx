"use client";

/**
 * شاشة التقارير — المهمة 13.1 (المتطلبات 9.1–9.5, 12.4).
 *
 * تجلب عبر TanStack Query تقارير المبيعات والأرباح ضمن نطاق زمني، وتقريرَي الذمم والمخزون،
 * وتتيح تصدير أيٍّ منها بصيغة PDF أو CSV عبر `POST /api/reports/export` (المتطلب 9.5).
 * تُعرض كل القيم المالية مقترنةً بوحدة العملة (المتطلب 12.4).
 */
import { useState } from "react";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { apiGet, ApiError } from "@/lib/api/client";
import { money, toNumber, labelOf, UNIT_LABELS } from "@/lib/ui/format";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyRow, ErrorRow, LoadingRow } from "@/components/ui/spinner";

interface SalesReport {
  totalSales: string | number;
  invoiceCount: number;
}
interface ProfitReport {
  totalSales: string | number;
  totalExpenses: string | number;
  costOfGoodsSold: string | number;
  profit: string | number;
}
interface BalanceEntry {
  id: string;
  name: string;
  phone: string;
  balance: string | number;
}
interface ReceivablesReport {
  customers: BalanceEntry[];
  suppliers: BalanceEntry[];
}
interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: string | number;
  reorderLevel: string | number;
}
interface InventoryReport {
  items: InventoryItem[];
  lowStock: InventoryItem[];
}

/** يبدّل تاريخ اليوم وقبل 30 يوماً كنطاق افتراضي. */
function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function ReportsPage() {
  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [range, setRange] = useState(initial);
  const [exportError, setExportError] = useState<string | null>(null);

  const qs = `from=${range.from}&to=${range.to}`;

  const salesQuery = useQuery({
    queryKey: ["report-sales", range],
    queryFn: () => apiGet<SalesReport>(`/api/reports/sales?${qs}`),
  });
  const profitQuery = useQuery({
    queryKey: ["report-profit", range],
    queryFn: () => apiGet<ProfitReport>(`/api/reports/profit?${qs}`),
  });
  const receivablesQuery = useQuery({
    queryKey: ["report-receivables"],
    queryFn: () => apiGet<ReceivablesReport>("/api/reports/receivables"),
  });
  const inventoryQuery = useQuery({
    queryKey: ["report-inventory"],
    queryFn: () => apiGet<InventoryReport>("/api/reports/inventory"),
  });

  /** يصدّر تقريراً عبر تنزيل ملف ثنائي (PDF/CSV). */
  async function exportReport(
    type: "sales" | "profit" | "receivables" | "inventory",
    format: "pdf" | "csv"
  ) {
    setExportError(null);
    try {
      const body: Record<string, unknown> = { type, format };
      if (type === "sales" || type === "profit") {
        body.from = range.from;
        body.to = range.to;
      }
      const response = await fetch("/api/reports/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "تعذّر تصدير التقرير");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${type}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : "تعذّر تصدير التقرير");
    }
  }

  const receivables = receivablesQuery.data;
  const inventory = inventoryQuery.data;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="التقارير"
        description="تقارير المبيعات والأرباح والذمم والمخزون مع إمكانية التصدير."
      />

      {/* النطاق الزمني */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">النطاق الزمني</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setRange({ from, to });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="from">من</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">إلى</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button type="submit">تحديث</Button>
          </form>
        </CardContent>
      </Card>

      {exportError ? <ErrorRow message={exportError} /> : null}

      {/* المبيعات والأرباح */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">تقرير المبيعات</CardTitle>
            <ExportButtons onExport={(f) => exportReport("sales", f)} />
          </CardHeader>
          <CardContent>
            {salesQuery.isLoading ? (
              <LoadingRow />
            ) : salesQuery.isError ? (
              <ErrorRow
                message={
                  salesQuery.error instanceof ApiError
                    ? salesQuery.error.message
                    : "تعذّر تحميل تقرير المبيعات"
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Stat label="إجمالي المبيعات" value={money(salesQuery.data?.totalSales)} />
                <Stat
                  label="عدد الفواتير"
                  value={String(salesQuery.data?.invoiceCount ?? 0)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-base">تقرير الأرباح</CardTitle>
            <ExportButtons onExport={(f) => exportReport("profit", f)} />
          </CardHeader>
          <CardContent>
            {profitQuery.isLoading ? (
              <LoadingRow />
            ) : profitQuery.isError ? (
              <ErrorRow
                message={
                  profitQuery.error instanceof ApiError
                    ? profitQuery.error.message
                    : "تعذّر تحميل تقرير الأرباح"
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <Stat label="المبيعات" value={money(profitQuery.data?.totalSales)} />
                <Stat label="المصروفات" value={money(profitQuery.data?.totalExpenses)} />
                <Stat
                  label="تكلفة البضاعة المباعة"
                  value={money(profitQuery.data?.costOfGoodsSold)}
                />
                <Stat label="الربح" value={money(profitQuery.data?.profit)} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* الذمم */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">تقرير الذمم</CardTitle>
          <ExportButtons onExport={(f) => exportReport("receivables", f)} />
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-semibold">ذمم العملاء</h3>
            {receivablesQuery.isLoading ? (
              <LoadingRow />
            ) : !receivables || receivables.customers.length === 0 ? (
              <EmptyRow label="لا توجد ذمم عملاء." />
            ) : (
              <BalanceTable entries={receivables.customers} />
            )}
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold">مستحقات الموردين</h3>
            {receivablesQuery.isLoading ? (
              <LoadingRow />
            ) : !receivables || receivables.suppliers.length === 0 ? (
              <EmptyRow label="لا توجد مستحقات موردين." />
            ) : (
              <BalanceTable entries={receivables.suppliers} />
            )}
          </div>
        </CardContent>
      </Card>

      {/* المخزون */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">تقرير المخزون</CardTitle>
          <ExportButtons onExport={(f) => exportReport("inventory", f)} />
        </CardHeader>
        <CardContent>
          {inventoryQuery.isLoading ? (
            <LoadingRow />
          ) : !inventory || inventory.items.length === 0 ? (
            <EmptyRow label="لا توجد أصناف." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الصنف</TableHead>
                  <TableHead>الوحدة</TableHead>
                  <TableHead>الكمية</TableHead>
                  <TableHead>حد إعادة الطلب</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventory.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>{labelOf(UNIT_LABELS, item.unit)}</TableCell>
                    <TableCell>{toNumber(item.quantity)}</TableCell>
                    <TableCell>{toNumber(item.reorderLevel)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function ExportButtons({ onExport }: { onExport: (format: "pdf" | "csv") => void }) {
  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={() => onExport("pdf")}>
        <Download className="h-4 w-4" />
        PDF
      </Button>
      <Button variant="outline" size="sm" onClick={() => onExport("csv")}>
        <Download className="h-4 w-4" />
        CSV
      </Button>
    </div>
  );
}

function BalanceTable({ entries }: { entries: BalanceEntry[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>الاسم</TableHead>
          <TableHead>الهاتف</TableHead>
          <TableHead>الرصيد</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.name}</TableCell>
            <TableCell dir="ltr" className="text-right">
              {entry.phone}
            </TableCell>
            <TableCell>{money(entry.balance)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
