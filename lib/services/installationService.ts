/**
 * خدمة التركيب (InstallationService) — المهمة 9.1.
 *
 * تمثّل المصدر الموحّد لمنطق إدارة مهام التركيب وتعيين الفنيين وتتبّع حالاتها،
 * وفق طبقة الخدمات الموحّدة (مصدر واحد للحقيقة) التي تستخدمها واجهة المستخدم والمساعد الذكي معاً.
 *
 * المسؤوليات والمتطلبات:
 *  - 8.1: إنشاء مهمة تركيب مرتبطة بفاتورة أو عميل بحالة ابتدائية "مجدولة" (SCHEDULED).
 *  - 8.2: تعيين فني واحد أو أكثر للمهمة وتسجيل تاريخ التنفيذ المجدول (scheduledAt).
 *  - 8.3: تحديث حالة المهمة ضمن القيم المسموحة: مجدولة / قيد التنفيذ / مكتملة / ملغاة.
 *  - 8.4: عرض قائمة مهام فني محدّد وحالاتها.
 *  - 8.5: كشف تعارض مواعيد الفني وإصدار تنبيه "يوجد تعارض في موعد الفني" دون منع إجباري.
 *
 * ملاحظة بشأن التعارض (المتطلب 8.5):
 *   كشف التعارض غير مانع (non-blocking). يكتمل تعيين الفنيين دائماً، وتُعاد التنبيهات
 *   ضمن الحقل `warnings` لإعلام المستخدم باحتمال التعارض دون الحيلولة دون الحفظ.
 *   لذا تُعيد `assignTechnicians` المهمة المحدَّثة مصحوبةً بقائمة التنبيهات (إن وُجدت)
 *   بدلاً من الاختيار بين المهمة أو التنبيه، تحقيقاً لمبدأ "التنبيه دون المنع".
 */
import { JobStatus, Prisma } from "@prisma/client";
import type { InstallationJob, JobTechnician, Technician } from "@prisma/client";

import { prisma } from "@/lib/db/client";

/** القيم العربية المعتمدة لرسائل الأخطاء والتنبيهات (وثيقة التصميم: قسم معالجة الأخطاء). */
export const INSTALLATION_MESSAGES = {
  LINK_REQUIRED: "يجب ربط مهمة التركيب بعميل أو فاتورة",
  JOB_NOT_FOUND: "مهمة التركيب غير موجودة",
  INVALID_STATUS: "حالة المهمة غير صالحة",
  TECHNICIANS_REQUIRED: "يجب تحديد فني واحد على الأقل",
  TECHNICIAN_NOT_FOUND: "الفني غير موجود",
  SCHEDULE_REQUIRED: "تاريخ التنفيذ المجدول مطلوب",
  SCHEDULE_CONFLICT: "يوجد تعارض في موعد الفني",
} as const;

/**
 * خطأ خدمة موحّد بنمط مُمَيَّز (discriminated union) يُعاد بدلاً من رمي الاستثناءات،
 * ليتيح للمستدعي عرض رسالة عربية واضحة.
 */
export type InstallationError =
  | { error: "VALIDATION"; message: string; fields?: string[] }
  | { error: "NOT_FOUND"; message: string };

/** حارس نوع للتفريق بين النتيجة الناجحة وخطأ الخدمة. */
export function isInstallationError(value: unknown): value is InstallationError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

/** مهمة تركيب مع قائمة الفنيين المعيّنين عليها (وبياناتهم). */
export type JobWithTechnicians = InstallationJob & {
  technicians: (JobTechnician & { technician: Technician })[];
};

/**
 * تنبيه تعارض في موعد الفني (المتطلب 8.5). غير مانع — للإعلام فقط.
 */
export interface ConflictWarning {
  technicianId: string;
  /** اسم الفني عند توفّره (لرسالة أوضح). */
  technicianName?: string;
  /** معرّف المهمة الأخرى المتعارضة في الموعد. */
  conflictingJobId: string;
  /** الموعد المتعارض. */
  scheduledAt: Date;
  /** الرسالة العربية المعتمدة للتنبيه. */
  message: string;
}

/** نتيجة تعيين الفنيين: المهمة المحدَّثة مع أي تنبيهات تعارض (غير مانعة). */
export interface AssignmentResult {
  job: JobWithTechnicians;
  /** قائمة تنبيهات التعارض؛ فارغة عند عدم وجود تعارض. */
  warnings: ConflictWarning[];
}

/** include موحّد لإرجاع المهمة مع الفنيين المرتبطين بها. */
const JOB_INCLUDE = {
  technicians: { include: { technician: true } },
} satisfies Prisma.InstallationJobInclude;

/**
 * أنشئ مهمة تركيب مرتبطة بعميل أو فاتورة، بحالة ابتدائية "مجدولة" (SCHEDULED).
 * المتطلب 8.1.
 *
 * يجب ربط المهمة بعميل أو فاتورة على الأقل؛ وإلا تُعاد VALIDATION.
 *
 * @param input معرّف العميل و/أو معرّف الفاتورة المرتبطة.
 * @returns المهمة المنشأة (بحالة SCHEDULED) أو خطأ تحقّق.
 */
export async function createJob(input: {
  customerId?: string;
  invoiceId?: string;
}): Promise<InstallationJob | InstallationError> {
  const customerId = input?.customerId?.trim() || undefined;
  const invoiceId = input?.invoiceId?.trim() || undefined;

  // المتطلب 8.1: المهمة مرتبطة بفاتورة أو عميل.
  if (!customerId && !invoiceId) {
    return {
      error: "VALIDATION",
      message: INSTALLATION_MESSAGES.LINK_REQUIRED,
      fields: ["customerId", "invoiceId"],
    };
  }

  // الحالة الابتدائية SCHEDULED مضبوطة افتراضياً في المخطط، ونمرّرها صراحةً للتوثيق.
  return prisma.installationJob.create({
    data: { customerId, invoiceId, status: JobStatus.SCHEDULED },
  });
}

/**
 * هل لدى الفني مهمة أخرى مجدولة في الموعد نفسه؟ (المتطلب 8.5)
 *
 * يُعَدّ تعارضاً وجود مهمة أخرى (غير ملغاة) مسندة إلى الفني نفسه في الوقت ذاته.
 * يُستبعَد من الفحص المهمةُ الحالية (excludeJobId) عند إعادة التعيين.
 *
 * @returns true عند وجود تعارض في الموعد.
 */
export async function detectConflict(
  technicianId: string,
  scheduledAt: Date,
  excludeJobId?: string
): Promise<boolean> {
  const conflict = await prisma.jobTechnician.findFirst({
    where: {
      technicianId,
      job: {
        scheduledAt,
        status: { not: JobStatus.CANCELLED },
        ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
      },
    },
  });

  return conflict !== null;
}

/**
 * عيّن فنياً أو أكثر لمهمة تركيب وسجّل تاريخ التنفيذ المجدول. (المتطلبات 8.2, 8.5)
 *
 * كشف التعارض غير مانع: يكتمل التعيين دائماً، وتُعاد تنبيهات التعارض ضمن `warnings`.
 *
 * @param jobId معرّف المهمة.
 * @param technicianIds قائمة معرّفات الفنيين (واحد على الأقل).
 * @param scheduledAt تاريخ ووقت التنفيذ المجدول.
 * @returns نتيجة التعيين (المهمة + التنبيهات) أو خطأ تحقّق/عدم وجود.
 */
export async function assignTechnicians(
  jobId: string,
  technicianIds: string[],
  scheduledAt: Date
): Promise<AssignmentResult | InstallationError> {
  const ids = Array.from(
    new Set((technicianIds ?? []).map((id) => id?.trim()).filter((id): id is string => !!id))
  );

  if (ids.length === 0) {
    return {
      error: "VALIDATION",
      message: INSTALLATION_MESSAGES.TECHNICIANS_REQUIRED,
      fields: ["technicianIds"],
    };
  }

  if (!(scheduledAt instanceof Date) || Number.isNaN(scheduledAt.getTime())) {
    return {
      error: "VALIDATION",
      message: INSTALLATION_MESSAGES.SCHEDULE_REQUIRED,
      fields: ["scheduledAt"],
    };
  }

  return prisma.$transaction(async (tx) => {
    const job = await tx.installationJob.findUnique({ where: { id: jobId } });
    if (!job) {
      return { error: "NOT_FOUND", message: INSTALLATION_MESSAGES.JOB_NOT_FOUND } satisfies InstallationError;
    }

    // التحقق من وجود جميع الفنيين المطلوب تعيينهم.
    const technicians = await tx.technician.findMany({ where: { id: { in: ids } } });
    if (technicians.length !== ids.length) {
      return {
        error: "NOT_FOUND",
        message: INSTALLATION_MESSAGES.TECHNICIAN_NOT_FOUND,
      } satisfies InstallationError;
    }

    const nameById = new Map(technicians.map((t) => [t.id, t.name]));

    // كشف التعارض لكل فني قبل التعيين (المتطلب 8.5) — غير مانع.
    const warnings: ConflictWarning[] = [];
    for (const technicianId of ids) {
      const existing = await tx.jobTechnician.findFirst({
        where: {
          technicianId,
          job: {
            scheduledAt,
            status: { not: JobStatus.CANCELLED },
            id: { not: jobId },
          },
        },
      });

      if (existing) {
        warnings.push({
          technicianId,
          technicianName: nameById.get(technicianId),
          conflictingJobId: existing.jobId,
          scheduledAt,
          message: INSTALLATION_MESSAGES.SCHEDULE_CONFLICT,
        });
      }
    }

    // تسجيل تاريخ التنفيذ المجدول على المهمة (المتطلب 8.2).
    await tx.installationJob.update({
      where: { id: jobId },
      data: { scheduledAt },
    });

    // ربط الفنيين بالمهمة دون تكرار (المفتاح المركّب jobId+technicianId يمنع التكرار).
    await tx.jobTechnician.createMany({
      data: ids.map((technicianId) => ({ jobId, technicianId })),
      skipDuplicates: true,
    });

    const updated = await tx.installationJob.findUniqueOrThrow({
      where: { id: jobId },
      include: JOB_INCLUDE,
    });

    return { job: updated, warnings } satisfies AssignmentResult;
  });
}

/**
 * حدّث حالة مهمة التركيب ضمن القيم المسموحة فقط. (المتطلب 8.3)
 *
 * القيم المسموحة: SCHEDULED / IN_PROGRESS / COMPLETED / CANCELLED.
 *
 * @param jobId معرّف المهمة.
 * @param status الحالة الجديدة.
 * @returns المهمة المحدَّثة أو خطأ تحقّق/عدم وجود.
 */
export async function updateStatus(
  jobId: string,
  status: JobStatus
): Promise<InstallationJob | InstallationError> {
  // المتطلب 8.3: قبول الحالات ضمن مجموعة القيم المعرّفة فقط.
  const allowed = Object.values(JobStatus) as JobStatus[];
  if (!allowed.includes(status)) {
    return {
      error: "VALIDATION",
      message: INSTALLATION_MESSAGES.INVALID_STATUS,
      fields: ["status"],
    };
  }

  const job = await prisma.installationJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return { error: "NOT_FOUND", message: INSTALLATION_MESSAGES.JOB_NOT_FOUND };
  }

  return prisma.installationJob.update({
    where: { id: jobId },
    data: { status },
  });
}

/**
 * أعد قائمة مهام فني محدّد وحالاتها، مرتّبة بالموعد المجدول ثم تاريخ الإنشاء. (المتطلب 8.4)
 *
 * @param technicianId معرّف الفني.
 * @returns قائمة المهام المسندة للفني (مع بقية الفنيين المشاركين في كل مهمة).
 */
export async function getJobsByTechnician(
  technicianId: string
): Promise<JobWithTechnicians[]> {
  return prisma.installationJob.findMany({
    where: { technicians: { some: { technicianId } } },
    include: JOB_INCLUDE,
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });
}

/** واجهة الخدمة مجمّعة لتيسير الاستيراد والاستخدام في طبقة الـ API والمساعد الذكي. */
export const InstallationService = {
  createJob,
  assignTechnicians,
  updateStatus,
  getJobsByTechnician,
  detectConflict,
  isInstallationError,
} as const;

export default InstallationService;
