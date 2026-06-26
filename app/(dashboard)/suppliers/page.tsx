"use client";

/**
 * شاشة الموردين — المهمة 13.1 (المتطلبات 3.1, 3.2, 12.4).
 *
 * تستخدم TanStack Query لجلب الموردين من `GET /api/suppliers` (بحث بالاسم/الهاتف)
 * وإنشاء مورد جديد عبر `POST /api/suppliers`، وتعرض أرصدتهم مقترنةً بوحدة العملة.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { money, formatDate } from "@/lib/ui/format";
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

interface Supplier {
  id: string;
  name: string;
  phone: string;
  balance: string | number;
  createdAt: string;
}

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", search],
    queryFn: () =>
      apiGet<{ suppliers: Supplier[] }>(
        `/api/suppliers?q=${encodeURIComponent(search)}`
      ),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<{ supplier: Supplier }>("/api/suppliers", { name, phone }),
    onSuccess: () => {
      setName("");
      setPhone("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.message : "تعذّر حفظ المورد");
    },
  });

  const suppliers = suppliersQuery.data?.suppliers ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="الموردون"
        description="إدارة بيانات الموردين ومستحقاتهم."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">إضافة مورد جديد</CardTitle>
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
                <Label htmlFor="name">الاسم</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">رقم الهاتف</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  required
                />
              </div>
              {formError ? <ErrorRow message={formError} /> : null}
              <Button
                type="submit"
                className="w-full"
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "جارٍ الحفظ…" : "حفظ المورد"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="gap-3">
            <CardTitle className="text-base">قائمة الموردين</CardTitle>
            <Input
              placeholder="بحث بالاسم أو رقم الهاتف…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </CardHeader>
          <CardContent>
            {suppliersQuery.isLoading ? (
              <LoadingRow />
            ) : suppliersQuery.isError ? (
              <ErrorRow
                message={
                  suppliersQuery.error instanceof ApiError
                    ? suppliersQuery.error.message
                    : "تعذّر تحميل الموردين"
                }
              />
            ) : suppliers.length === 0 ? (
              <EmptyRow label="لا يوجد موردون مطابقون." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الاسم</TableHead>
                    <TableHead>رقم الهاتف</TableHead>
                    <TableHead>الرصيد</TableHead>
                    <TableHead>تاريخ الإضافة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {supplier.phone}
                      </TableCell>
                      <TableCell>{money(supplier.balance)}</TableCell>
                      <TableCell>{formatDate(supplier.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
