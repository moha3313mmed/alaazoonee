"use client";

/**
 * شاشة المخزون — المهمتان 13.1 و 13.2 (المتطلبات 7.1, 7.4, 7.6, 12.4).
 *
 * تجلب الأصناف وتنبيهات نقص المخزون من `GET /api/inventory` عبر TanStack Query،
 * وتتيح إنشاء صنف جديد عبر `POST /api/inventory`. تُبرز تنبيهات نقص المخزون بشكل ظاهر
 * (لوحة تحذير + وسم لكل صنف بلغ حد إعادة الطلب) تنفيذاً للمتطلب 7.4.
 */
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { toNumber, labelOf, UNIT_LABELS } from "@/lib/ui/format";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  quantity: string | number;
  reorderLevel: string | number;
}

interface InventoryResponse {
  items: InventoryItem[];
  lowStock: InventoryItem[];
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("SQUARE_METER");
  const [quantity, setQuantity] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const inventoryQuery = useQuery({
    queryKey: ["inventory"],
    queryFn: () => apiGet<InventoryResponse>("/api/inventory"),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<{ item: InventoryItem }>("/api/inventory", {
        name,
        unit,
        quantity: Number(quantity),
        reorderLevel: Number(reorderLevel),
      }),
    onSuccess: () => {
      setName("");
      setQuantity("");
      setReorderLevel("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.message : "تعذّر حفظ الصنف");
    },
  });

  const items = inventoryQuery.data?.items ?? [];
  const lowStock = inventoryQuery.data?.lowStock ?? [];

  // مجموعة معرّفات الأصناف منخفضة المخزون لتمييزها في الجدول.
  const lowStockIds = useMemo(
    () => new Set(lowStock.map((item) => item.id)),
    [lowStock]
  );

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="المخزون"
        description="إدارة أصناف الزجاج والإكسسوارات وكمياتها وتنبيهات نقص المخزون."
      />

      {/* لوحة تنبيهات نقص المخزون (المتطلب 7.4) */}
      {lowStock.length > 0 ? (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-5 w-5" />
            <span>تنبيه: {lowStock.length} صنف بلغ حد إعادة الطلب أو دونه</span>
          </div>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {lowStock.map((item) => (
              <li key={item.id}>
                {item.name} — الكمية الحالية: {toNumber(item.quantity)}{" "}
                {labelOf(UNIT_LABELS, item.unit)} (حد إعادة الطلب:{" "}
                {toNumber(item.reorderLevel)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">إضافة صنف جديد</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="name">اسم الصنف</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">وحدة القياس</Label>
                <Select
                  id="unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                >
                  <option value="SQUARE_METER">متر مربع</option>
                  <option value="PIECE">قطعة</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="quantity">الكمية</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="any"
                  min="0"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reorderLevel">حد إعادة الطلب</Label>
                <Input
                  id="reorderLevel"
                  type="number"
                  step="any"
                  min="0"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(e.target.value)}
                  required
                />
              </div>
              {formError ? <ErrorRow message={formError} /> : null}
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "جارٍ الحفظ…" : "حفظ الصنف"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">قائمة الأصناف</CardTitle>
          </CardHeader>
          <CardContent>
            {inventoryQuery.isLoading ? (
              <LoadingRow />
            ) : inventoryQuery.isError ? (
              <ErrorRow
                message={
                  inventoryQuery.error instanceof ApiError
                    ? inventoryQuery.error.message
                    : "تعذّر تحميل المخزون"
                }
              />
            ) : items.length === 0 ? (
              <EmptyRow label="لا توجد أصناف بعد." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الصنف</TableHead>
                    <TableHead>الوحدة</TableHead>
                    <TableHead>الكمية</TableHead>
                    <TableHead>حد إعادة الطلب</TableHead>
                    <TableHead>الحالة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const isLow = lowStockIds.has(item.id);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{labelOf(UNIT_LABELS, item.unit)}</TableCell>
                        <TableCell>{toNumber(item.quantity)}</TableCell>
                        <TableCell>{toNumber(item.reorderLevel)}</TableCell>
                        <TableCell>
                          {isLow ? (
                            <Badge variant="warning">نقص مخزون</Badge>
                          ) : (
                            <Badge variant="success">متوفّر</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
