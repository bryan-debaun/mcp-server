import { describe, it, expect, vi, afterEach } from 'vitest'
import { config } from '../src/config.js'
import { logger, setErrorReporter } from '../src/logger.js'
import { initSentry } from '../src/sentry.js'

describe('Sentry / logger error bridge', () => {
    afterEach(() => setErrorReporter(null))

    it('logger.error invokes an attached error reporter with err, context, and message', () => {
        const reporter = vi.fn()
        setErrorReporter(reporter)

        const err = new Error('boom')
        logger.error('something failed', err, { route: '/x' })

        expect(reporter).toHaveBeenCalledTimes(1)
        const [errArg, ctxArg, msgArg] = reporter.mock.calls[0]
        expect(errArg).toBe(err)
        expect(ctxArg).toMatchObject({ err, route: '/x' })
        expect(msgArg).toContain('something failed')
    })

    it('non-error levels do not invoke the reporter', () => {
        const reporter = vi.fn()
        setErrorReporter(reporter)

        logger.info('hello')
        logger.warn('careful')
        logger.debug('details')

        expect(reporter).not.toHaveBeenCalled()
    })

    it('initSentry is a no-op when no DSN is configured (does not install a reporter)', () => {
        const sentinel = vi.fn()
        setErrorReporter(sentinel)

        const origDsn = config.sentry.dsn
        config.sentry.dsn = undefined
        try {
            initSentry() // should return early and leave our sentinel in place
            logger.error('x')
            expect(sentinel).toHaveBeenCalled()
        } finally {
            config.sentry.dsn = origDsn
        }
    })
})
