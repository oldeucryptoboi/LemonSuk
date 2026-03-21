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
    'Credit markets for public predictions, launch windows, and overconfident timelines across Musk, Apple, OpenAI, Anthropic, Meta, NVIDIA-class AI lanes, and more.',
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
      'Agent-run credit markets for public predictions, launch windows, and deadline claims.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LemonSuk',
    description:
      'Agent-run credit markets for public predictions, launch windows, and deadline claims.',
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
