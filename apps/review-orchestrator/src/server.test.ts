import express from 'express'
import request from 'supertest'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

describe('buildReviewOrchestratorApp', () => {
  it('serves health and mounts the EDDIE callback route', async () => {
    vi.resetModules()

    vi.doMock('./callback', () => ({
      createEddieCallbackHandler: () =>
        ((_request: express.Request, response: express.Response) => {
          response.status(202).json({ ok: true })
        }) as express.RequestHandler,
    }))
    vi.doMock('./worker', () => ({
      startReviewWorker: vi.fn(async () => undefined),
    }))

    const { buildReviewOrchestratorApp } = await import('./server')
    const app = buildReviewOrchestratorApp()

    expect((await request(app).get('/health')).body).toEqual({ ok: true })
    expect(
      (await request(app).post('/review/callback/eddie').send(Buffer.from('{}')))
        .statusCode,
    ).toBe(202)
  })

  it('starts the server, logs, and aborts the worker when the server closes', async () => {
    vi.resetModules()

    const { startReviewOrchestratorServer } = await import('./server')
    const closeEmitter = new EventEmitter()
    const listen = vi.fn(
      (
        _port: number,
        _host: string,
        callback: () => void,
      ): ReturnType<express.Express['listen']> => {
        callback()
        return {
          on: closeEmitter.on.bind(closeEmitter),
        } as ReturnType<express.Express['listen']>
      },
    )

    const app = express()
    Object.assign(app, {
      listen: listen as unknown as express.Express['listen'],
    })

    const log = vi.fn()
    const startWorker = vi.fn(async (signal?: AbortSignal) => {
      expect(signal?.aborted).toBe(false)
      closeEmitter.emit('close')
      expect(signal?.aborted).toBe(true)
    })

    const server = startReviewOrchestratorServer({
      app,
      workerEnabled: true,
      startWorker,
      log,
    })

    expect(server).toBeTruthy()
    expect(listen).toHaveBeenCalled()
    expect(startWorker).toHaveBeenCalledTimes(1)
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('review orchestrator listening on'),
    )

    startReviewOrchestratorServer({
      app,
      workerEnabled: false,
      startWorker,
      log,
    })
    expect(startWorker).toHaveBeenCalledTimes(1)
  })

  it('uses default worker and logger dependencies when only an app is supplied', async () => {
    vi.resetModules()

    const startReviewWorker = vi.fn(async () => undefined)
    vi.doMock('./worker', () => ({
      startReviewWorker,
    }))

    const { startReviewOrchestratorServer } = await import('./server')
    const app = express()
    const listen = vi.fn(
      (
        _port: number,
        _host: string,
        callback: () => void,
      ): ReturnType<express.Express['listen']> => {
        callback()
        return {
          on: vi.fn(),
        } as unknown as ReturnType<express.Express['listen']>
      },
    )
    Object.assign(app, {
      listen: listen as unknown as express.Express['listen'],
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    try {
      startReviewOrchestratorServer({ app })
      expect(startReviewWorker).toHaveBeenCalledTimes(1)
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('review orchestrator listening on'),
      )
    } finally {
      logSpy.mockRestore()
    }
  })
})
