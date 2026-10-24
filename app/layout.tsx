import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google'
import { Providers } from '@/components/Providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Frim — Animate 3D characters in the browser',
  description: 'Import a GLB, pose the skeleton, and export a clip. Frim is a browser animation editor with a free plan. No install and no credit card.',
}

export const viewport = {
  themeColor: '#09090b',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable} ${jetbrains.variable}`}>
      <body className="font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[5000] focus:bg-frim-500 focus:text-dark-950 focus:px-3 focus:py-2 focus:rounded-lg">
          Skip to content
        </a>
        <Providers>
          {children}
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}

