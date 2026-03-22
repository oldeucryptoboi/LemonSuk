import { afterEach, describe, expect, it, vi } from 'vitest'

const s3Mocks = vi.hoisted(() => ({
  send: vi.fn(async (_command: unknown) => undefined),
  lookup: vi.fn(async () => [{ address: '93.184.216.34' }]),
}))

vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand {
    input: unknown

    constructor(input: unknown) {
      this.input = input
    }
  }

  class DeleteObjectCommand {
    input: unknown

    constructor(input: unknown) {
      this.input = input
    }
  }

  class S3Client {
    send = s3Mocks.send
  }

  return {
    DeleteObjectCommand,
    PutObjectCommand,
    S3Client,
  }
})

vi.mock('node:dns/promises', () => ({
  lookup: s3Mocks.lookup,
}))

function createPngBuffer(): ArrayBuffer {
  const buffer = new ArrayBuffer(8)
  const view = new Uint8Array(buffer)
  view.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return buffer
}

function createUnknownBuffer(length: number = 4): ArrayBuffer {
  const buffer = new ArrayBuffer(length)
  const view = new Uint8Array(buffer)
  view.set(Array.from({ length }, (_value, index) => (index + 1) % 255))
  return buffer
}

function createJpegBuffer(): ArrayBuffer {
  const buffer = new ArrayBuffer(3)
  const view = new Uint8Array(buffer)
  view.set([0xff, 0xd8, 0xff])
  return buffer
}

function createWebpBuffer(): ArrayBuffer {
  const buffer = new ArrayBuffer(12)
  const view = new Uint8Array(buffer)
  view.set([
    0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ])
  return buffer
}

function createGifBuffer(signature: 'GIF87a' | 'GIF89a' = 'GIF89a'): ArrayBuffer {
  const buffer = new ArrayBuffer(6)
  const view = new Uint8Array(buffer)
  view.set(Buffer.from(signature, 'ascii'))
  return buffer
}

describe('avatar storage', () => {
  const originalEnv = { ...process.env }
  const originalFetch = global.fetch

  afterEach(() => {
    process.env = { ...originalEnv }
    global.fetch = originalFetch
    s3Mocks.send.mockReset()
    s3Mocks.lookup.mockReset()
    s3Mocks.lookup.mockResolvedValue([{ address: '93.184.216.34' }])
    vi.resetModules()
  })

  it('uploads supported remote avatars into S3 and returns the CloudFront URL', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createPngBuffer()], { type: 'image/png' }), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(createPngBuffer().byteLength),
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')
    const result = await ingestAgentAvatarFromUrl(
      'https://images.example.com/phil.png',
      'phil_assistant',
    )

    expect(result).toMatch(
      /^https:\/\/cdn\.lemonsuk\.example\/agent-avatars\/phil_assistant\/[a-f0-9]+\.png$/,
    )
    expect(s3Mocks.send).toHaveBeenCalledTimes(1)
    const firstCommand = s3Mocks.send.mock.calls.at(0)?.[0]
    if (!firstCommand) {
      throw new Error('Expected S3 put command call.')
    }
    expect((firstCommand as { input: Record<string, unknown> }).input).toMatchObject({
      Bucket: 'lemonsuk-avatar-bucket',
      ContentType: 'image/png',
    })
  })

  it('detects jpeg, webp, and gif avatars from the uploaded bytes', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    const avatarCases = [
      { buffer: createJpegBuffer(), expectedType: 'image/jpeg', extension: 'jpg' },
      { buffer: createWebpBuffer(), expectedType: 'image/webp', extension: 'webp' },
      { buffer: createGifBuffer(), expectedType: 'image/gif', extension: 'gif' },
    ] as const

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    for (const avatarCase of avatarCases) {
      s3Mocks.send.mockReset()
      global.fetch = vi.fn(async () =>
        new Response(new Blob([avatarCase.buffer], { type: 'application/octet-stream' }), {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': String(avatarCase.buffer.byteLength),
          },
        }),
      ) as typeof fetch

      await expect(
        ingestAgentAvatarFromUrl('https://images.example.com/phil-avatar', 'phil_assistant'),
      ).resolves.toMatch(
        new RegExp(
          `^https://cdn\\.lemonsuk\\.example/agent-avatars/phil_assistant/[a-f0-9]+\\.${avatarCase.extension}$`,
        ),
      )

      const putCommand = s3Mocks.send.mock.calls.at(0)?.[0]
      if (!putCommand) {
        throw new Error('Expected S3 put command call.')
      }
      expect((putCommand as { input: Record<string, unknown> }).input).toMatchObject({
        Bucket: 'lemonsuk-avatar-bucket',
        ContentType: avatarCase.expectedType,
      })
    }
  })

  it('returns managed CloudFront urls unchanged', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')
    const result = await ingestAgentAvatarFromUrl(
      'https://cdn.lemonsuk.example/agent-avatars/phil_assistant/current.png',
      'phil_assistant',
    )

    expect(result).toBe(
      'https://cdn.lemonsuk.example/agent-avatars/phil_assistant/current.png',
    )
    expect(global.fetch).toBe(originalFetch)
    expect(s3Mocks.send).not.toHaveBeenCalled()
  })

  it('returns false for missing or malformed managed avatar urls', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    const { isManagedAvatarUrl } = await import('./avatar-storage')

    expect(isManagedAvatarUrl(null)).toBe(false)
    expect(isManagedAvatarUrl(undefined)).toBe(false)
    expect(isManagedAvatarUrl('not-a-valid-url')).toBe(false)
  })

  it('returns false for managed-url checks when the CloudFront base path is unset or mismatched', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    delete process.env.AVATAR_CLOUDFRONT_BASE_URL

    const { isManagedAvatarUrl: isManagedWithoutBase } = await import('./avatar-storage')
    expect(
      isManagedWithoutBase(
        'https://cdn.lemonsuk.example/agent-avatars/phil_assistant/current.png',
      ),
    ).toBe(false)

    vi.resetModules()
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example/assets'

    const { isManagedAvatarUrl } = await import('./avatar-storage')
    expect(
      isManagedAvatarUrl(
        'https://cdn.lemonsuk.example/agent-avatars/phil_assistant/current.png',
      ),
    ).toBe(false)
    expect(
      isManagedAvatarUrl(
        'https://cdn.lemonsuk.example/assets/agent-avatars/phil_assistant/current.png',
      ),
    ).toBe(true)
    expect(isManagedAvatarUrl('https://cdn.lemonsuk.example/assets')).toBe(false)
    expect(isManagedAvatarUrl('https://cdn.lemonsuk.example/assets/')).toBe(false)
  })

  it('rejects avatar uploads when storage is not configured', async () => {
    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar storage is not configured right now.')
  })

  it('rejects invalid avatar urls before any network call', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(ingestAgentAvatarFromUrl('not-a-url', 'phil_assistant')).rejects.toThrow(
      'Avatar URL is invalid.',
    )
    expect(global.fetch).toBe(originalFetch)
  })

  it('rejects avatar urls that do not use http or https', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('file:///tmp/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must use HTTP or HTTPS.')
    expect(global.fetch).toBe(originalFetch)
  })

  it('rejects private or local avatar hosts', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'
    s3Mocks.lookup.mockResolvedValue([{ address: '127.0.0.1' }])

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://internal.example.com/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')
  })

  it('rejects localhost avatar hosts immediately', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://localhost/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')
    expect(s3Mocks.lookup).not.toHaveBeenCalled()
  })

  it('rejects literal private IP avatar hosts and accepts literal public IP hosts', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createPngBuffer()], { type: 'image/png' }), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://127.0.0.1/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')

    await expect(
      ingestAgentAvatarFromUrl('https://100.64.0.1/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')

    await expect(
      ingestAgentAvatarFromUrl('https://172.16.0.1/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')

    await expect(
      ingestAgentAvatarFromUrl('https://169.254.1.1/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')

    await expect(
      ingestAgentAvatarFromUrl('https://192.168.1.1/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')

    await expect(
      ingestAgentAvatarFromUrl('https://93.184.216.34/phil.png', 'phil_assistant'),
    ).resolves.toMatch(
      /^https:\/\/cdn\.lemonsuk\.example\/agent-avatars\/phil_assistant\/[a-f0-9]+\.png$/,
    )
  })

  it('rejects literal private IPv6 avatar hosts and accepts literal public IPv6 hosts', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createPngBuffer()], { type: 'image/png' }), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://[fd00::1]/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')

    await expect(
      ingestAgentAvatarFromUrl(
        'https://[2606:2800:220:1:248:1893:25c8:1946]/phil.png',
        'phil_assistant',
      ),
    ).resolves.toMatch(
      /^https:\/\/cdn\.lemonsuk\.example\/agent-avatars\/phil_assistant\/[a-f0-9]+\.png$/,
    )
  })

  it('rejects the IPv6 loopback avatar host', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://[::1]/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')
  })

  it('rejects ipv4-mapped ipv6 loopback avatar hosts', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://[::ffff:127.0.0.1]/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar URL must not point to a private or local network host.')
  })

  it('treats non-ip dns answers as non-private and continues with avatar ingestion', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'
    s3Mocks.lookup.mockResolvedValue([{ address: 'not-an-ip-address' }])

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createPngBuffer()], { type: 'image/png' }), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/phil.png', 'phil_assistant'),
    ).resolves.toMatch(
      /^https:\/\/cdn\.lemonsuk\.example\/agent-avatars\/phil_assistant\/[a-f0-9]+\.png$/,
    )
  })

  it('treats dotted ipv4-mapped ipv6 dns answers as their mapped public ipv4', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'
    s3Mocks.lookup.mockResolvedValue([{ address: '::ffff:93.184.216.34' }])

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createPngBuffer()], { type: 'image/png' }), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/phil-mapped.png', 'phil_assistant'),
    ).resolves.toMatch(
      /^https:\/\/cdn\.lemonsuk\.example\/agent-avatars\/phil_assistant\/[a-f0-9]+\.png$/,
    )
  })

  it('treats malformed ipv4-mapped ipv6 dns answers as non-private', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'
    s3Mocks.lookup.mockResolvedValue([{ address: '::ffff:not-an-ip' }])

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createPngBuffer()], { type: 'image/png' }), {
        status: 200,
        headers: {
          'content-type': 'image/png',
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/phil-malformed.png', 'phil_assistant'),
    ).resolves.toMatch(
      /^https:\/\/cdn\.lemonsuk\.example\/agent-avatars\/phil_assistant\/[a-f0-9]+\.png$/,
    )
  })

  it('rejects avatar hosts that fail DNS resolution', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'
    s3Mocks.lookup.mockRejectedValue(new Error('dns failed'))

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://unresolved.example.com/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar host could not be resolved.')
  })

  it('maps fetch failures when the remote avatar request throws', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () => {
      throw new Error('socket hang up')
    }) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/unreachable.png', 'phil_assistant'),
    ).rejects.toThrow('Could not fetch that avatar image.')
  })

  it('rejects non-success avatar responses from the remote host', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response('not found', {
        status: 404,
        headers: {
          'content-type': 'text/plain',
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/missing.png', 'phil_assistant'),
    ).rejects.toThrow('Could not fetch that avatar image.')
  })

  it('rejects unsupported avatar payloads', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response(new Blob(['not-an-image'], { type: 'text/plain' }), {
        status: 200,
        headers: {
          'content-type': 'text/plain',
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/phil.txt', 'phil_assistant'),
    ).rejects.toThrow('Avatar image must be PNG, JPEG, WEBP, or GIF.')
  })

  it('rejects unsupported avatar payloads with no declared content type', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createUnknownBuffer()], { type: '' }), {
        status: 200,
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/phil.bin', 'phil_assistant'),
    ).rejects.toThrow('Avatar image must be PNG, JPEG, WEBP, or GIF.')
  })

  it('rejects empty avatar payloads', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response(new Blob([], { type: 'image/png' }), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': '0',
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/empty.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar image was empty.')
  })

  it('rejects oversized avatar payloads', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createPngBuffer()], { type: 'image/png' }), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(5 * 1024 * 1024 + 1),
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar image must be 5 MB or smaller.')
  })

  it('rejects oversized avatar payloads after download when no content-length header is present', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response(
        new Blob([createPngBuffer(), createUnknownBuffer(5 * 1024 * 1024)], {
          type: 'image/png',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'image/png',
          },
        },
      ),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar image must be 5 MB or smaller.')
  })

  it('falls back to the declared image content type when signature detection is unavailable', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createUnknownBuffer()], { type: 'image/jpeg' }), {
        status: 200,
        headers: {
          'content-type': 'image/jpeg',
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')
    const result = await ingestAgentAvatarFromUrl(
      'https://images.example.com/phil-header-only.jpg',
      'phil_assistant',
    )

    expect(result).toMatch(
      /^https:\/\/cdn\.lemonsuk\.example\/agent-avatars\/phil_assistant\/[a-f0-9]+\.jpg$/,
    )
    const firstCommand = s3Mocks.send.mock.calls.at(0)?.[0]
    if (!firstCommand) {
      throw new Error('Expected S3 put command call.')
    }
    expect((firstCommand as { input: Record<string, unknown> }).input).toMatchObject({
      ContentType: 'image/jpeg',
    })
  })

  it('deletes managed avatar urls through S3 and ignores foreign urls', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'

    const { deleteManagedAvatarUrl } = await import('./avatar-storage')

    await deleteManagedAvatarUrl(
      'https://cdn.lemonsuk.example/agent-avatars/phil_assistant/current.png',
    )
    await deleteManagedAvatarUrl('https://example.com/phil.png')

    expect(s3Mocks.send).toHaveBeenCalledTimes(1)
    const firstCommand = s3Mocks.send.mock.calls.at(0)?.[0]
    if (!firstCommand) {
      throw new Error('Expected S3 delete command call.')
    }
    expect((firstCommand as { input: Record<string, unknown> }).input).toMatchObject({
      Bucket: 'lemonsuk-avatar-bucket',
      Key: 'agent-avatars/phil_assistant/current.png',
    })
  })

  it('stores avatar objects without a prefix when the prefix env is blank', async () => {
    process.env.AVATAR_S3_BUCKET = 'lemonsuk-avatar-bucket'
    process.env.AVATAR_S3_REGION = 'us-east-1'
    process.env.AVATAR_CLOUDFRONT_BASE_URL = 'https://cdn.lemonsuk.example'
    process.env.AVATAR_S3_PREFIX = ''

    global.fetch = vi.fn(async () =>
      new Response(new Blob([createPngBuffer()], { type: 'image/png' }), {
        status: 200,
        headers: {
          'content-type': 'image/png',
          'content-length': String(createPngBuffer().byteLength),
        },
      }),
    ) as typeof fetch

    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    const result = await ingestAgentAvatarFromUrl(
      'https://images.example.com/phil.png',
      'phil_assistant',
    )

    expect(result).toMatch(/^https:\/\/cdn\.lemonsuk\.example\/phil_assistant\/[a-f0-9]+\.png$/)
    const putCommand = s3Mocks.send.mock.calls.at(0)?.[0]
    if (!putCommand) {
      throw new Error('Expected S3 put command call.')
    }
    expect((putCommand as { input: Record<string, unknown> }).input).toMatchObject({
      Bucket: 'lemonsuk-avatar-bucket',
      Key: expect.stringMatching(/^phil_assistant\/[a-f0-9]+\.png$/),
    })
  })
})
