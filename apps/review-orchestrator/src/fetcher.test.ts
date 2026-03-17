import { describe, expect, it } from 'vitest'

describe('fetchReviewSnapshot', () => {
  it('blocks unsafe hosts and protocols before fetching', async () => {
    const { fetchReviewSnapshot } = await import('./fetcher')

    await expect(
      fetchReviewSnapshot('file:///etc/passwd'),
    ).rejects.toThrow('Only http and https review URLs are allowed.')

    await expect(
      fetchReviewSnapshot('http://127.0.0.1/private'),
    ).rejects.toThrow('That review URL points to a blocked host.')

    await expect(
      fetchReviewSnapshot('http://10.0.0.4/private'),
    ).rejects.toThrow('That review URL points to a blocked host.')

    await expect(
      fetchReviewSnapshot('http://192.168.0.4/private'),
    ).rejects.toThrow('That review URL points to a blocked host.')

    await expect(
      fetchReviewSnapshot('http://172.16.1.3/private'),
    ).rejects.toThrow('That review URL points to a blocked host.')
  })

  it('normalizes html and plain-text responses and rejects invalid content', async () => {
    const { fetchReviewSnapshot } = await import('./fetcher')

    const htmlSnapshot = await fetchReviewSnapshot(
      'https://example.com/post',
      async () =>
        new Response('<html><body><h1>Headline</h1><p>Launch in 2027.</p></body></html>', {
          status: 200,
          headers: {
            'content-type': 'text/html',
          },
        }),
    )

    expect(htmlSnapshot).toEqual({
      finalUrl: 'https://example.com/post',
      contentType: 'text/html',
      snapshotText: 'Headline Launch in 2027.',
      snapshotRef: null,
    })

    const plainSnapshot = await fetchReviewSnapshot(
      'https://example.com/plain',
      async () =>
        new Response('  deadline   slips   into 2028 ', {
          status: 200,
          headers: {
            'content-type': 'text/plain',
          },
        }),
    )

    expect(plainSnapshot.snapshotText).toBe('deadline slips into 2028')

    const headerlessSnapshot = await fetchReviewSnapshot(
      'https://example.com/headerless',
      async () => new Response('  plain body without a content type  ', { status: 200 }),
    )

    expect(headerlessSnapshot).toEqual({
      finalUrl: 'https://example.com/headerless',
      contentType: 'text/plain;charset=UTF-8',
      snapshotText: 'plain body without a content type',
      snapshotRef: null,
    })

    const nullHeaderSnapshot = await fetchReviewSnapshot(
      'https://example.com/null-header',
      async () =>
        ({
          ok: true,
          url: '',
          headers: {
            get: () => null,
          },
          text: async () => 'plain body from a null header response',
        }) as Response,
    )

    expect(nullHeaderSnapshot).toEqual({
      finalUrl: 'https://example.com/null-header',
      contentType: 'text/plain',
      snapshotText: 'plain body from a null header response',
      snapshotRef: null,
    })

    await expect(
      fetchReviewSnapshot(
        'https://example.com/image',
        async () =>
          new Response('not supported', {
            status: 200,
            headers: {
              'content-type': 'image/png',
            },
          }),
      ),
    ).rejects.toThrow('Unsupported review content type.')

    await expect(
      fetchReviewSnapshot(
        'https://example.com/fail',
        async () =>
          new Response('nope', {
            status: 502,
            headers: {
              'content-type': 'text/plain',
            },
          }),
      ),
    ).rejects.toThrow('Review fetch failed with status 502.')

    await expect(
      fetchReviewSnapshot(
        'https://example.com/big',
        async () =>
          new Response('x'.repeat(300_000), {
            status: 200,
            headers: {
              'content-type': 'application/xhtml+xml',
            },
          }),
      ),
    ).rejects.toThrow('Review snapshot exceeds the maximum allowed size.')
  })
})
