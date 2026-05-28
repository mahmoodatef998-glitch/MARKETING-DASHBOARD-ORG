import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Script from 'next/script'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Agency OS',
  description: 'All-in-one agency management platform',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Agency OS',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#6366f1" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={`${inter.className} bg-slate-950 text-slate-100 antialiased`}>
        {children}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {});
          }
        `}</Script>
      </body>
    </html>
  )
}
