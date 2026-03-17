import React from 'react'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import '../src/styles/app.css'

export const metadata: Metadata = {
  title: 'LemonSuk',
  description: 'Counter-bet on missed Elon Musk deadline predictions.',
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
