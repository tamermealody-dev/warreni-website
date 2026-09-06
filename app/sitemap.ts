import type { MetadataRoute } from 'next'

const siteUrl = process.env.APP_URL || 'https://warreeni.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const routes: { path: string; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']; priority: number }[] = [
    { path: '/', changeFrequency: 'weekly', priority: 1 },
    { path: '/explore', changeFrequency: 'daily', priority: 0.9 },
    { path: '/plans', changeFrequency: 'monthly', priority: 0.7 },
    { path: '/help', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/community-rules', changeFrequency: 'monthly', priority: 0.4 },
    { path: '/contact', changeFrequency: 'monthly', priority: 0.4 },
    { path: '/login', changeFrequency: 'yearly', priority: 0.3 },
    { path: '/signup', changeFrequency: 'yearly', priority: 0.3 },
  ]

  return routes.map((route) => ({
    url: `${siteUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }))
}
