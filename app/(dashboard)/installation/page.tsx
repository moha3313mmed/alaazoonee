"use client";

/**
 * شاشة التركيب — المهمة 13.1 (المتطلبات 8.1, 8.2, 8.3, 8.4, 8.5).
 *
 * تتيح حسب صلاحيات الدور:
 *  - إنشاء مهمة تركيب مرتبطة بعميل/فاتورة (`POST /api/installation-jobs`) — للمصرّح
 *    بـ installation:write.
 *  - تعيين الفنيين وتسجيل موعد التنفيذ وعرض تنبيهات التعارض غير المانعة
 *    (`POST /api/installation-jobs/{id}/technicians`) — المتطلبان 8.2, 8.5.
 *  - تحديث حالة المهمة (`PATCH /api/installation-jobs/{id}/status`) — متاح للفني أيضاً.
 *  - عرض مهام فني محدّد (`GET /api/technicians/{id}/jobs`) — المتطلب 8.4.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api/client";
import { labelOf, JOB_STATUS_LABELS, formatDate } from "@/lib/ui/format";
import { permissionsForRole } from "@/lib/auth/permissions";
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

interface Customer {
  id: string;
  name: string;
}

interface Job {
  id: string;
  status: string;
  scheduledAt: string | null;
  customerId: string | null;
  invoiceId: string | null;
}

const STATUS_OPTIONS = ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

export default function InstallationPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const granted = new Set(role ? permissionsForRole(role) : []);
  const canWrite = granted.has("installation:write");
  const canReadAssigned = granted.has("installation:read_assigned");

  // إنشاء مهمة
  const [jobCustomerId, setJobCustomerId] = useState("");
  const [jobInvoiceId, setJobInvoiceId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdJob, setCreatedJob] = useState<Job | null>(null);

  // تعيين فنيين
  const [assignJobId, setAssignJobId] = useState("");
  const [technicianIds, setTechnicianIds] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assignWarnings, setAssignWarnings] = useState<string[]>([]);

  // تحديث الحالة
  const [statusJobId, setStatusJobId] = useState("");
  const [status, setStatus] = useState<string>("IN_PROGRESS");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // عرض مهام فني
  const [technicianId, setTechnicianId] = useState("");
  const [activeTechnicianId, setActiveTechnicianId] = useState("");

  const customersQuery = useQuery({
    queryKey: ["customers", ""],
    queryFn: () => apiGet<{ customers: Customer[] }>("/api/customers?q="),
    enabled: canWrite,
  });

  const jobsQuery = useQuery({
    queryKey: ["technician-jobs", activeTechnicianId],
    queryFn: () =>
      apiGet<{ jobs: Job[] }>(
        `/api/technicians/${encodeURIComponent(activeTechnicianId)}/jobs`
      ),
    enabled: canReadAssigned && activeTechnicianId.length > 0,
  });

  const createJob = useMutation({
    mutationFn: () =>
      apiPost<{ job: Job }>("/api/installation-jobs", {
        customerId: jobCustomerId || undefined,
        invoiceId: jobInvoiceId || undefined,
      }),
    onSuccess: (data) => {
      setCreateError(null);
      setCreatedJob(data.job);
      setAssignJobId(data.job.id);
      setStatusJobId(data.job.id);
    },
    onError: (e: unknown) =>
      setCreateError(e instanceof ApiError ? e.message : "تعذّر إنشاء المهمة"),
  });

  const assignTechnicians = useMutation({
    mutationFn: () =>
      apiPost<{ job: Job; warnings?: string[] }>(
        `/api/installation-jobs/${assignJobId}/technicians`,
        {
          technicianIds: technicianIds
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          scheduledAt: new Date(scheduledAt).toISOString(),
        }
      ),
    onSuccess: (data) => {
      setAssignError(null);
      setAssignWarnings(data.warnings ?? []);
    },
    onError: (e: unknown) =>
      setAssignError(e instanceof ApiError ? e.message : "تعذّر تعيين الفنيين"),
  });

  const updateStatus = useMutation({
    mutationFn: () =>
      apiPatch<{ job: Job }>(`/api/installation-jobs/${statusJobId}/status`, {
        status,
      }),
    onSuccess: (data) => {
      setStatusError(null);
      setStatusMessage(
        `تم تحديث الحالة إلى: ${labelOf(JOB_STATUS_LABELS, data.job.status)}`
      );
      queryClient.invalidateQueries({ queryKey: ["technician-jobs"] });
    },
    onError: (e: unknown) =>
      setStatusError(e instanceof ApiError ? e.message : "تعذّر تحديث الحالة"),
  });

  const customers = customersQuery.data?.customers ?? [];
  const jobs = jobsQuery.data?.jobs ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="التركيب"
        description="إدارة مهام التركيب وتعيين الفنيين وتتبّع حالات التنفيذ."
      />

      {canWrite ? (
        <>
          {/* إنشاء مهمة */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">إنشاء مهمة تركيب</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  createJob.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="job-customer">العميل (اختياري)</Label>
                  <Select
                    id="job-customer"
                    value={jobCustomerId}
                    onChange={(e) => setJobCustomerId(e.target.value)}
                  >
                    <option value="">— بدون —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="job-invoice">معرّف الفاتورة (اختياري)</Label>
                  <Input
                    id="job-invoice"
                    value={jobInvoiceId}
                    onChange={(e) => setJobInvoiceId(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createJob.isPending}
                  >
                    {createJob.isPending ? "جارٍ الإنشاء…" : "إنشاء المهمة"}
                  </Button>
                </div>
              </form>
              {createError ? (
                <div className="mt-4">
                  <ErrorRow message={createError} />
                </div>
              ) : null}
              {createdJob ? (
                <p className="mt-4 text-sm text-muted-foreground">
                  تم إنشاء المهمة (المعرّف: {createdJob.id}) بحالة{" "}
                  <Badge variant="secondary">
                    {labelOf(JOB_STATUS_LABELS, createdJob.status)}
                  </Badge>
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* تعيين فنيين */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">تعيين الفنيين وموعد التنفيذ</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  assignTechnicians.mutate();
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="assign-job">معرّف المهمة</Label>
                  <Input
                    id="assign-job"
                    value={assignJobId}
                    onChange={(e) => setAssignJobId(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tech-ids">معرّفات الفنيين (مفصولة بفاصلة)</Label>
                  <Input
                    id="tech-ids"
                    value={technicianIds}
                    onChange={(e) => setTechnicianIds(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="scheduled-at">موعد التنفيذ</Label>
                  <Input
                    id="scheduled-at"
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    required
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={assignTechnicians.isPending}
                  >
                    {assignTechnicians.isPending ? "جارٍ التعيين…" : "تعيين"}
                  </Button>
                </div>
              </form>
              {assignError ? (
                <div className="mt-4">
                  <ErrorRow message={assignError} />
                </div>
              ) : null}
              {assignWarnings.length > 0 ? (
                <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  {assignWarnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}

      {/* تحديث الحالة (متاح للفني أيضاً) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">تحديث حالة مهمة</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              updateStatus.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="status-job">معرّف المهمة</Label>
              <Input
                id="status-job"
                value={statusJobId}
                onChange={(e) => setStatusJobId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">الحالة الجديدة</Label>
              <Select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {labelOf(JOB_STATUS_LABELS, s)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                className="w-full"
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? "جارٍ التحديث…" : "تحديث"}
              </Button>
            </div>
          </form>
          {statusError ? (
            <div className="mt-4">
              <ErrorRow message={statusError} />
            </div>
          ) : null}
          {statusMessage ? (
            <p className="mt-4 text-sm text-emerald-700">{statusMessage}</p>
          ) : null}
        </CardContent>
      </Card>

      {/* عرض مهام فني */}
      {canReadAssigned ? (
        <Card>
          <CardHeader className="gap-3">
            <CardTitle className="text-base">مهام فني</CardTitle>
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                setActiveTechnicianId(technicianId.trim());
              }}
            >
              <div className="flex-1 space-y-2">
                <Label htmlFor="tech-id">معرّف الفني</Label>
                <Input
                  id="tech-id"
                  value={technicianId}
                  onChange={(e) => setTechnicianId(e.target.value)}
                />
              </div>
              <Button type="submit">عرض المهام</Button>
            </form>
          </CardHeader>
          <CardContent>
            {!activeTechnicianId ? (
              <EmptyRow label="أدخل معرّف فني لعرض مهامه." />
            ) : jobsQuery.isLoading ? (
              <LoadingRow />
            ) : jobsQuery.isError ? (
              <ErrorRow
                message={
                  jobsQuery.error instanceof ApiError
                    ? jobsQuery.error.message
                    : "تعذّر تحميل المهام"
                }
              />
            ) : jobs.length === 0 ? (
              <EmptyRow label="لا توجد مهام لهذا الفني." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>معرّف المهمة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>موعد التنفيذ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">{job.id}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {labelOf(JOB_STATUS_LABELS, job.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(job.scheduledAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
