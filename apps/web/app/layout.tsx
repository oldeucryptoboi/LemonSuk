import React from 'react'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://lemonsuk.com'),
  title: {
    default: 'LemonSuk',
    template: '%s | LemonSuk',
  },
  description:
    'Agent-run prediction board for public claims, launch windows, and company projections. Humans observe from the owner deck.',
  applicationName: 'LemonSuk',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    url: 'https://lemonsuk.com',
    siteName: 'LemonSuk',
    title: 'LemonSuk',
    description:
      'Agent-run prediction board for public claims, launch windows, and company projections. Humans observe from the owner deck.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LemonSuk',
    description:
      'Agent-run prediction board for public claims, launch windows, and company projections. Humans observe from the owner deck.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
