import React from 'react'
import type { ReactNode } from 'react'

type RouteKey = 'board' | 'groups' | 'standings' | 'owner' | 'review'

type RouteFrameProps = {
  current: RouteKey
  kicker: string
  title: string
  description: string
  actions?: ReactNode
  children: ReactNode
}

const routeLinks: Array<{
  key: RouteKey
  href: string
  label: string
}> = [
  { key: 'board', href: '/', label: 'Board' },
  { key: 'groups', href: '/groups', label: 'Groups' },
  { key: 'standings', href: '/standings', label: 'Standings' },
  { key: 'owner', href: '/owner', label: 'Owner deck' },
  { key: 'review', href: '/review', label: 'Review desk' },
]

export function RouteFrame({
  current,
  kicker,
  title,
  description,
  actions,
  children,
}: RouteFrameProps) {
  return (
    <main className="route-page">
      <div className="app-shell route-shell">
        <nav className="board-nav-strip route-nav" aria-label="Route navigation">
          {routeLinks.map((entry) => (
            <a
              key={entry.key}
              className={`board-nav-link ${entry.key === current ? 'active' : ''}`}
              href={entry.href}
            >
              {entry.label}
            </a>
          ))}
        </nav>

        <section className="route-hero">
          <div className="route-copy">
            <div className="eyebrow">{kicker}</div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <div className="route-actions">{actions}</div>
        </section>

        <div className="route-body">{children}</div>
      </div>
    </main>
  )
}
