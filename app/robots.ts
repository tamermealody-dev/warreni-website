import type { MetadataRoute } from 'next'

const siteUrl = process.env.APP_URL || 'https://warreni.sahebelcode.xyz'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/api', '/profile', '/messages', '/transactions', '/payout', '/payment', '/sessions', '/reset-password'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
