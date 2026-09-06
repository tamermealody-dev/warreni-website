export default function ExploreLoading() {
  return (
    <main dir="rtl" className="app-page">
      <div className="page-container">
        <div className="explore-heading">
          <div><p className="eyebrow">ورّيني</p><h1>استكشف المهارات</h1><p>جاري تحميل الأشخاص والمهارات...</p></div>
          <div className="big-search" aria-hidden="true" />
        </div>
        <div className="explore-layout">
          <aside className="explore-filters"><div className="explore-card-skeleton" style={{height: 260}} /></aside>
          <section className="explore-grid explore-loading-grid">
            {Array.from({ length: 6 }).map((_, i) => <div className="explore-card-skeleton" key={i}><div className="loading-spinner" /></div>)}
          </section>
        </div>
      </div>
    </main>
  )
}
