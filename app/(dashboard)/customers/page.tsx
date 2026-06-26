"use client";

/**
 * شاشة العملاء — المهمة 13.1 (المتطلبات 2.1, 2.2, 2.5, 12.4).
 *
 * تستخدم TanStack Query لجلب العملاء من `GET /api/customers` (مع بحث بالاسم/الهاتف)،
 * وإنشاء عميل جديد عبر `POST /api/customers`. تعرض الأرصدة مقترنةً بوحدة العملة (المتطلب
 * 12.4)، وتُبطِل قائمة العملاء بعد الإنشاء الناجح لتحديثها فوراً.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { money, formatDate } from "@/lib/ui/format";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyRow, ErrorRow, LoadingRow } from "@/components/ui/spinner";

interface Customer {
  id: string;
  name: string;
  phone: string;
  balance: string | number;
  createdAt: string;
}

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ["customers", search],
    queryFn: () =>
      apiGet<{ customers: Customer[] }>(
        `/api/customers?q=${encodeURIComponent(search)}`
      ),
  });

  const createMutation = useMutation({
    mutationFn: () => apiPost<{ customer: Customer }>("/api/customers", { name, phone }),
    onSuccess: () => {
      setName("");
      setPhone("");
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (error: unknown) => {
      setFormError(error instanceof ApiError ? error.message : "تعذّر حفظ العميل");
    },
  });

  const customers = customersQuery.data?.customers ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="العملاء"
        description="إدارة بيانات العملاء وأرصدتهم المالية."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* نموذج إضافة عميل */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">إضافة عميل جديد</CardTitle>
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
                {createMutation.isPending ? "جارٍ الحفظ…" : "حفظ العميل"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* قائمة العملاء */}
        <Card className="lg:col-span-2">
          <CardHeader className="gap-3">
            <CardTitle className="text-base">قائمة العملاء</CardTitle>
            <Input
              placeholder="بحث بالاسم أو رقم الهاتف…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </CardHeader>
          <CardContent>
            {customersQuery.isLoading ? (
              <LoadingRow />
            ) : customersQuery.isError ? (
              <ErrorRow
                message={
                  customersQuery.error instanceof ApiError
                    ? customersQuery.error.message
                    : "تعذّر تحميل العملاء"
                }
              />
            ) : customers.length === 0 ? (
              <EmptyRow label="لا يوجد عملاء مطابقون." />
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
                  {customers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-medium">{customer.name}</TableCell>
                      <TableCell dir="ltr" className="text-right">
                        {customer.phone}
                      </TableCell>
                      <TableCell>{money(customer.balance)}</TableCell>
                      <TableCell>{formatDate(customer.createdAt)}</TableCell>
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
