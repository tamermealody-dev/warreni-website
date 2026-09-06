# إعداد شحن الساعات — ورّيني

تمت إضافة:
- `/plans` لثلاث باقات: 2 ساعة = 19 جنيه، 5 ساعات = 45 جنيه، 10 ساعات = 79 جنيه مع عرض والأكثر مبيعًا.
- `/reset-password` لإكمال رابط "نسيت كلمة المرور".
- `/payment/complete` لعرض نتيجة الدفع.
- Paymob Intention API + Unified Checkout.
- Webhook HMAC-SHA512 ومكافأة الساعات بشكل idempotent.
- Migration `019_hour_purchases.sql`.

## المطلوب منك

من لوحة Paymob المصرية تحتاج:
- Secret Key
- Public Key
- HMAC Secret
- Card Integration ID

وفي الاستضافة:
- `APP_URL=https://دومينك`
- `SUPABASE_SERVICE_ROLE_KEY` من Supabase (Server Only)

واحتفظ بالـ Secret Key وHMAC وService Role Key في Environment Variables فقط.

قبل الدفع الحقيقي، نفّذ migrations 018 و019 في Supabase. وبعد نشر الموقع اجعل `APP_URL` هو رابط الموقع الحقيقي.

Paymob يستخدم `POST /v1/intention/` لإنشاء عملية الدفع ثم Unified Checkout. تأكيد إضافة الساعات يعتمد على الـ webhook الموثق بـ HMAC، وليس على رجوع المتصفح.
