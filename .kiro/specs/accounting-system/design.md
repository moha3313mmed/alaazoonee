# وثيقة التصميم

## نظرة عامة

يوثّق هذا المستند التصميم التقني لنظام محاسبي متكامل وشامل لشركة "الخليلي والعزوني للزجاج والإكسسوارات والتركيب". النظام تطبيق ويب متجاوب يعمل على الأجهزة المكتبية والمحمولة، بواجهة عربية أساسية باتجاه من اليمين إلى اليسار (RTL)، ويضم وحدات الفوترة والتسعير بالقياس، وإدارة العملاء والموردين، والمصروفات، والمخزون مع تنبيهات نقص المخزون، وتتبع مهام التركيب والفنيين، والتقارير المالية، ومساعداً ذكياً (شات بوت) قادراً على الاستعلام عن البيانات وتنفيذ العمليات نصياً بالعربية.

يغطّي التصميم البنية المعمارية، والمكوّنات، والواجهات البرمجية، ونماذج البيانات، ومعالجة الأخطاء، وخصائص الصحة (Correctness Properties) المشتقة من معايير القبول في وثيقة المتطلبات.

### الأهداف التصميمية

- **التكامل الكامل منذ الإطلاق**: ترابط جميع الوحدات بحيث تنعكس كل حركة مالية أو مخزنية تلقائياً على الأرصدة والتقارير ذات الصلة.
- **دقة الحسابات المالية**: استخدام حساب رقمي دقيق (decimal) لتفادي أخطاء الفاصلة العائمة في الأسعار والأرصدة.
- **الأمان والصلاحيات**: تطبيق ضوابط الوصول المبنية على الأدوار (RBAC) على مستوى الخادم لكل عملية.
- **العربية و RTL أولاً**: الواجهة والرسائل والتقارير بالعربية واتجاه RTL كأساس وليس كإضافة.
- **مساعد ذكي آمن**: ربط المساعد الذكي بالخدمات الخلفية نفسها مع فرض الصلاحيات وتأكيد العمليات المالية.

## المكدّس التقني (Technology Stack)

| الطبقة | التقنية المقترحة | المبرّر |
| --- | --- | --- |
| الواجهة الأمامية | Next.js 14 (App Router) + React + TypeScript | عرض من جهة الخادم، أداء عالٍ، دعم ممتاز للتطبيقات المتجاوبة |
| التنسيق والتصميم | Tailwind CSS مع تفعيل `dir="rtl"` + مكتبة shadcn/ui المهيّأة لـ RTL | دعم RTL سلس وخطوط عربية (Cairo / Tajawal) |
| إدارة حالة الخادم | TanStack Query (React Query) | تخزين مؤقت ومزامنة بيانات الخادم |
| الطبقة الخلفية | Next.js Route Handlers / خدمات Node.js بـ TypeScript | لغة موحّدة عبر المكدّس وسهولة الصيانة |
| قاعدة البيانات | PostgreSQL | معاملات ACID، دقة decimal، دعم قوي للعلاقات والتقارير |
| طبقة الوصول للبيانات | Prisma ORM | أمان الأنواع (type-safe) وإدارة الهجرات (migrations) |
| المصادقة | Auth.js (NextAuth) مع جلسات JWT وأدوار | إدارة جلسات وأدوار جاهزة وقابلة للتخصيص |
| المساعد الذكي | نموذج لغوي كبير (LLM) مع استدعاء الأدوات (Function/Tool Calling) | تحويل اللغة الطبيعية إلى استدعاءات خدمات مُتحقَّق منها |
| التقارير والتصدير | توليد PDF (مثل react-pdf) وتصدير CSV | مخرجات قابلة للطباعة والحفظ |

> ملاحظة: أمثلة الشيفرة في هذا المستند مكتوبة بلغة TypeScript لتمثيل العقود والواجهات؛ وهي توضيحية للبنية وليست تنفيذاً نهائياً.

## البنية المعمارية

يعتمد النظام بنية متعددة الطبقات (Layered Architecture) تفصل بين العرض، والخدمات (منطق الأعمال)، والوصول للبيانات، مع نقطة دخول موحّدة للعمليات تستخدمها واجهة المستخدم والمساعد الذكي معاً.

```
+-----------------------------------------------------------+
|                  واجهة المستخدم (RTL/عربي)                  |
|   لوحات + شاشات: فوترة، عملاء، موردون، مخزون، تركيب، تقارير |
|                   + واجهة محادثة المساعد الذكي              |
+----------------------------+------------------------------+
                             | HTTPS / JSON
+----------------------------v------------------------------+
|              طبقة الواجهة البرمجية (API Layer)             |
|   مصادقة الجلسة + فرض الصلاحيات (RBAC) + تحقق المدخلات     |
+----------------------------+------------------------------+
                             |
+----------------------------v------------------------------+
|            طبقة الخدمات (منطق الأعمال الموحّد)              |
|  BillingService, CustomerService, SupplierService,        |
|  ExpenseService, InventoryService, InstallationService,   |
|  ReportService, AuthService                               |
|     ^                                            ^        |
|     |        (تستدعي نفس الخدمات)                 |        |
+-----|--------------------------------------------|--------+
      |                                            |
+-----+------------------+        +----------------+--------+
| المساعد الذكي (LLM)    |        |  طبقة الوصول للبيانات   |
| تحويل النص -> أدوات    |        |   Prisma ORM            |
+------------------------+        +----------------+--------+
                                                   |
                                       +-----------v---------+
                                       |   PostgreSQL        |
                                       +---------------------+
```

### مبدأ "مصدر واحد للحقيقة" للعمليات

تُنفَّذ جميع عمليات الأعمال (إنشاء فاتورة، تسجيل دفعة، إضافة مصروف، إلخ) حصراً عبر **طبقة الخدمات**. تستدعي واجهة المستخدم هذه الخدمات عبر طبقة الـ API، ويستدعيها المساعد الذكي عبر الأدوات (Tools) نفسها. هذا يضمن أن قواعد التحقق، وتحديث الأرصدة، وفرض الصلاحيات تُطبَّق بصورة موحّدة بغضّ النظر عن مصدر الطلب.

## المكوّنات والواجهات

### 1. خدمة المصادقة والصلاحيات (AuthService)

مسؤولة عن تسجيل الدخول، وإدارة الجلسات، وفرض الأدوار (مدير، محاسب، فني)، وإنهاء الجلسة بعد الخمول.

```typescript
type Role = "مدير" | "محاسب" | "فني";

interface AuthService {
  login(username: string, password: string): Promise<Session | AuthError>;
  // يتحقق من صلاحية الدور لتنفيذ عملية معيّنة
  authorize(session: Session, permission: Permission): boolean;
  // ينهي الجلسة عند تجاوز مدة الخمول (30 دقيقة)
  isSessionExpired(session: Session, now: Date): boolean;
}

interface Session {
  userId: string;
  role: Role;
  issuedAt: Date;
  lastActivityAt: Date;
}
```

مصفوفة الصلاحيات (مبسّطة): يملك **المدير** جميع الصلاحيات؛ يملك **المحاسب** صلاحيات الفوترة والعملاء والموردين والمصروفات والمخزون والتقارير؛ يملك **الفني** صلاحية عرض مهام التركيب المسندة إليه وتحديث حالتها فقط.

### 2. خدمة الفوترة والتسعير (BillingService)

تتولى عروض الأسعار، والتسعير بالقياس وبالقطعة، والخصم والضريبة، وتحويل العرض إلى فاتورة، وتسجيل المدفوعات، وتصنيف حالة الفاتورة.

```typescript
type LineItemKind = "بالقياس" | "بالقطعة";

interface LineItem {
  kind: LineItemKind;
  description: string;
  // للبنود بالقياس
  widthМ?: number;   // العرض بالمتر
  heightM?: number;  // الارتفاع بالمتر
  pricePerSqm?: number;
  // للبنود بالقطعة
  quantity?: number;
  unitPrice?: number;
  inventoryItemId?: string; // لربط الخصم من المخزون
}

interface BillingService {
  computeLineTotal(item: LineItem): Decimal;       // المساحة × سعر المتر، أو الكمية × سعر الوحدة
  computeQuoteSubtotal(items: LineItem[]): Decimal; // مجموع البنود
  applyDiscountAndTax(subtotal: Decimal, discountPct: number, taxPct: number): Decimal;
  convertQuoteToInvoice(quoteId: string): Promise<Invoice>;
  recordPayment(invoiceId: string, amount: Decimal): Promise<Invoice | BillingError>;
  classifyStatus(invoice: Invoice): InvoiceStatus; // مشتقة من المبلغ المتبقي
}

type InvoiceStatus = "غير مدفوعة" | "مدفوعة جزئياً" | "مدفوعة بالكامل";
```

قواعد رئيسية:
- سعر بند بالقياس = `العرض × الارتفاع × سعر المتر المربع`.
- يُرفض أي بند بالقياس قيمه (العرض/الارتفاع/سعر المتر) ≤ 0.
- الصافي = `(الإجمالي) × (1 − نسبة الخصم) × (1 + نسبة الضريبة)` بحسب النسب المحددة.
- تُرفض الدفعة التي تتجاوز المبلغ المتبقي.

### 3. خدمة العملاء (CustomerService)

```typescript
interface CustomerService {
  createCustomer(input: { name: string; phone: string; }): Promise<Customer | ValidationError>;
  getCustomer(id: string): Promise<CustomerProfile>; // البيانات + الرصيد + سجل الفواتير والمدفوعات
  searchCustomers(query: string): Promise<Customer[]>; // بالاسم أو رقم الهاتف
  applyTransaction(customerId: string, delta: Decimal): Promise<void>; // تحديث الرصيد
}
```

قواعد: العميل الجديد يُنشأ برصيد ابتدائي = 0؛ ويُرفض الحفظ دون الاسم أو رقم الهاتف.

### 4. خدمة الموردين (SupplierService)

مماثلة لخدمة العملاء من حيث الإنشاء والتحقق وتحديث الرصيد عند المشتريات والمدفوعات وعرض السجل.

### 5. خدمة المصروفات (ExpenseService)

```typescript
interface ExpenseService {
  recordExpense(input: { amount: Decimal; date: Date; category: string; supplierId?: string; }):
    Promise<Expense | ValidationError>;
  listExpenses(range: DateRange): Promise<{ items: Expense[]; total: Decimal }>;
}
```

قواعد: يُرفض المصروف بمبلغ ≤ 0؛ وعند ربطه بمورد يُحدَّث رصيد المورد.

### 6. خدمة المخزون (InventoryService)

```typescript
type UnitKind = "متر مربع" | "قطعة";

interface InventoryItem {
  id: string;
  name: string;
  unit: UnitKind;
  quantity: Decimal;
  reorderLevel: Decimal; // حد إعادة الطلب
}

interface InventoryService {
  createItem(input: Omit<InventoryItem, "id">): Promise<InventoryItem | ValidationError>;
  deductStock(itemId: string, qty: Decimal): Promise<void | StockError>; // يمنع السالب
  addStock(itemId: string, qty: Decimal): Promise<void>;
  isLowStock(item: InventoryItem): boolean; // الكمية <= حد إعادة الطلب
  getLowStockAlerts(): Promise<InventoryItem[]>;
}
```

### 7. خدمة التركيب (InstallationService)

```typescript
type JobStatus = "مجدولة" | "قيد التنفيذ" | "مكتملة" | "ملغاة";

interface InstallationService {
  createJob(input: { customerId?: string; invoiceId?: string; }): Promise<Job>; // الحالة الابتدائية: مجدولة
  assignTechnicians(jobId: string, technicianIds: string[], scheduledAt: Date):
    Promise<Job | ConflictWarning>;
  updateStatus(jobId: string, status: JobStatus): Promise<Job>;
  getJobsByTechnician(technicianId: string): Promise<Job[]>;
  detectConflict(technicianId: string, scheduledAt: Date): boolean; // تعارض المواعيد
}
```

### 8. خدمة التقارير (ReportService)

```typescript
interface ReportService {
  salesReport(range: DateRange): Promise<{ totalSales: Decimal; invoiceCount: number }>;
  profitReport(range: DateRange): Promise<{ profit: Decimal }>; // المبيعات − (المصروفات + تكلفة البضاعة المباعة)
  receivablesReport(): Promise<{ customers: Balance[]; suppliers: Balance[] }>;
  inventoryReport(): Promise<{ items: InventoryItem[]; lowStock: InventoryItem[] }>;
  export(report: ReportData, format: "pdf" | "csv"): Promise<FileBlob>;
}
```

### 9. المساعد الذكي (AssistantService)

يحوّل الرسائل العربية إلى نوايا (intents) ثم إلى استدعاءات أدوات (Tools) مرتبطة بطبقة الخدمات نفسها.

```typescript
interface AssistantTool {
  name: string;             // مثل: "get_customer_balance", "create_invoice"
  requiredPermission: Permission;
  hasFinancialEffect: boolean;
}

interface AssistantService {
  // يفهم الاستفسار، ويتحقق من اكتمال البيانات والصلاحية، ويطلب التأكيد للعمليات المالية
  handleMessage(session: Session, message: string): Promise<AssistantReply>;
}
```

قواعد رئيسية للمساعد:
- تُقصَر نتائج الاستعلام على البيانات المصرّح بها لدور المستخدم.
- يُطلب التأكيد قبل تنفيذ أي عملية ذات أثر مالي.
- تُطلب البيانات الناقصة بالعربية قبل التنفيذ.
- عند تعذّر الفهم، يُطلب التوضيح بدلاً من تقديم إجابة غير مؤكدة.
- تُمنع أي عملية لا يصرّح بها دور المستخدم مع رسالة عدم تصريح.

## نماذج البيانات

```
User(id, username, passwordHash, role, isActive)

Customer(id, name, phone, balance=0, createdAt)
Supplier(id, name, phone, balance=0, createdAt)

Quote(id, customerId, discountPct, taxPct, status, createdAt)
QuoteItem(id, quoteId, kind, description, widthM?, heightM?, pricePerSqm?,
          quantity?, unitPrice?, inventoryItemId?, lineTotal)

Invoice(id, number UNIQUE, customerId, quoteId?, issueDate, subtotal,
        discountPct, taxPct, netTotal, paidAmount, remainingAmount, status)
InvoiceItem(id, invoiceId, ... نفس بنية QuoteItem)
Payment(id, invoiceId, amount, date)

Expense(id, amount, date, category, supplierId?)

InventoryItem(id, name, unit, quantity, reorderLevel)
StockMovement(id, itemId, type[بيع|شراء|تعديل], quantity, refType?, refId?, date)

InstallationJob(id, customerId?, invoiceId?, status, scheduledAt?, createdAt)
JobTechnician(jobId, technicianId) -- علاقة متعدّد لمتعدّد
Technician(id, name) -- مرتبط بمستخدم بدور "فني"

AssistantLog(id, userId, message, resolvedIntent, executedToolId?, createdAt)
```

العلاقات الجوهرية:
- اعتماد فاتورة → زيادة `Customer.balance` و خصم كميات `InventoryItem` المرتبطة (StockMovement نوع "بيع").
- تسجيل دفعة → تقليل `Invoice.remainingAmount` وتحديث `Customer.balance`.
- شراء/مصروف مرتبط بمورد → تحديث `Supplier.balance` (StockMovement نوع "شراء" عند إدخال مخزون).

> دقة الأرقام: تُخزَّن جميع القيم المالية والكميات كنوع `Decimal` (NUMERIC في PostgreSQL) وتُجرى عليها العمليات الحسابية بمكتبة decimal لتفادي أخطاء الفاصلة العائمة.

## معالجة الأخطاء

| الفئة | المعالجة | الرسالة |
| --- | --- | --- |
| فشل المصادقة | رفض تسجيل الدخول دون كشف السبب التفصيلي | رسالة خطأ عامة بالعربية |
| تجاوز الصلاحيات | منع التنفيذ على مستوى الخادم | "غير مصرّح لك بتنفيذ هذه العملية" |
| مدخلات ناقصة/غير صالحة | تحقق على مستوى الخدمة قبل الحفظ | رسالة تحدد الحقول الناقصة/الخاطئة بالعربية |
| قيم قياس ≤ 0 | رفض حفظ البند | "قيم القياس يجب أن تكون أكبر من صفر" |
| دفعة تتجاوز المتبقي | رفض العملية | "قيمة الدفعة تتجاوز المبلغ المتبقي" |
| نقص مخزون | منع البيع الذي يُنزل الكمية دون الصفر | "الرصيد غير كافٍ لهذا الصنف" |
| تعارض موعد فني | تنبيه دون منع إجباري | "يوجد تعارض في موعد الفني" |
| فشل فهم المساعد | طلب توضيح | سؤال استيضاحي بالعربية |
| خطأ غير متوقع | تسجيل الخطأ وإرجاع استجابة آمنة | "حدث خطأ، يرجى المحاولة لاحقاً" |

مبادئ عامة: التحقق على مستوى الخادم دائماً (لا الاعتماد على الواجهة فقط)؛ تنفيذ العمليات متعددة الخطوات داخل معاملات قاعدة بيانات (transactions) لضمان التماسك؛ وعدم كشف تفاصيل داخلية حساسة في الرسائل.

## استراتيجية الاختبار

- **اختبارات الوحدة (Unit)**: للأمثلة المحددة وحالات الحافة والأخطاء (مثل رفض المدخلات غير الصالحة وتصنيف حالة الفاتورة).
- **اختبارات الخصائص (Property-based)**: للخصائص الكونية الواردة أدناه، بحد أدنى 100 تكرار لكل خاصية، مع وسم كل اختبار بالخاصية المرجعية بصيغة: **Feature: accounting-system, Property {رقم}: {نص الخاصية}**.
- **اختبارات التكامل (Integration)**: للتدفقات المترابطة (اعتماد فاتورة → خصم مخزون → تحديث رصيد عميل) وللمساعد الذكي مع طبقة الخدمات.
