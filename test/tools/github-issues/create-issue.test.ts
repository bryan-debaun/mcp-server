import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock gh-cli before importing modules that use it
vi.mock('../../../src/tools/github-issues/gh-cli.js', () => ({
    runGhCommand: vi.fn()
}))

import { registerCreateIssueTool } from '../../../src/tools/github-issues/create-issue.js'
import * as ghCli from '../../../src/tools/github-issues/gh-cli.js'

describe('create-issue tool', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses --body-file for multiline body', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerCreateIssueTool(fake)

        const run = ghCli.runGhCommand as unknown as ReturnType<typeof vi.fn>
        (run as any).mockImplementation((args: string[]) => {
            const cmd = args.join(' ')
            if (cmd.includes('issue create')) return Promise.resolve('https://github.com/bryan-debaun/mcp-server/issues/123')
            return Promise.resolve('[]')
        })

        const longBody = 'line1\nline2\n'
        const result = await fake.handler({ repo: 'bryan-debaun/mcp-server', title: 'T', body: longBody })

        expect(run).toHaveBeenCalled()
        const createCall = (run as any).mock.calls.find((c: any) => c[0][0] === 'issue' && c[0].includes('create'))
        expect(createCall).toBeTruthy()
        expect(createCall[0]).toContain('--body-file')

        // parse returned message
        const payload = JSON.parse(result.content[0].text)
        expect(payload.message).toContain('Issue #')
    })

    it('accepts bodyJson and writes markdown file', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerCreateIssueTool(fake)

        const run = ghCli.runGhCommand as unknown as ReturnType<typeof vi.fn>
        (run as any).mockImplementation((args: string[]) => {
            const cmd = args.join(' ')
            if (cmd.includes('issue create')) return Promise.resolve('https://github.com/bryan-debaun/mcp-server/issues/456')
            return Promise.resolve('[]')
        })

        const jsonBody = { foo: 'bar', x: 1 }
        const result = await fake.handler({ repo: 'bryan-debaun/mcp-server', title: 'JSON', bodyJson: jsonBody })

        expect(run).toHaveBeenCalled()
        const createCall = (run as any).mock.calls.find((c: any) => c[0][0] === 'issue' && c[0].includes('create'))
        expect(createCall[0]).toContain('--body-file')

        const payload = JSON.parse(result.content[0].text)
        expect(payload.url).toContain('/issues/456')
    })
})
