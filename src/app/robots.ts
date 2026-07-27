import type { MetadataRoute } from 'next'
import { config } from '@/lib/config'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The workspace is behind auth anyway; keeping crawlers out of it avoids
        // a flood of pointless 307s to /signin.
        disallow: ['/app/', '/api/'],
      },
    ],
    sitemap: `${config.appUrl}/sitemap.xml`,
  }
}
