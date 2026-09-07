import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

function splitName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || "Allemni",
    lastName: parts.slice(1).join(" ") || "User",
  };
}
function normalizePhone(phone: string) {
  const raw = phone.replace(/[\s()-]/g, "");
  if (raw.startsWith("+20")) return raw;
  if (raw.startsWith("20")) return `+${raw}`;
  if (raw.startsWith("0")) return `+20${raw.slice(1)}`;
  return raw;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "يجب تسجيل الدخول أولاً." },
        { status: 401 },
      );

    const body = await request.json();
    const bookingId = String(body.bookingId || "");
    const suppliedPhone = String(body.phone || "").trim();
    if (!bookingId)
      return NextResponse.json(
        { error: "طلب الجلسة غير موجود." },
        { status: 400 },
      );

    const secret = process.env.PAYMOB_SECRET_KEY;
    const publicKey = process.env.PAYMOB_PUBLIC_KEY;
    const integrationId = Number(process.env.PAYMOB_INTEGRATION_ID_CARD);
    const baseUrl = process.env.PAYMOB_BASE_URL || "https://accept.paymob.com";
    const appUrl = process.env.APP_URL;
    const missing = [
      !secret ? "PAYMOB_SECRET_KEY" : null,
      !publicKey ? "PAYMOB_PUBLIC_KEY" : null,
      !integrationId ? "PAYMOB_INTEGRATION_ID_CARD" : null,
      !appUrl ? "APP_URL" : null,
      !process.env.SUPABASE_SERVICE_ROLE_KEY
        ? "SUPABASE_SERVICE_ROLE_KEY"
        : null,
    ].filter(Boolean) as string[];
    if (missing.length) {
      console.error("Missing payment env vars:", missing.join(", "));
      return NextResponse.json(
        { error: `إعدادات الدفع ناقصة في السيرفر: ${missing.join(", ")}` },
        { status: 500 },
      );
    }
    // The check above already guarantees these are set at runtime; this
    // direct guard lets TypeScript narrow them from `string | undefined`
    // to `string` for every use below (env vars are always optional to TS).
    if (!secret || !publicKey || !integrationId || !appUrl) {
      return NextResponse.json(
        { error: "إعدادات الدفع ناقصة في السيرفر." },
        { status: 500 },
      );
    }

    const admin = createAdminClient();
    const [{ data: booking }, { data: profile }] = await Promise.all([
      admin
        .from("bookings")
        .select(
          "id, requester_id, provider_id, hours, status, payment_method, amount_egp, platform_fee_egp, provider_earnings_egp",
        )
        .eq("id", bookingId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", user.id)
        .maybeSingle(),
    ]);
    if (!booking || booking.requester_id !== user.id)
      return NextResponse.json(
        { error: "غير مسموح لك تدفع للجلسة هذه." },
        { status: 403 },
      );
    if (booking.status !== "accepted")
      return NextResponse.json(
        { error: "الدفع متاح بعد قبول طلب الجلسة." },
        { status: 409 },
      );
    if (booking.payment_method !== "money")
      return NextResponse.json(
        { error: "هذه الجلسة مدفوعة بالساعات." },
        { status: 400 },
      );

    const { data: payment } = await admin
      .from("booking_payments")
      .select("id, status, paymob_intention_id, paymob_client_secret")
      .eq("booking_id", booking.id)
      .maybeSingle();
    if (!payment)
      return NextResponse.json(
        { error: "سجل الدفع للجلسة غير موجود." },
        { status: 500 },
      );
    if (payment.status === "paid" || payment.status === "released")
      return NextResponse.json(
        { error: "الجلسة مدفوعة بالفعل." },
        { status: 409 },
      );

    // A booking has exactly one booking_payments row, so its id is reused
    // as Paymob's special_reference/merchant_order_id on every attempt.
    // Paymob refuses to create a second order under a reference that's
    // already registered ("An Order with ref: ... already exists"), so if
    // we already have a stored intention for this payment (from this call
    // or an earlier one that got marked "failed" purely because of this
    // same duplicate-reference issue), resume that checkout instead of
    // asking Paymob to create a brand new one.
    if (payment.paymob_intention_id && payment.paymob_client_secret) {
      return NextResponse.json({
        checkoutUrl: `${baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(payment.paymob_client_secret)}`,
      });
    }

    const phone = suppliedPhone || profile?.phone || user.phone || "";
    const normalized = phone.replace(/[\s()-]/g, "");
    if (!/^\+?20?01\d{9}$/.test(normalized) && !/^01\d{9}$/.test(normalized)) {
      return NextResponse.json(
        { error: "اكتب رقم موبايل مصري صحيح لإتمام الدفع." },
        { status: 400 },
      );
    }

    const { firstName, lastName } = splitName(
      profile?.full_name || user.user_metadata?.full_name || "عضو علّمني",
    );
    const amount = Math.round(Number(booking.amount_egp) * 100);
    if (!Number.isFinite(amount) || amount <= 0)
      return NextResponse.json(
        { error: "قيمة الجلسة غير صحيحة." },
        { status: 500 },
      );

    const response = await fetch(`${baseUrl}/v1/intention/`, {
      method: "POST",
      headers: {
        Authorization: `Token ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "EGP",
        payment_methods: [integrationId],
        items: [
          {
            name: `علّمني - جلسة ${booking.hours} ساعة`,
            amount,
            description: "جلسة مهارة مدفوعة",
            quantity: 1,
          },
        ],
        special_reference: payment.id,
        billing_data: {
          first_name: firstName,
          last_name: lastName,
          email: user.email || "customer@example.com",
          phone_number: normalizePhone(phone),
          apartment: "NA",
          floor: "NA",
          street: "NA",
          building: "NA",
          shipping_method: "NA",
          postal_code: "NA",
          city: "Cairo",
          country: "EG",
          state: "Cairo",
        },
        customer: {
          first_name: firstName,
          last_name: lastName,
          email: user.email || "customer@example.com",
        },
        notification_url: `${appUrl}/api/paymob/webhook`,
        redirection_url: `${appUrl}/payment/complete?bookingPayment=${payment.id}`,
      }),
    });

    if (!response.ok) {
      const paymobErrorText = await response.text();
      console.error(
        "Paymob booking intention failed:",
        response.status,
        paymobErrorText,
      );
      await admin
        .from("booking_payments")
        .update({ status: "failed" })
        .eq("id", payment.id)
        .eq("status", "pending");
      return NextResponse.json(
        {
          error: "تعذر إنشاء عملية دفع الجلسة.",
          // Only exposed outside production so real Paymob rejections are
          // visible without digging through server logs during development.
          ...(process.env.NODE_ENV !== "production"
            ? { debug: { status: response.status, paymob: paymobErrorText } }
            : {}),
        },
        { status: 502 },
      );
    }

    const intention = await response.json();
    const { error: updateError } = await admin
      .from("booking_payments")
      .update({
        status: "pending",
        paymob_intention_id: intention.id ? String(intention.id) : null,
        paymob_client_secret: intention.client_secret
          ? String(intention.client_secret)
          : null,
      })
      .eq("id", payment.id);
    if (updateError)
      console.error("booking payment update error:", updateError);

    return NextResponse.json({
      checkoutUrl: `${baseUrl}/unifiedcheckout/?publicKey=${encodeURIComponent(publicKey)}&clientSecret=${encodeURIComponent(intention.client_secret)}`,
    });
  } catch (error) {
    console.error("create-booking-intention error:", error);
    return NextResponse.json({ error: "حدث خطأ غير متوقع." }, { status: 500 });
  }
}
