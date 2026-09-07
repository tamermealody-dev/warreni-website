# علّمني — Backend Setup Guide (Step 1: Database Schema)

## اللي عملته في الخطوة دي

3 ملفات SQL جاهزة في `supabase/migrations/`، بترتيب التنفيذ:

1. **`001_schema.sql`** — كل الجداول: profiles, skills_offered/wanted, wallets,
   bookings, booking_confirmations, wallet_transactions, reviews, reports,
   notifications, conversations, messages.
2. **`002_functions_and_triggers.sql`** — المنطق الحقيقي:
   - إنشاء بروفايل + محفظة (رصيد ابتدائي ساعتين) تلقائيًا عند التسجيل
   - نظام التأكيد المزدوج: لما الطرفين يأكدوا، الساعات بتتحول تلقائي
   - وظيفة التأكيد التلقائي بعد 48 ساعة (auto-confirm)
   - إشعارات تلقائية عند كل حدث مهم
3. **`003_rls_policies.sql`** — قواعد الأمان (Row Level Security) بحيث محدش
   يقدر يشوف أو يعدّل بيانات مش بتاعته، حتى لو حصل باگ في الفرونت.

## إيه اللي محتاجه منك دلوقتي

### 1. اعمل مشروع Supabase
روح على [supabase.com](https://supabase.com) → New Project → اختار اسم وباسورد
لقاعدة البيانات واحفظهم (مش هتحتاج تبعتهم لي).

### 2. شغّل ملفات الـ migration بالترتيب
من داخل مشروعك في Supabase: **SQL Editor** → افتح كل ملف من التلاتة بالترتيب
(001 ثم 002 ثم 003) وانسخ المحتوى وشغّله (Run). لازم يخلص كل ملف بنجاح
قبل ما تنتقل للي بعده.

### 3. فعّل pg_cron لخاصية التأكيد التلقائي بعد 48 ساعة
من **Database → Extensions** فعّل `pg_cron`، وبعدين في SQL Editor شغّل السطر ده مرة واحدة:
```sql
select cron.schedule('auto-confirm-bookings', '0 * * * *', 'select auto_confirm_stale_bookings();');
```
ده هيخلي النظام يفحص كل ساعة على أي جلسة حد بس أكدها ومحدش رد عليها.

### 4. هات المفاتيح دي (من Project Settings → API)
- **Project URL**
- **anon public key**

حطهم في ملف `.env.local` في مشروع الفرونت (هبعتلك الملف بالضبط في الخطوة الجاية
لما نربط الـ Auth). **متبعتليش الـ `service_role key` في الشات خالص** — ده مفتاح
لو حد وصله بيقدر يتخطى كل قواعد الأمان، سيبه في `.env.local` بتاعك بس وما
يتشاركش مع حد.

## ملاحظة مهمة عن حد الـ -3 ساعات

الـ CHECK constraint في `wallets` بيمنع الرصيد إنه ينزل تحت -3 كإجراء أمان أخير،
بس المنع الحقيقي هيبقى في كود الـ API لما حد يعمل booking request جديد —
هنتأكد وقتها إن (رصيده الحالي - عدد الساعات المطلوبة) ما يقلّش عن -3 قبل
ما نسمحله يبعت الطلب. هنبنيها في خطوة الـ API.

---

## الخطوة الجاية

لما تخلص الخطوات التلاتة اللي فوق وتأكدلي إنها اشتغلت من غير أخطاء،
هبدأ في: **ربط Supabase Auth بالفرونت الموجود** (تسجيل دخول/تسجيل حقيقي بدل
الـ mock data)، وبعدها الـ API الخاصة بالـ Explore والبروفايل.


### 020 — paid sessions
Adds money-paid session flow at 20 EGP/hour, 8% platform fee, provider pending/available EGP balances, verified Paymob confirmation, and payment-gated room creation.

- `022_payout_requests.sql`: طلبات السحب وحجز الرصيد ومعالجة الدفع من الخلفية.
