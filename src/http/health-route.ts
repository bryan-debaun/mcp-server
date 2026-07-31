import type { Request, Response } from 'express'
import { capabilitySummary } from '../capabilities.js'
import { config } from '../config.js'
import { initPrisma, prisma } from '../db/index.js'
import { logger } from '../logger.js'
import { isReady } from './readiness.js'

/**
 * Run a trivial `SELECT 1` to keep the database connection (and a paused
 * Supabase free project) warm, reporting round-trip latency. Returns
 * `{ db: 'skipped' }` without touching Prisma when no `DATABASE_URL` is
 * configured, so CI / no-DB startups and the stub contract stay green (#119).
 */
async function checkDatabase(): Promise<{
    db: 'ok' | 'skipped' | 'error'
    db_latency_ms?: number
}> {
    if (!config.database.url) return { db: 'skipped' }

    // Ensure Prisma has been initialized — `/healthz` is registered before DB
    // init in hosted mode, so an early deep ping could otherwise race it.
    await initPrisma()

    const start = performance.now()
    await prisma.$queryRaw`SELECT 1`
    const db_latency_ms = Math.round((performance.now() - start) * 100) / 100
    return { db: 'ok', db_latency_ms }
}

export function registerHealthRoute(app: any): void {
    // Liveness probe — always returns 200 to indicate the process is alive.
    // `?deep=1` additionally exercises the DB (keep-alive for Render + Supabase,
    // #119) and reports optional-integration state (#155); the default form stays
    // dependency-free and minimal for Render's own health check.
    app.get('/healthz', async (req: Request, res: Response) => {
        const base = {
            status: 'ok',
            uptime_seconds: process.uptime(),
            node: process.version,
        }

        const deep = req.query.deep === '1' || req.query.deep === 'true'
        if (!deep) return res.status(200).json(base)

        // Unconfigured optional integrations are reported but never change the
        // status code: the server is genuinely functional without them, and
        // failing the probe here would take the whole service down over a
        // missing GITHUB_TOKEN. This is a visibility signal, not a gate.
        const capabilities = capabilitySummary()

        try {
            const db = await checkDatabase()
            return res.status(200).json({ ...base, ...db, capabilities })
        } catch (err) {
            // DB is configured but unreachable — surface a 503 so an external
            // monitor alerts on a genuine outage (a paused/restoring Supabase or
            // a connection failure), rather than masking it as healthy.
            logger.warn(
                'deep /healthz DB check failed',
                (err as any)?.message ?? err,
            )
            return res.status(503).json({
                ...base,
                status: 'degraded',
                db: 'error',
                capabilities,
            })
        }
    })

    // Readiness probe — returns 200 when the app is ready to serve traffic,
    // otherwise 503 while initialization (DB, etc.) is in progress.
    app.get('/readyz', (_req: Request, res: Response) => {
        if (isReady()) {
            return res.status(200).json({ status: 'ready' })
        }
        return res.status(503).json({ status: 'initializing' })
    })
}
