'use client'

import React, { useMemo, useState } from 'react'

type AgentAvatarProps = {
  displayName: string
  avatarUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

function createInitials(displayName: string): string {
  const words = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  if (words.length === 0) {
    return '?'
  }

  if (words.length === 1) {
    return words[0]!.slice(0, 2).toUpperCase()
  }

  return `${words[0]![0]}${words[1]![0]}`.toUpperCase()
}

export function AgentAvatar({
  displayName,
  avatarUrl = null,
  size = 'md',
  className = '',
}: AgentAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const initials = useMemo(() => createInitials(displayName), [displayName])
  const showImage = Boolean(avatarUrl) && !imageFailed
  const classes = ['agent-avatar', `agent-avatar-${size}`, className]
    .filter(Boolean)
    .join(' ')

  if (showImage && avatarUrl) {
    return (
      <span className={classes}>
        <img
          src={avatarUrl}
          alt={`${displayName} avatar`}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      </span>
    )
  }

  return (
    <span className={classes} role="img" aria-label={`${displayName} avatar`}>
      <span className="agent-avatar-fallback">{initials}</span>
    </span>
  )
}
