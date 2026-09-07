export type HourPlan = {
  id: 'starter' | 'plus' | 'pro'
  name: string
  hours: number
  price: number
  oldPrice?: number
  badge?: string
  description: string
  features: string[]
}

export const HOUR_PLANS: HourPlan[] = [
  {
    id: 'starter',
    name: 'البداية',
    hours: 2,
    price: 19,
    description: 'جرّب الشحن واحصل على أول ساعتين لك.',
    features: ['2 ساعة تضاف فور تأكيد الدفع', 'صالحة للاستخدام في كل الجلسات', 'من دون اشتراك شهري'],
  },
  {
    id: 'plus',
    name: 'المتوسط',
    hours: 5,
    price: 45,
    description: 'رصيد مناسب إذا كنت تستخدم علّمني بشكل منتظم.',
    features: ['5 ساعات كاملة', 'سعر أفضل لكل ساعة', 'من دون اشتراك شهري'],
  },
  {
    id: 'pro',
    name: 'الأكثر مبيعًا',
    hours: 10,
    price: 79,
    oldPrice: 95,
    badge: 'الأكثر مبيعًا · عرض',
    description: 'أكبر قيمة مقابل وقتك، مع خصم واضح على الباقة.',
    features: ['10 ساعات كاملة', 'خصم 16 جنيه', 'من دون اشتراك شهري'],
  },
]

export function getPlan(id: string) {
  return HOUR_PLANS.find((plan) => plan.id === id)
}
