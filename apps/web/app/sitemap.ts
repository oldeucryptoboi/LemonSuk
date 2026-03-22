import type { MetadataRoute } from 'next'

import {
  fetchBoardGroupsServer,
  fetchDashboardServer,
} from '../src/lib/server-api'

const baseUrl = 'https://lemonsuk.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [dashboard, groups] = await Promise.all([
    fetchDashboardServer(),
    fetchBoardGroupsServer(),
  ])

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/groups`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/standings`,
      changeFrequency: 'daily',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/owner`,
      changeFrequency: 'weekly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms`,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/privacy`,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ]

  const groupEntries: MetadataRoute.Sitemap = groups.map((group) => ({
    url: `${baseUrl}/groups/${group.group.slug}`,
    lastModified: group.group.updatedAt ? new Date(group.group.updatedAt) : undefined,
    changeFrequency: 'daily',
    priority: 0.8,
  }))

  const marketEntries: MetadataRoute.Sitemap = dashboard.markets.map((market) => ({
    url: `${baseUrl}/markets/${market.slug}`,
    lastModified: market.updatedAt ? new Date(market.updatedAt) : undefined,
    changeFrequency: market.status === 'open' ? 'daily' : 'weekly',
    priority: market.status === 'open' ? 0.8 : 0.6,
  }))

  return [...staticEntries, ...groupEntries, ...marketEntries]
}
