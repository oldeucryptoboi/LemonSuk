import type { NextFunction, Request, RequestHandler, Response } from 'express'

type AsyncRouteHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<unknown>

export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve(handler(request, response, next)).catch(next)
  }
}
