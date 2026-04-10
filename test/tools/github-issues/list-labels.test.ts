import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

vi.mock('../../../src/tools/github-issues/octokit.js', () => ({
    createOctokitClient: vi.fn(),
    parseRepo: (repo: string) => {
        const [owner, repoName] = repo.split('/')
        return { owner, repo: repoName }
    }
}))

import { registerListLabelsTool } from '../../../src/tools/github-issues/list-labels.js'
import * as octokitModule from '../../../src/tools/github-issues/octokit.js'

describe('list-labels tool', () => {
    let mockServer: any
    let registeredHandler: any
    let mockOctokit: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockOctokit = {
            rest: {
                issues: {
                    listLabelsForRepo: vi.fn().mockResolvedValue({
                        data: [
                            { name: 'bug', color: 'ee0701', description: 'Something is broken' },
                            { name: 'feature', color: '0075ca', description: '' },
                        ]
                    })
                }
            }
        }
        vi.mocked(octokitModule.createOctokitClient).mockReturnValue(mockOctokit as any)

        mockServer = {
            registerTool: vi.fn((_name: string, _cfg: any, handler: any) => {
                registeredHandler = handler
            })
        }
        registerListLabelsTool(mockServer as McpServer)
    })

    it('registers with correct name and description', () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            'list-labels',
            expect.objectContaining({ title: 'List Labels' }),
            expect.any(Function)
        )
    })

    it('returns all labels with name, color, and description', async () => {
        const result = await registeredHandler({ repo: 'owner/repo' })
        const payload = JSON.parse(result.content[0].text)
        expect(payload.count).toBe(2)
        expect(payload.labels[0]).toMatchObject({ name: 'bug', color: 'ee0701' })
        expect(payload.labels[1]).toMatchObject({ name: 'feature' })
    })

    it('returns error result if Octokit throws', async () => {
        mockOctokit.rest.issues.listLabelsForRepo.mockRejectedValue(new Error('Not found'))
        const result = await registeredHandler({ repo: 'owner/repo' })
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Not found')
    })
})
