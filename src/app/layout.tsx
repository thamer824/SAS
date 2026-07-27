import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { getLocale, LOCALE_META, translator } from '@/lib/i18n'
import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = translator(await getLocale())
  return {
    title: {
      default: `${t('app.name')} — ${t('app.tagline')}`,
      template: `%s · ${t('app.name')}`,
    },
    description: t('app.description'),
    applicationName: t('app.name'),
    manifest: '/manifest.webmanifest',
    icons: { icon: '/icon.svg' },
    robots: { index: true, follow: true },
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f8fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
  ],
  width: 'device-width',
  initialScale: 1,
}

/**
 * Resolve the theme before first paint.
 *
 * The cookie is read server-side so an explicit light/dark choice never
 * flashes. 'system' still needs a client decision, so a tiny blocking script
 * stamps the class from the media query — the standard trade to avoid FOUC
 * without shipping a provider.
 */
const THEME_BOOTSTRAP = `(function(){try{
var m=document.cookie.match(/(?:^|; )mq_theme=([^;]*)/);
var pref=m?decodeURIComponent(m[1]):'system';
var dark=pref==='dark'||(pref!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',dark);
}catch(e){}})();`

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  const meta = LOCALE_META[locale]
  const t = translator(locale)

  const jar = await cookies()
  const themePref = jar.get('mq_theme')?.value ?? 'system'
  // Server-side class for the two explicit choices; 'system' is left to the script.
  const serverDark = themePref === 'dark'

  return (
    <html lang={locale} dir={meta.dir} className={serverDark ? 'dark' : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50 focus:rounded-md focus:bg-[var(--surface-panel)] focus:px-3 focus:py-2 focus:text-sm focus:shadow-[var(--shadow-pop)]"
        >
          {t('nav.skipToContent')}
        </a>
        {children}
      </body>
    </html>
  )
}
