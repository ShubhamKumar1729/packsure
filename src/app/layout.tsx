import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'PackSure — Packaged Commodity Compliance',
  description: 'AI-powered packaged commodity compliance for inspection teams.',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  )
}
