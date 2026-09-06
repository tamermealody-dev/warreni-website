export type ManualMethodId = 'instapay' | 'vodafone_cash'

export type ManualPaymentMethod = {
  id: ManualMethodId
  name: string
  /** Shown on the plans page. Replace with your real Instapay handle / Vodafone Cash number. */
  handle: string
  instructions: string
}

// ⚠️ عدّل القيم دي ببيانات الاستقبال الحقيقية بتاعتك قبل ما تنشر الموقع.
export const MANUAL_PAYMENT_METHODS: ManualPaymentMethod[] = [
  {
    id: 'instapay',
    name: 'Instapay',
    handle: 'warreeni@instapay', // TODO: استبدل بحساب Instapay الحقيقي
    instructions: 'حوّل المبلغ على حساب Instapay وابعت نفس رقم التحويل في الخانة تحت.',
  },
  {
    id: 'vodafone_cash',
    name: 'فودافون كاش',
    handle: '01000000000', // TODO: استبدل برقم محفظة فودافون كاش الحقيقي
    instructions: 'حوّل المبلغ على رقم محفظة فودافون كاش وابعت رقم الموبايل اللي حوّلت منه.',
  },
]

export function getManualMethod(id: string) {
  return MANUAL_PAYMENT_METHODS.find((method) => method.id === id)
}
