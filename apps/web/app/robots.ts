import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/review', '/api/', '/?claim=', '/?owner_session='],
      },
    ],
    sitemap: 'https://lemonsuk.com/sitemap.xml',
    host: 'https://lemonsuk.com',
  }
}
