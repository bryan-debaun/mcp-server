import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../src/tools/github-issues/gh-cli.js', () => ({
    runGhCommand: vi.fn(),
    parseGhJson: (s: string) => JSON.parse(s)
}))

import { registerUpdateIssueTool } from '../../../src/tools/github-issues/update-issue.js'
import * as ghCli from '../../../src/tools/github-issues/gh-cli.js'

describe('update-issue tool', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses --body-file for multiline body when updating', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerUpdateIssueTool(fake)

        const run = ghCli.runGhCommand as unknown as ReturnType<typeof vi.fn>
        (run as any).mockImplementation((args: string[]) => {
            const cmd = args.join(' ')
            if (cmd.includes('issue edit')) return Promise.resolve('')
            return Promise.resolve('[]')
        })

        const res = await fake.handler({ repo: 'bryan-debaun/mcp-server', issueNumber: 10, body: 'multi\nline' })
        expect(run).toHaveBeenCalled()
        const editCall = (run as any).mock.calls.find((c: any) => c[0][0] === 'issue' && c[0].includes('edit'))
        expect(editCall).toBeTruthy()
        expect(editCall[0]).toContain('--body-file')
        const payload = JSON.parse(res.content[0].text)
        expect(payload.message).toContain('updated successfully')
    })

    it('creates missing labels before assigning them', async () => {
        const fake: any = {}
        fake.registerTool = (_name: string, _cfg: any, handler: any) => { fake.handler = handler }

        registerUpdateIssueTool(fake)

        const run = ghCli.runGhCommand as unknown as ReturnType<typeof vi.fn>
        (run as any).mockImplementation((args: string[]) => {
            const cmd = args.join(' ')
            if (cmd.includes('label list')) {
                // repo has only `existing` label
                return Promise.resolve(JSON.stringify([{ name: 'existing' }]))
            }
            if (cmd.includes('label create')) return Promise.resolve('')
            if (cmd.includes('issue edit')) return Promise.resolve('')
            return Promise.resolve('')
        })

        const res = await fake.handler({ repo: 'bryan-debaun/mcp-server', issueNumber: 11, labels: 'existing,new-label' })
        expect(run).toHaveBeenCalled()

        const created = (run as any).mock.calls.find((c: any) => c[0][0] === 'label' && c[0].includes('create'))
        expect(created).toBeTruthy()

        const editCall = (run as any).mock.calls.find((c: any) => c[0][0] === 'issue' && c[0].includes('edit'))
        expect(editCall).toBeTruthy()
        expect(editCall[0]).toContain('--add-label')

        const payload = JSON.parse(res.content[0].text)
        expect(payload.updates).toContain('labels')
    })
})
