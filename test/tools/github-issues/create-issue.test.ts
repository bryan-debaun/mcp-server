import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

// Mock octokit module before importing the tool
vi.mock('../../../src/tools/github-issues/octokit.js', () => ({
    createOctokitClient: vi.fn(),
    parseRepo: (repo: string) => {
        const [owner, repoName] = repo.split('/')
        return { owner, repo: repoName }
    }
}))
vi.mock('../../../src/tools/github-issues/label-helper.js', () => ({
    ensureLabelsExist: vi.fn().mockResolvedValue(undefined)
}))

import { registerCreateIssueTool } from '../../../src/tools/github-issues/create-issue.js'
import * as octokitModule from '../../../src/tools/github-issues/octokit.js'

describe('create-issue tool', () => {
    let mockServer: any
    let registeredHandler: any
    let mockOctokit: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockOctokit = {
            rest: {
                issues: {
                    create: vi.fn().mockResolvedValue({
                        data: {
                            number: 42,
                            html_url: 'https://github.com/owner/repo/issues/42',
                            title: 'Test Issue'
                        }
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
        registerCreateIssueTool(mockServer as McpServer)
    })

    it('registers the tool with correct name', () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            'create-issue',
            expect.objectContaining({ title: 'Create Issue' }),
            expect.any(Function)
        )
    })

    it('creates an issue and returns success', async () => {
        const result = await registeredHandler({
            repo: 'owner/repo',
            title: 'Test Issue',
            body: 'Some body'
        })

        expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith(
            expect.objectContaining({ owner: 'owner', repo: 'repo', title: 'Test Issue', body: 'Some body' })
        )
        const payload = JSON.parse(result.content[0].text)
        expect(payload.message).toContain('#42')
        expect(payload.url).toContain('/issues/42')
    })

    it('creates issue with labels, assignees, and milestone', async () => {
        await registeredHandler({
            repo: 'owner/repo',
            title: 'With meta',
            labels: 'bug, enhancement',
            assignees: 'alice, bob',
            milestone: 3
        })

        expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith(
            expect.objectContaining({
                labels: ['bug', 'enhancement'],
                assignees: ['alice', 'bob'],
                milestone: 3
            })
        )
    })

    it('reads body from bodyJson', async () => {
        const result = await registeredHandler({
            repo: 'owner/repo',
            title: 'JSON body',
            bodyJson: { key: 'value' }
        })
        const payload = JSON.parse(result.content[0].text)
        expect(payload.number).toBe(42)
    })

    it('returns error result if Octokit throws', async () => {
        mockOctokit.rest.issues.create.mockRejectedValue(new Error('API rate limit'))
        const result = await registeredHandler({ repo: 'owner/repo', title: 'Fail' })
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('API rate limit')
    })
})

