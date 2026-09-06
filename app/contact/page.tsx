import InfoPage from '@/components/info-page'
import ContactForm from '@/components/contact-form'

export default function Page() {
  return (
    <InfoPage
      eyebrow='الدعم'
      title='تواصل معنا'
      intro='عندك مشكلة أو اقتراح؟ اكتب التفاصيل من هنا، ورسالتك هتوصل مباشرة إلى فريق ورّيني على البريد الإلكتروني.'
      sections={[
        { title: 'اكتب مشكلتك بالتفصيل', body: 'اذكر ما حدث، والصفحة التي ظهرت فيها المشكلة، وأي رسالة خطأ ظهرت لك.' },
        { title: 'مشاكل المدفوعات', body: 'اذكر رقم العملية أو وقت الدفع إذا كان متاحًا، من غير إرسال بيانات البطاقة الكاملة أو رمز الأمان.' },
        { title: 'اقتراحات وتحسينات', body: 'اكتب فكرتك أو اقتراحك وسنراجعه ضمن تطوير ورّيني.' },
      ]}
    >
      <div className="contact-panel">
        <ContactForm />
      </div>
    </InfoPage>
  )
}
