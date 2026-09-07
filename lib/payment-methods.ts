export type ManualMethodId = 'instapay' | 'vodafone_cash'

export type ManualPaymentMethod = {
  id: ManualMethodId
  name: string
  /** Shown on the plans page. Replace with your real Instapay handle / Vodafone Cash number. */
  handle: string
  instructions: string
}

// ⚠️ عدّل القيم هذه ببيانات الاستقبال الحقيقية بتاعتك قبل ما تنشر الموقع.
export const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = [
  {
    id: 'instapay',
    name: 'Instapay',
    handle: 'warreni-web1@instapay',
    instructions: 'حوّل المبلغ إلى حساب Instapay وأدخل رقم التحويل نفسه في الخانة أدناه.',
  },
  {
    id: 'vodafone_cash',
    name: 'فودافون كاش',
    handle: '01055891861',
    instructions: 'حوّل المبلغ إلى رقم محفظة فودافون كاش وأدخل رقم الهاتف المحمول الذي حوّلت منه.',
  },
]

export function getManualMethod(id: string) {
  return MANUAL_PAYMENT_METHODS.find((method) => method.id === id)
}
