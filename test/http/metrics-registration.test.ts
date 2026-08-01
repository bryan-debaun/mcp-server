import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import * as metrics from '../../src/http/metrics-route.js'

/**
 * Every exported metric must actually appear at `/metrics`.
 *
 * `metrics-route.ts` keeps a hand-maintained `register.registerMetric(...)` list
 * separate from the `export const … = new Counter(...)` declarations. Nothing
 * connected the two, so adding a metric and forgetting the registration left it
 * incrementing in memory and invisible to any scraper — no error, no warning.
 *
 * That is exactly what happened to `auth_subject_unresolved_total`: added for
 * #151 to make a silent admin downgrade visible, and itself silently invisible.
 * The counter for detecting silent failures failed silently.
 *
 * This test closes the loop by deriving expectations from the exports rather
 * than from a second list that can also drift.
 */
describe('metrics registration', () => {
    /** Names of every prom-client metric exported by the module. */
    const exportedNames = Object.values(metrics)
        .filter(
            (v: any) =>
                v &&
                typeof v === 'object' &&
                typeof v.get === 'function' &&
                v.name,
        )
        .map((v: any) => v.name as string)
        .sort()

    it('exports at least the known domain metrics', () => {
        expect(exportedNames).toContain('auth_subject_unresolved_total')
        expect(exportedNames).toContain('mcp_auth_failures_total')
        expect(exportedNames.length).toBeGreaterThan(8)
    })

    it('serves every exported metric from /metrics', async () => {
        const app = express()
        metrics.registerMetricsRoute(app)
        const res = await request(app).get('/metrics').expect(200)

        const missing = exportedNames.filter((name) => !res.text.includes(name))

        // If this fails, add `register.registerMetric(<yourMetric>)` in
        // src/http/metrics-route.ts. An unregistered metric is worse than no
        // metric: the code looks instrumented and reports nothing.
        expect(missing).toEqual([])
    })

    it('exposes the #151 counter specifically', async () => {
        const app = express()
        metrics.registerMetricsRoute(app)
        const res = await request(app).get('/metrics').expect(200)
        expect(res.text).toContain('auth_subject_unresolved_total')
    })
})
