import type { NextFunction, Request, Response } from 'express'
import { beginDbContext } from '../../db/request-context.js'

/**
 * Open a per-request database-identity scope.
 *
 * Must be registered **before** anything that authenticates, because it only
 * opens an (initially empty) scope — the identity is written into it later by
 * whichever gate resolves it (`jwtMiddleware`, TSOA's `expressAuthentication`,
 * `mcpAuthMiddleware`). That indirection exists because TSOA resolves auth
 * *inside* route handling, far too late for a middleware to have wrapped the
 * handler in a scope that already knew who the caller was.
 *
 * Wrapping `next()` is what makes the scope cover the rest of the request:
 * everything downstream is invoked from within this call, so async work it
 * starts inherits the context.
 */
export function dbContextMiddleware(
    _req: Request,
    _res: Response,
    next: NextFunction,
) {
    beginDbContext(() => next())
}
