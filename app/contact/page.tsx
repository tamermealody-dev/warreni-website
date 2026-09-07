import InfoPage from '@/components/info-page'
import ContactForm from '@/components/contact-form'

export default function Page() {
  return (
    <InfoPage
      eyebrow='الدعم'
      title='تواصل معنا'
      intro='هل لديك مشكلة أو اقتراح؟ اكتب التفاصيل هنا، وستصل رسالتك مباشرة إلى فريق علّمني على البريد الإلكتروني.'
      sections={[
        { title: 'اكتب مشكلتك بالتفصيل', body: 'اذكر ما حدث، والصفحة التي ظهرت فيها المشكلة، وأي رسالة خطأ ظهرت لك.' },
        { title: 'مشاكل المدفوعات', body: 'اذكر رقم العملية أو وقت الدفع إذا كان متاحًا، دون إرسال بيانات البطاقة الكاملة أو رمز الأمان.' },
        { title: 'اقتراحات وتحسينات', body: 'اكتب فكرتك أو اقتراحك وسنراجعه ضمن تطوير علّمني.' },
      ]}
    >
      <div className="contact-panel">
        <ContactForm />
      </div>
    </InfoPage>
  )
}
