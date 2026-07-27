import type { MetadataRoute } from 'next'
import { config } from '@/lib/config'

/**
 * Only the three public routes. Everything under /app is behind auth, so
 * listing it would just advertise redirects to /signin.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return [
    { url: `${config.appUrl}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${config.appUrl}/signup`, lastModified: now, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${config.appUrl}/signin`, lastModified: now, changeFrequency: 'monthly', priority: 0.4 },
  ]
}
