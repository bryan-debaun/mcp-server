import { describe, it, expect } from 'vitest'
import { startHttpServer } from '../../src/http/server'

describe('startHttpServer', () => {
    it('binds to the provided host when passed', async () => {
        const srv = await startHttpServer(0, '127.0.0.1')
        const addr = srv.address() as any
        expect(addr).toBeTruthy()
        expect(addr.address === '127.0.0.1' || addr.address === '::ffff:127.0.0.1').toBeTruthy()
        srv.close()
    })
})
