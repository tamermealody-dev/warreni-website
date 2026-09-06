'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, LoaderCircle, Save } from 'lucide-react'
import { savePayoutAccount } from '@/app/payout/actions'

type PayoutData = {
  method: 'bank' | 'mobile_wallet'
  account_holder_name: string
  bank_name: string | null
  iban: string | null
  account_number: string | null
  wallet_provider: string | null
  wallet_phone: string | null
} | null

export default function PayoutForm({ payout }: { payout: PayoutData }) {
  const [method, setMethod] = useState<'bank' | 'mobile_wallet'>(payout?.method ?? 'bank')
  const [holder, setHolder] = useState(payout?.account_holder_name ?? '')
  const [bankName, setBankName] = useState(payout?.bank_name ?? '')
  const [iban, setIban] = useState(payout?.iban ?? '')
  const [accountNumber, setAccountNumber] = useState(payout?.account_number ?? '')
  const [walletProvider, setWalletProvider] = useState(payout?.wallet_provider ?? '')
  const [walletPhone, setWalletPhone] = useState(payout?.wallet_phone ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    setError(null)
    startTransition(async () => {
      try {
        await savePayoutAccount({ method, accountHolderName: holder, bankName, iban, accountNumber, walletProvider, walletPhone })
        setMessage('تم حفظ بيانات السحب بنجاح.')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حصلت مشكلة، حاول تاني.')
      }
    })
  }

  return (
    <form className="payout-form" onSubmit={submit}>
      <div className="payout-methods">
        <button type="button" className={method === 'bank' ? 'active' : ''} onClick={() => setMethod('bank')}>
          <span>حساب بنكي</span><small>IBAN + اسم البنك</small>
        </button>
        <button type="button" className={method === 'mobile_wallet' ? 'active' : ''} onClick={() => setMethod('mobile_wallet')}>
          <span>محفظة إلكترونية</span><small>رقم الموبايل</small>
        </button>
      </div>

      <label><span>اسم صاحب الحساب</span><input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={120} placeholder="الاسم كما هو في وسيلة الاستلام" autoComplete="name" /></label>

      {method === 'bank' ? (
        <>
          <label><span>اسم البنك</span><input value={bankName} onChange={(e) => setBankName(e.target.value)} maxLength={100} placeholder="مثال: بنك ..." autoComplete="organization" /></label>
          <label><span>IBAN</span><input value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} maxLength={29} placeholder="EG..." inputMode="text" autoComplete="off" /></label>
          <label><span>رقم الحساب <small>(اختياري)</small></span><input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} maxLength={60} placeholder="رقم الحساب" inputMode="numeric" autoComplete="off" /></label>
        </>
      ) : (
        <>
          <label><span>اسم المحفظة</span><input value={walletProvider} onChange={(e) => setWalletProvider(e.target.value)} maxLength={60} placeholder="Vodafone Cash / ..." /></label>
          <label><span>رقم المحفظة</span><input value={walletPhone} onChange={(e) => setWalletPhone(e.target.value)} maxLength={11} placeholder="01xxxxxxxxx" inputMode="tel" autoComplete="tel" /></label>
        </>
      )}

      {message && <p className="payout-status success"><CheckCircle2 size={16} /> {message}</p>}
      {error && <p className="payout-status error">{error}</p>}

      <button className="button primary full" disabled={pending} type="submit">
        {pending ? <><LoaderCircle size={16} className="spin" /> جاري الحفظ...</> : <><Save size={16} /> حفظ بيانات السحب</>}
      </button>
    </form>
  )
}
