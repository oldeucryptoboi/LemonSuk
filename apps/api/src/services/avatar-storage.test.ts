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

  it('rejects avatar uploads when storage is not configured', async () => {
    const { ingestAgentAvatarFromUrl } = await import('./avatar-storage')

    await expect(
      ingestAgentAvatarFromUrl('https://images.example.com/phil.png', 'phil_assistant'),
    ).rejects.toThrow('Avatar storage is not configured right now.')
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
})
