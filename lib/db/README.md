# طبقة الوصول للبيانات (Data Access Layer)

تحتوي هذه المجلّدة على إعداد الاتصال بقاعدة بيانات PostgreSQL عبر Prisma ORM.

## الملفات

- `client.ts` — عميل Prisma المفرد (singleton). استورد منه `prisma` لاستخدامه في طبقة الخدمات.
- `decimal.ts` — إعداد الحساب الرقمي الدقيق للقيم المالية (`Decimal`، `toDecimal`، `ZERO`) المبني على
  `Prisma.Decimal` (decimal.js) لتفادي أخطاء الفاصلة العائمة في الأسعار والأرصدة.

## مخطط قاعدة البيانات

يوجد ملف المخطط في `prisma/schema.prisma` (جذر المشروع) ويُهيّئ مصدر بيانات PostgreSQL يقرأ
رابط الاتصال من متغيّر البيئة `DATABASE_URL`. تُعرَّف النماذج الكاملة في المهمة 1.3.

## الإعداد

1. انسخ `.env.example` إلى `.env` واضبط `DATABASE_URL`.
2. ولّد عميل Prisma: `npm run prisma:generate`.
3. طبّق الهجرات لاحقاً (بعد تعريف النماذج): `npm run prisma:migrate`.

## مثال الاستخدام

```ts
import { prisma } from "@/lib/db/client";
import { toDecimal } from "@/lib/db/decimal";

const total = toDecimal("125.50").plus(toDecimal(10)); // 135.50
```
