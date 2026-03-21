import { describe, expect, it } from 'vitest'

import robots from './robots'

describe('robots', () => {
  it('publishes crawler rules and the sitemap location', () => {
    const result = robots()

    expect(result.host).toBe('https://lemonsuk.com')
    expect(result.sitemap).toBe('https://lemonsuk.com/sitemap.xml')
    expect(result.rules).toEqual([
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/review', '/api/', '/?claim=', '/?owner_session='],
      },
    ])
  })
})
