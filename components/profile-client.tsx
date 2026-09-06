"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import {
  ArrowLeft,
  Bell,
  Check,
  Clock3,
  Users,
  FileText,
  LogOut,
  MapPin,
  MessageCircle,
  Settings,
  Star,
  X,
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { approveSessionStart } from "@/app/sessions/actions";
import {
  acceptBooking,
  addSkillOffered,
  cancelAcceptedBooking,
  cancelBooking,
  changePassword,
  confirmSessionDone,
  confirmSessionIssue,
  deleteSkillOffered,
  markNotificationsRead,
  rejectBooking,
  submitReview,
  updateProfile,
} from "@/app/profile/actions";
import {
  arDateTime,
  arNumber,
  initialsOf,
  toneOf,
  CATEGORY_LABELS,
} from "@/lib/format";

export interface RequestItem {
  id: string;
  otherName: string;
  otherAvatarUrl: string | null;
  skillTitle: string | null;
  proposedDatetime: string;
  hours: number;
  message: string | null;
  paymentMethod: "hours" | "money";
  amountEgp: number | null;
}

export interface WalletLedgerRow {
  id: string;
  otherName: string;
  otherAvatarUrl: string | null;
  hours: number;
  positive: boolean;
  createdAt: string;
}

export interface ProfileData {
  userId: string;
  fullName: string;
  city: string | null;
  bio: string | null;
  avatarUrl: string | null;
  phone: string | null;
  memberSinceYear: number;
  walletBalance: number;
  walletMoneyBalance: number;
  walletPendingMoney: number;
  skills: { id: string; category: string; title: string }[];
  completedCount: number;
  avgRating: number | null;
  reviewCount: number;
  reviewItems: {
    bookingId: string;
    otherId: string;
    otherName: string;
    otherAvatarUrl: string | null;
    proposedDatetime: string;
    rating: number | null;
    comment: string | null;
  }[];
  incomingRequests: RequestItem[];
  outgoingRequests: RequestItem[];
  activeSession: {
    bookingId: string;
    otherName: string;
    otherAvatarUrl: string | null;
    proposedDatetime: string;
    hours: number;
    myConfirmed: boolean;
    sessionId: string | null;
    sessionStatus: string | null;
    sessionStartedAt: string | null;
    sessionEndsAt: string | null;
    startApproved: boolean;
    otherStartApproved: boolean;
    insufficientBalance: boolean;
    paymentMethod: "hours" | "money";
    isRequester: boolean;
    paymentStatus: string | null;
    amountEgp: number | null;
    providerEarningsEgp: number | null;
  } | null;
  disputedCount: number;
  recentTransactions: WalletLedgerRow[];
  notifications: {
    id: string;
    title: string;
    body: string | null;
    readAt: string | null;
    createdAt: string;
  }[];
}

function Avatar({
  initials,
  tone,
  avatarUrl,
}: {
  initials: string;
  tone: string;
  avatarUrl?: string | null;
}) {
  return avatarUrl ? (
    <img className="avatar avatar-image" src={avatarUrl} alt="" />
  ) : (
    <div className={`avatar ${tone}`}>{initials}</div>
  );
}

function WalletDrawer({
  balance,
  ledger,
  close,
}: {
  balance: number;
  ledger: WalletLedgerRow[];
  close: () => void;
}) {
  return (
    <div className="drawer-backdrop" onClick={close}>
      <aside className="wallet-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <p className="eyebrow">محفظة الوقت</p>
            <h2>كشف الحساب</h2>
          </div>
          <button className="icon-button" onClick={close} aria-label="إغلاق">
            <X size={18} />
          </button>
        </div>
        <div className="drawer-balance">
          <Clock3 size={20} />
          <strong>
            {arNumber(balance)} <small>ساعات</small>
          </strong>
          <span>الرصيد الحالي</span>
        </div>
        <div className="transaction-list">
          {ledger.length === 0 && (
            <p className="empty-hint">
              لسه معملتش أي تبادل. أول تبادل بتخلصه هيظهر هنا.
            </p>
          )}
          {ledger.map((t) => (
            <div className="transaction-row" key={t.id}>
              <Avatar
                initials={initialsOf(t.otherName)}
                tone={t.positive ? "mint" : "lavender"}
                avatarUrl={t.otherAvatarUrl}
              />
              <div>
                <strong>{t.otherName}</strong>
                <span>{arDateTime(t.createdAt)}</span>
              </div>
              <div
                className={t.positive ? "amount positive" : "amount negative"}
              >
                {t.positive ? "+" : "-"}
                {arNumber(t.hours)}
                <small>مكتمل</small>
              </div>
            </div>
          ))}
        </div>
        <Link href="/transactions" className="button primary full">
          عرض كشف الحساب الكامل <ArrowLeft size={16} />
        </Link>
      </aside>
    </div>
  );
}

export default function ProfileClient({ data }: { data: ProfileData }) {
  const router = useRouter();
  const [walletOpen, setWalletOpen] = useState(false);
  const [requestTab, setRequestTab] = useState<"incoming" | "outgoing">(
    "incoming",
  );
  const [issueNote, setIssueNote] = useState("");
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [showSkillForm, setShowSkillForm] = useState(false);
  const [skillCategory, setSkillCategory] = useState("other");
  const [skillTitle, setSkillTitle] = useState("");
  const [showProfileForm, setShowProfileForm] = useState(false);
  const [profileName, setProfileName] = useState(data.fullName);
  const [profileCity, setProfileCity] = useState(data.city ?? "");
  const [profileBio, setProfileBio] = useState(data.bio ?? "");
  const [profileAvatar, setProfileAvatar] = useState(data.avatarUrl ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [reviewRatings, setReviewRatings] = useState<Record<string, number>>(
    {},
  );
  const [reviewComments, setReviewComments] = useState<Record<string, string>>(
    {},
  );
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [paymentPhone, setPaymentPhone] = useState(data.phone ?? "");
  const [paymentLoading, setPaymentLoading] = useState(false);

  const visibleRequests =
    requestTab === "incoming" ? data.incomingRequests : data.outgoingRequests;

  async function uploadAvatar(file: File) {
    if (!file.type.startsWith("image/")) throw new Error("اختار صورة بس.");
    if (file.size > 5 * 1024 * 1024)
      throw new Error("الصورة لازم تكون أقل من 5 ميجا.");
    const supabase = createClient();
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("لازم تسجّل دخول الأول.");
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw new Error("تعذر رفع الصورة: " + error.message);
    const { data: publicData } = supabase.storage
      .from("avatars")
      .getPublicUrl(path);
    return publicData.publicUrl;
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function runAction(action: () => Promise<void>) {
    setActionError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setActionError(
          err instanceof Error ? err.message : "حصلت مشكلة، حاول تاني.",
        );
      }
    });
  }

  const ratingLabel =
    data.reviewCount > 0 && data.avgRating !== null
      ? arNumber(data.avgRating, 1)
      : "جديد";
  const unreadNotifications = data.notifications.filter(
    (n) => !n.readAt,
  ).length;

  function handleSaveProfile() {
    runAction(async () => {
      let avatarUrl = profileAvatar || null;
      if (avatarFile) avatarUrl = await uploadAvatar(avatarFile);
      await updateProfile({
        fullName: profileName,
        city: profileCity,
        bio: profileBio,
        avatarUrl,
      });
      setProfileAvatar(avatarUrl ?? "");
      setAvatarFile(null);
      setShowProfileForm(false);
    });
  }

  function handleSubmitReview(bookingId: string) {
    const rating = reviewRatings[bookingId] ?? 0;
    if (rating < 1 || rating > 5) {
      setActionError("اختار تقييم من نجمة لحد 5 نجوم.");
      return;
    }
    runAction(async () => {
      await submitReview({
        bookingId,
        rating,
        comment: reviewComments[bookingId] ?? "",
      });
    });
  }

  function handleChangePassword() {
    runAction(async () => {
      await changePassword({ password: newPassword, confirmPassword });
      setNewPassword("");
      setConfirmPassword("");
      setShowPasswordForm(false);
    });
  }

  async function payForSession() {
    const active = data.activeSession;
    if (!active || active.paymentMethod !== "money") return;
    if (!paymentPhone.trim()) {
      setActionError("اكتب رقم الموبايل الأول عشان نكمل الدفع.");
      return;
    }
    setActionError(null);
    setPaymentLoading(true);
    try {
      const response = await fetch("/api/paymob/create-booking-intention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: active.bookingId,
          phone: paymentPhone,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر بدء الدفع.");
      window.location.href = result.checkoutUrl;
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "حصلت مشكلة في بدء الدفع.",
      );
      setPaymentLoading(false);
    }
  }

  function handleAddSkill() {
    if (!skillTitle.trim()) {
      setActionError("اكتب اسم المهارة الأول.");
      return;
    }
    runAction(async () => {
      await addSkillOffered({ category: skillCategory, title: skillTitle });
      setSkillTitle("");
      setSkillCategory("other");
      setShowSkillForm(false);
    });
  }

  // Keep the start-approval state synchronized between the two profiles.
  // The second participant can create the room while the first participant is
  // still sitting on this page. A realtime channel is the fast path — the
  // moment the room row is inserted, whoever's waiting gets pushed straight
  // in — but it depends on Realtime being reachable/configured, and the
  // consequence of it silently failing here isn't just a stale UI: the
  // other side's session will eventually get killed by the heartbeat's
  // "other participant never joined" check. So a short poll runs alongside
  // it as a safety net, not instead of it.
  useEffect(() => {
    const active = data.activeSession;
    if (
      !active ||
      active.sessionId ||
      !active.startApproved ||
      active.sessionStatus === "completed"
    )
      return;

    const client = createClient();
    let stopped = false;

    const check = async () => {
      const [{ data: liveSession }, { data: approvals }] = await Promise.all([
        client
          .from("live_sessions")
          .select("id, status")
          .eq("booking_id", active.bookingId)
          .maybeSingle(),
        client
          .from("session_start_approvals")
          .select("user_id")
          .eq("booking_id", active.bookingId),
      ]);
      if (stopped) return;
      if (liveSession?.id && liveSession.status === "active") {
        router.push(`/sessions/${liveSession.id}`);
        return;
      }
      if ((approvals?.length ?? 0) >= 2) {
        try {
          const result = await approveSessionStart(active.bookingId);
          if (!stopped && result.sessionId)
            router.push(`/sessions/${result.sessionId}`);
        } catch {}
      }
    };
    void check();
    const timer = window.setInterval(() => void check(), 4000);

    const channel = client
      .channel(`session-entry-${active.bookingId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "live_sessions",
          filter: `booking_id=eq.${active.bookingId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; status: string };
          if (!stopped && row.status === "active")
            router.push(`/sessions/${row.id}`);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_start_approvals",
          filter: `booking_id=eq.${active.bookingId}`,
        },
        () => {
          if (!stopped) router.refresh();
        },
      )
      .subscribe();

    return () => {
      stopped = true;
      window.clearInterval(timer);
      client.removeChannel(channel);
    };
  }, [
    data.activeSession?.bookingId,
    data.activeSession?.sessionId,
    data.activeSession?.startApproved,
    data.activeSession?.sessionStatus,
    router,
  ]);

  // Incoming/outgoing requests: react live instead of needing a manual
  // refresh — a new request in either direction, or a status change
  // (accepted/rejected/cancelled) on one you already have, updates the
  // list right away.
  useEffect(() => {
    const client = createClient();
    let stopped = false;

    const channel = client
      .channel(`profile-bookings-${data.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `requester_id=eq.${data.userId}`,
        },
        () => {
          if (!stopped) router.refresh();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `provider_id=eq.${data.userId}`,
        },
        () => {
          if (!stopped) router.refresh();
        },
      )
      .subscribe();

    return () => {
      stopped = true;
      client.removeChannel(channel);
    };
  }, [data.userId, router]);

  return (
    <main className="profile-page" dir="rtl">
      <header className="profile-nav">
        <Link href="/" className="logo">
          <span>
            <Clock3 size={19} />
          </span>
          ورّيني
        </Link>
        <div className="profile-nav-actions">
          <Link href="/sessions" className="button ghost small-dark">
            الجلسات
          </Link>
          <button className="wallet-pill" onClick={() => setWalletOpen(true)}>
            <Clock3 size={15} /> رصيدك:{" "}
            <b>{arNumber(data.walletBalance)} ساعات</b>
          </button>
          <button
            className="notification-trigger icon-button"
            aria-label="الإشعارات"
            onClick={() => {
              setNotificationsOpen((v) => !v);
              if (unreadNotifications) {
                startTransition(async () => {
                  try {
                    await markNotificationsRead();
                    router.refresh();
                  } catch (err) {
                    setActionError(
                      err instanceof Error
                        ? err.message
                        : "حصلت مشكلة في الإشعارات.",
                    );
                  }
                });
              }
            }}
          >
            <Bell size={18} />
            {unreadNotifications > 0 && (
              <span className="notification-badge">
                {arNumber(unreadNotifications, 0)}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="notifications-popover">
              <div className="notifications-popover-head">
                <strong>الإشعارات</strong>
                <span>
                  {unreadNotifications
                    ? `${arNumber(unreadNotifications, 0)} جديدة`
                    : "مقروءة كلها"}
                </span>
              </div>
              {data.notifications.length ? (
                data.notifications.slice(0, 8).map((n) => (
                  <div
                    className={`notification-item ${!n.readAt ? "unread" : ""}`}
                    key={n.id}
                  >
                    <Bell size={15} />
                    <div>
                      <strong>{n.title}</strong>
                      <p>{n.body ?? ""}</p>
                      <small>{arDateTime(n.createdAt)}</small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="empty-hint">مفيش إشعارات لسه.</p>
              )}
            </div>
          )}
          <button
            className="icon-button"
            aria-label="الإعدادات"
            onClick={() => setShowPasswordForm(true)}
          >
            <Settings size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="تسجيل الخروج"
            onClick={handleSignOut}
          >
            <LogOut size={18} />
          </button>
          <Link href="/" className="button outline">
            الرئيسية <ArrowLeft size={15} />
          </Link>
        </div>
      </header>

      <section className="profile-hero">
        <div className="profile-hero-glow" />
        <div className="profile-avatar-wrap">
          {data.avatarUrl ? (
            <img
              className="profile-avatar profile-avatar-image"
              src={data.avatarUrl}
              alt={data.fullName}
            />
          ) : (
            <div className={`profile-avatar ${toneOf(data.fullName)}`}>
              {initialsOf(data.fullName)}
            </div>
          )}
          <span className="online-dot" />
        </div>
        <div className="profile-intro">
          <div className="eyebrow">ملفك الشخصي</div>
          <h1>أهلاً يا {data.fullName.split(" ")[0]}</h1>
          <p>
            {data.city && (
              <>
                <MapPin size={15} /> {data.city} <span>•</span>
              </>
            )}{" "}
            عضو منذ {arNumber(data.memberSinceYear, 0)}
          </p>
        </div>
        <div className="profile-actions">
          <button
            className="button primary"
            onClick={() => setShowProfileForm(true)}
          >
            تعديل الملف
          </button>
        </div>
      </section>

      <section className="profile-content">
        <div className="profile-main">
          <div className="profile-stats">
            <div>
              <strong>{arNumber(data.walletBalance)}</strong>
              <span>رصيد الساعات</span>
            </div>
            <div>
              <strong>{arNumber(data.completedCount, 0)}</strong>
              <span>تبادل ناجح</span>
            </div>
            <div>
              <strong>{ratingLabel}</strong>
              <span>
                <Star size={13} fill="currentColor" /> التقييم
              </span>
            </div>
          </div>

          {actionError && <p className="auth-error">{actionError}</p>}

          <article className="profile-card requests-panel">
            <div className="card-heading">
              <div>
                <p className="eyebrow">إدارة التبادل</p>
                <h2>الطلبات</h2>
              </div>
              <Link href="/transactions" className="text-link">
                كشف الحساب <ArrowLeft size={15} />
              </Link>
            </div>
            <div className="request-tabs">
              <button
                className={requestTab === "incoming" ? "active" : ""}
                onClick={() => setRequestTab("incoming")}
              >
                طلبات واردة <b>{arNumber(data.incomingRequests.length, 0)}</b>
              </button>
              <button
                className={requestTab === "outgoing" ? "active" : ""}
                onClick={() => setRequestTab("outgoing")}
              >
                طلبات صادرة <b>{arNumber(data.outgoingRequests.length, 0)}</b>
              </button>
            </div>
            {visibleRequests.length === 0 && (
              <p className="empty-hint">
                {requestTab === "incoming"
                  ? "مفيش طلبات واردة دلوقتي."
                  : "مفيش طلبات صادرة دلوقتي. جرب تستكشف مهارات جديدة."}
              </p>
            )}
            {visibleRequests.map((r) => (
              <div className="request-card" key={r.id}>
                <Avatar
                  initials={initialsOf(r.otherName)}
                  tone={toneOf(r.otherName)}
                  avatarUrl={r.otherAvatarUrl}
                />
                <div className="request-copy">
                  <strong>{r.otherName}</strong>
                  <span>{r.skillTitle ?? "تبادل مهارات"}</span>
                  <small>{arDateTime(r.proposedDatetime)}</small>
                  <small>
                    {r.paymentMethod === "money"
                      ? `دفع بالجنيه · ${arNumber(r.amountEgp ?? 0)} جنيه`
                      : `تبادل بـ ${arNumber(r.hours)} ${r.hours === 1 ? "ساعة" : "ساعات"}`}
                  </small>
                  {r.message && <p>{r.message}</p>}
                </div>
                {requestTab === "incoming" ? (
                  <div className="request-actions">
                    <button
                      className="button small"
                      disabled={pending}
                      onClick={() => runAction(() => acceptBooking(r.id))}
                    >
                      قبول
                    </button>
                    <button
                      className="danger-outline"
                      disabled={pending}
                      onClick={() => runAction(() => rejectBooking(r.id))}
                    >
                      رفض
                    </button>
                  </div>
                ) : (
                  <button
                    className="danger-outline"
                    disabled={pending}
                    onClick={() => runAction(() => cancelBooking(r.id))}
                  >
                    إلغاء الطلب
                  </button>
                )}
              </div>
            ))}
          </article>

          {data.activeSession && (
            <article className="profile-card session-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">
                    {arDateTime(data.activeSession.proposedDatetime)}
                  </p>
                  <div className="session-title-row">
                    <Avatar
                      initials={initialsOf(data.activeSession.otherName)}
                      tone={toneOf(data.activeSession.otherName)}
                      avatarUrl={data.activeSession.otherAvatarUrl}
                    />
                    <h2>جلسة مع {data.activeSession.otherName}</h2>
                  </div>
                </div>
                <span className="status">مؤكدة</span>
              </div>
              {!data.activeSession.sessionId && (
                <button
                  type="button"
                  className="danger-outline"
                  style={{ alignSelf: "flex-start", marginBottom: 8 }}
                  disabled={pending}
                  onClick={() => {
                    if (!confirm("متأكد إنك عايز تنهي/تلغي الجلسة دي؟"))
                      return;
                    runAction(() =>
                      cancelAcceptedBooking(data.activeSession!.bookingId),
                    );
                  }}
                >
                  إنهاء الجلسة
                </button>
              )}
              <p>
                الجلسة مدتها {arNumber(data.activeSession.hours)}{" "}
                {data.activeSession.hours === 1 ? "ساعة" : "ساعات"}، وبتبدأ فقط
                بعد موافقة الطرفين.
              </p>
              {data.activeSession.paymentMethod === "money" && (
                <div className="session-payment-box">
                  <div>
                    <span>قيمة الجلسة</span>
                    <strong>
                      {arNumber(data.activeSession.amountEgp ?? 0)} جنيه
                    </strong>
                  </div>
                  <div>
                    <span>عمولة المنصة</span>
                    <strong>8%</strong>
                  </div>
                  <div>
                    <span>مستحق مقدم الخدمة</span>
                    <strong>
                      {arNumber(data.activeSession.providerEarningsEgp ?? 0)}{" "}
                      جنيه
                    </strong>
                  </div>
                </div>
              )}
              {data.activeSession.paymentMethod === "money" &&
                data.activeSession.isRequester &&
                data.activeSession.paymentStatus !== "paid" &&
                data.activeSession.paymentStatus !== "released" && (
                  <div className="session-payment-action">
                    <strong>الدفع مطلوب قبل دخول الجلسة</strong>
                    <p>
                      بعد تأكيد Paymob للدفع، الغرفة هتفتح تلقائيًا. المبلغ يفضل
                      Pending لمقدم الخدمة لحد نهاية الجلسة.
                    </p>
                    <input
                      value={paymentPhone}
                      onChange={(e) =>
                        setPaymentPhone(
                          e.target.value.replace(/[^0-9+]/g, "").slice(0, 13),
                        )
                      }
                      inputMode="tel"
                      placeholder="01xxxxxxxxx"
                      autoComplete="tel"
                      aria-label="رقم الموبايل للدفع"
                    />
                    <button
                      className="button primary"
                      disabled={pending || paymentLoading}
                      onClick={payForSession}
                    >
                      {paymentLoading ? (
                        <>
                          <LoaderCircle size={15} className="spin" /> جاري تجهيز
                          الدفع...
                        </>
                      ) : (
                        <>
                          دفع {arNumber(data.activeSession.amountEgp ?? 0)} جنيه{" "}
                          <ArrowLeft size={15} />
                        </>
                      )}
                    </button>
                  </div>
                )}
              {data.activeSession.paymentMethod === "money" &&
                !data.activeSession.isRequester &&
                data.activeSession.paymentStatus !== "paid" &&
                data.activeSession.paymentStatus !== "released" && (
                  <div className="session-payment-action">
                    <strong>الدفع لسه Pending</strong>
                    <p>
                      مستحقاتك هتفضل معلّقة لحد ما الدفع يتأكد، وبعد انتهاء
                      الجلسة تستحق لك 92% من قيمة العملية.
                    </p>
                  </div>
                )}
              {data.activeSession.paymentMethod === "money" &&
                (data.activeSession.paymentStatus === "paid" ||
                  data.activeSession.paymentStatus === "released") && (
                  <div className="session-paid-box">
                    <CheckCircle2 size={18} /> الدفع مؤكد — مستنيين موافقة
                    البداية من الطرفين.
                  </div>
                )}
              {!data.activeSession.sessionId &&
                !data.activeSession.startApproved && (
                  <button
                    className="button primary"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          const result = await approveSessionStart(
                            data.activeSession!.bookingId,
                          );
                          if (result.sessionId)
                            router.push(`/sessions/${result.sessionId}`);
                          else if (result.status === "insufficient_balance")
                            setActionError(
                              "الطرف اللي طلب الجلسة رصيد ساعاته مش كافي دلوقتي، لازم يشحن رصيده الأول عشان الغرفة تتفتح.",
                            );
                          else router.refresh();
                        } catch (e) {
                          setActionError(
                            e instanceof Error
                              ? e.message
                              : "حصلت مشكلة في بدء الجلسة.",
                          );
                        }
                      })
                    }
                  >
                    {pending ? (
                      <>
                        <LoaderCircle size={15} className="spin" /> جاري تسجيل
                        الموافقة...
                      </>
                    ) : (
                      "موافقة على بدء الجلسة"
                    )}
                  </button>
                )}
              {!data.activeSession.sessionId &&
                data.activeSession.startApproved && (
                  <div className="pending-confirm">
                    <CheckCircle2 size={25} />
                    <strong>موافقتك اتسجلت</strong>
                    <small>
                      {!data.activeSession.otherStartApproved
                        ? "مستنيين موافقة الطرف الآخر. أول ما يوافق هتتحوّل تلقائيًا لغرفة الجلسة."
                        : data.activeSession.insufficientBalance
                          ? "الطرفين وافقوا، بس رصيد ساعات صاحب الطلب مش كافي دلوقتي فمش قادر يفتح الغرفة. لازم يشحن رصيده الأول."
                          : "بيتم تجهيز الغرفة..."}
                    </small>
                    {data.activeSession.otherStartApproved && (
                      <button
                        type="button"
                        className="button small"
                        style={{ marginTop: 8 }}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            try {
                              const result = await approveSessionStart(
                                data.activeSession!.bookingId,
                              );
                              if (result.sessionId)
                                router.push(`/sessions/${result.sessionId}`);
                              else if (result.status === "insufficient_balance")
                                setActionError(
                                  "الطرف اللي طلب الجلسة رصيد ساعاته مش كافي دلوقتي، لازم يشحن رصيده الأول عشان الغرفة تتفتح.",
                                );
                              else router.refresh();
                            } catch (e) {
                              setActionError(
                                e instanceof Error
                                  ? e.message
                                  : "حصلت مشكلة في تحديث الحالة.",
                              );
                            }
                          })
                        }
                      >
                        {pending ? (
                          <>
                            <LoaderCircle size={15} className="spin" /> جاري
                            التحديث...
                          </>
                        ) : (
                          "تحديث الحالة"
                        )}
                      </button>
                    )}
                  </div>
                )}
              {data.activeSession.sessionId &&
                data.activeSession.sessionStatus === "active" && (
                  <div className="session-ready-box">
                    <strong>غرفة الجلسة جاهزة</strong>
                    <Link
                      href={`/sessions/${data.activeSession.sessionId}`}
                      className="button primary"
                    >
                      دخول الجلسة <ArrowLeft size={15} />
                    </Link>
                  </div>
                )}
              {!data.activeSession.myConfirmed &&
                !showIssueForm &&
                data.activeSession.sessionStatus === "completed" && (
                  <div className="session-actions">
                    <button
                      className="button primary"
                      disabled={pending}
                      onClick={() =>
                        runAction(() =>
                          confirmSessionDone(data.activeSession!.bookingId),
                        )
                      }
                    >
                      أيوه، اتمت
                    </button>
                    <button
                      className="danger-outline"
                      disabled={pending}
                      onClick={() => setShowIssueForm(true)}
                    >
                      لأ، فيه مشكلة
                    </button>
                  </div>
                )}
              {!data.activeSession.myConfirmed && showIssueForm && (
                <div className="issue-form">
                  <label>
                    اشرح لنا المشكلة
                    <textarea
                      placeholder="اكتب تفاصيل بسيطة عن اللي حصل..."
                      value={issueNote}
                      onChange={(e) => setIssueNote(e.target.value)}
                    />
                  </label>
                  <button
                    className="danger-outline"
                    disabled={pending}
                    onClick={() =>
                      runAction(() =>
                        confirmSessionIssue(
                          data.activeSession!.bookingId,
                          issueNote,
                        ),
                      )
                    }
                  >
                    إرسال للمراجعة
                  </button>
                </div>
              )}
              {data.activeSession.myConfirmed && (
                <div className="pending-confirm">
                  <CheckCircle2 size={25} />
                  <strong>بانتظار تأكيد الطرف الآخر</strong>
                  <small>
                    لو محدش رد خلال ٤٨ ساعة، هيتم تأكيد الجلسة تلقائيًا
                  </small>
                </div>
              )}
            </article>
          )}

          <article className="profile-card reviews-panel">
            <div className="card-heading">
              <div>
                <p className="eyebrow">بعد الجلسة</p>
                <h2>تقييماتك</h2>
              </div>
              <Star size={19} />
            </div>
            {data.reviewItems.length === 0 ? (
              <p className="empty-hint">
                لما تكمّل أول جلسة، هتقدر تقيّم الطرف التاني من هنا.
              </p>
            ) : (
              data.reviewItems.map((item) => (
                <div className="review-row" key={item.bookingId}>
                  <Avatar
                    initials={initialsOf(item.otherName)}
                    tone={toneOf(item.otherName)}
                    avatarUrl={item.otherAvatarUrl}
                  />
                  <div className="review-copy">
                    <strong>{item.otherName}</strong>
                    <small>{arDateTime(item.proposedDatetime)}</small>
                    {item.rating ? (
                      <span className="review-done">
                        <Star size={12} fill="currentColor" /> قيّمتَه بـ{" "}
                        {arNumber(item.rating, 0)}
                      </span>
                    ) : (
                      <div className="review-editor">
                        <div className="star-picker" dir="ltr">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              type="button"
                              key={n}
                              className={
                                n <= (reviewRatings[item.bookingId] ?? 0)
                                  ? "selected"
                                  : ""
                              }
                              onClick={() =>
                                setReviewRatings((v) => ({
                                  ...v,
                                  [item.bookingId]: n,
                                }))
                              }
                              aria-label={`تقييم ${n} نجوم`}
                            >
                              <Star size={18} fill="currentColor" />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={reviewComments[item.bookingId] ?? ""}
                          onChange={(e) =>
                            setReviewComments((v) => ({
                              ...v,
                              [item.bookingId]: e.target.value,
                            }))
                          }
                          maxLength={500}
                          placeholder="اكتب تعليق اختياري..."
                        />
                        <button
                          className="button small"
                          disabled={pending}
                          onClick={() => handleSubmitReview(item.bookingId)}
                        >
                          {pending ? (
                            <>
                              <LoaderCircle size={14} className="spin" /> جاري
                              الإرسال...
                            </>
                          ) : (
                            "إرسال التقييم"
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </article>

          {data.disputedCount > 0 && (
            <article className="profile-card">
              <div className="card-heading">
                <AlertTriangle size={18} />
                <h2 style={{ fontSize: 15 }}>
                  عندك {arNumber(data.disputedCount, 0)} جلسة قيد المراجعة بسبب
                  بلاغ. هنراجعها ونرد عليك قريب.
                </h2>
              </div>
            </article>
          )}

          <article className="profile-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">المهارات التي أشاركها</p>
                <h2>خبراتي وشغفي</h2>
              </div>
              <button
                className="icon-button"
                aria-label="إضافة مهارة"
                onClick={() => setShowSkillForm((v) => !v)}
              >
                +
              </button>
            </div>
            {showSkillForm && (
              <div className="issue-form" style={{ marginBottom: 16 }}>
                <label>
                  فئة المهارة
                  <select
                    value={skillCategory}
                    onChange={(e) => setSkillCategory(e.target.value)}
                  >
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  اسم المهارة
                  <input
                    value={skillTitle}
                    onChange={(e) => setSkillTitle(e.target.value)}
                    placeholder="مثلاً: دروس رياضيات"
                  />
                </label>
                <button
                  className="button primary"
                  disabled={pending}
                  onClick={handleAddSkill}
                >
                  إضافة المهارة
                </button>
              </div>
            )}
            {data.skills.length === 0 ? (
              <p className="empty-hint">
                لسه معملتش أي مهارة. ضيف أول مهارة بتاعتك دلوقتي.
              </p>
            ) : (
              <div className="skill-pills">
                {data.skills.map((s) => (
                  <span key={s.id}>
                    <Check size={14} />{" "}
                    {s.title || CATEGORY_LABELS[s.category] || s.category}
                    <button
                      aria-label={`حذف ${s.title}`}
                      disabled={pending}
                      onClick={() => runAction(() => deleteSkillOffered(s.id))}
                      style={{
                        border: 0,
                        background: "transparent",
                        padding: 0,
                        marginRight: 4,
                        display: "inline-flex",
                        cursor: "pointer",
                        color: "inherit",
                      }}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {data.bio && <p className="profile-bio">{data.bio}</p>}
          </article>
        </div>

        <aside className="profile-side">
          <article className="balance-panel">
            <div className="balance-icon">
              <Clock3 size={23} />
            </div>
            <p>رصيد الوقت</p>
            <strong>
              {arNumber(data.walletBalance)} <small>ساعات</small>
            </strong>
            <button
              className="button light full"
              onClick={() => setWalletOpen(true)}
            >
              فتح كشف الحساب <FileText size={15} />
            </button>
          </article>
          <article className="balance-panel money-balance-panel">
            <div className="balance-icon">
              <span style={{ fontWeight: 900, fontSize: 20 }}>ج</span>
            </div>
            <p>رصيدك المالي</p>
            <strong>
              {arNumber(data.walletMoneyBalance, 2)} <small>جنيه</small>
            </strong>
            <span
              style={{
                display: "block",
                marginTop: 6,
                fontSize: 12,
                color: "var(--muted-foreground)",
              }}
            >
              معلّق: {arNumber(data.walletPendingMoney, 2)} جنيه
            </span>
          </article>
          <article className="profile-card community-card">
            <Users size={20} />
            <h3>أنت جزء من شيء جميل</h3>
            <p>كل ساعة بتشاركها بتفتح باب جديد لحد تاني.</p>
          </article>
        </aside>
      </section>

      <footer className="profile-footer">
        <span>© ٢٠٢٦ ورّيني</span>
        <span>
          <MessageCircle size={13} /> مجتمعك، وقتك، حكايتك
        </span>
        <Link href="/">
          العودة للرئيسية <ArrowLeft size={14} />
        </Link>
      </footer>

      {walletOpen && (
        <WalletDrawer
          balance={data.walletBalance}
          ledger={data.recentTransactions}
          close={() => setWalletOpen(false)}
        />
      )}

      {showProfileForm && (
        <div
          className="profile-modal-backdrop"
          onClick={() => !pending && setShowProfileForm(false)}
        >
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <p className="eyebrow">تحديث بياناتك</p>
                <h2>تعديل البروفايل</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowProfileForm(false)}
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>
            <div className="issue-form profile-form">
              <div className="profile-avatar-editor">
                {profileAvatar ? (
                  <img
                    className="profile-avatar profile-avatar-image"
                    src={profileAvatar}
                    alt="صورة البروفايل"
                  />
                ) : (
                  <div className={`profile-avatar ${toneOf(profileName)}`}>
                    {initialsOf(profileName)}
                  </div>
                )}
                <label className="avatar-upload-label">
                  صورة البروفايل
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <label>
                الاسم بالكامل
                <input
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  maxLength={80}
                />
              </label>
              <label>
                المدينة
                <input
                  value={profileCity}
                  onChange={(e) => setProfileCity(e.target.value)}
                  maxLength={100}
                  placeholder="القاهرة، الجيزة..."
                />
              </label>
              <label>
                نبذة عنك
                <textarea
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  maxLength={500}
                  placeholder="قول للناس بتحب تتعلم أو تشارك إيه..."
                />
              </label>
              <div className="modal-actions">
                <button
                  className="button outline"
                  onClick={() => setShowProfileForm(false)}
                  disabled={pending}
                >
                  إلغاء
                </button>
                <button
                  className="button primary"
                  onClick={handleSaveProfile}
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <LoaderCircle size={15} className="spin" /> جاري الحفظ...
                    </>
                  ) : (
                    "حفظ التغييرات"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showPasswordForm && (
        <div
          className="profile-modal-backdrop"
          onClick={() => !pending && setShowPasswordForm(false)}
        >
          <div
            className="profile-modal settings-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-heading">
              <div>
                <p className="eyebrow">أمان الحساب</p>
                <h2>تغيير كلمة المرور</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setShowPasswordForm(false)}
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>
            <div className="profile-form">
              <label>
                كلمة المرور الجديدة
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              <label>
                تأكيد كلمة المرور
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={8}
                  autoComplete="new-password"
                />
              </label>
              {actionError && <p className="auth-error">{actionError}</p>}
              <div className="modal-actions">
                <button
                  className="button outline"
                  disabled={pending}
                  onClick={() => setShowPasswordForm(false)}
                >
                  إلغاء
                </button>
                <button
                  className="button primary"
                  disabled={pending}
                  onClick={handleChangePassword}
                >
                  {pending ? (
                    <>
                      <LoaderCircle size={15} className="spin" /> جاري الحفظ...
                    </>
                  ) : (
                    "حفظ كلمة المرور"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
