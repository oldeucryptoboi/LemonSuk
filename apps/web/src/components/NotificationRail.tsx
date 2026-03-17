import React from 'react'
import type { Notification } from '../shared'

type NotificationRailProps = {
  notifications: Notification[]
}

export function NotificationRail({ notifications }: NotificationRailProps) {
  return (
    <section className="notification-panel">
      <div className="panel-header compact">
        <div>
          <div className="eyebrow">Settlement feed</div>
          <h2>Notifications</h2>
        </div>
      </div>
      {notifications.length === 0 ? (
        <p className="empty-copy">No settlements yet.</p>
      ) : (
        notifications.slice(0, 6).map((notification) => (
          <article
            key={notification.id}
            className={`notification-card ${notification.type}`}
          >
            <strong>{notification.title}</strong>
            <p>{notification.body}</p>
          </article>
        ))
      )}
    </section>
  )
}
