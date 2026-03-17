import type { SourceType } from '../shared'
import { domainFromUrl } from './utils'

export function inferSourceType(url: string): SourceType {
  const domain = domainFromUrl(url)

  if (domain.includes('x.com') || domain.includes('twitter.com')) {
    return 'x'
  }

  if (domain.includes('tesla.com') || domain.includes('spacex.com')) {
    return 'official'
  }

  if (domain.includes('motherfrunker.ca')) {
    return 'reference'
  }

  if (
    [
      'reuters.com',
      'apnews.com',
      'techcrunch.com',
      'electrek.co',
      'theverge.com',
      'cnbc.com',
    ].some((known) => domain.includes(known))
  ) {
    return 'news'
  }

  return 'blog'
}
