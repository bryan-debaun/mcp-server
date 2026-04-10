import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

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

import { registerUpdateIssueTool } from '../../../src/tools/github-issues/update-issue.js'
import * as octokitModule from '../../../src/tools/github-issues/octokit.js'

describe('update-issue tool', () => {
    let mockServer: any
    let registeredHandler: any
    let mockOctokit: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockOctokit = {
            rest: {
                issues: {
                    update: vi.fn().mockResolvedValue({ data: {} }),
                    addLabels: vi.fn().mockResolvedValue({ data: [] }),
                    removeLabel: vi.fn().mockResolvedValue({ data: [] }),
                    createComment: vi.fn().mockResolvedValue({ data: {} })
                }
            }
        }
        vi.mocked(octokitModule.createOctokitClient).mockReturnValue(mockOctokit as any)

        mockServer = {
            registerTool: vi.fn((_name: string, _cfg: any, handler: any) => {
                registeredHandler = handler
            })
        }
        registerUpdateIssueTool(mockServer as McpServer)
    })

    it('registers the tool with correct name', () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            'update-issue',
            expect.objectContaining({ title: 'Update Issue' }),
            expect.any(Function)
        )
    })

    it('updates title via REST', async () => {
        const result = await registeredHandler({
            repo: 'owner/repo',
            issueNumber: 10,
            title: 'New title'
        })
        expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith(
            expect.objectContaining({ owner: 'owner', repo: 'repo', issue_number: 10, title: 'New title' })
        )
        const payload = JSON.parse(result.content[0].text)
        expect(payload.updates).toContain('title')
    })

    it('adds labels via REST', async () => {
        const result = await registeredHandler({
            repo: 'owner/repo',
            issueNumber: 11,
            labels: 'bug,feature'
        })
        expect(mockOctokit.rest.issues.addLabels).toHaveBeenCalledWith(
            expect.objectContaining({ labels: ['bug', 'feature'] })
        )
        const payload = JSON.parse(result.content[0].text)
        expect(payload.updates).toContain('labels')
    })

    it('removes labels one by one via REST', async () => {
        const result = await registeredHandler({
            repo: 'owner/repo',
            issueNumber: 12,
            removeLabels: 'old-label'
        })
        expect(mockOctokit.rest.issues.removeLabel).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'old-label' })
        )
        const payload = JSON.parse(result.content[0].text)
        expect(payload.updates).toContain('removeLabels')
    })

    it('closes issue by setting state=closed', async () => {
        const result = await registeredHandler({
            repo: 'owner/repo',
            issueNumber: 13,
            state: 'closed',
            stateReason: 'completed'
        })
        expect(mockOctokit.rest.issues.update).toHaveBeenCalledWith(
            expect.objectContaining({ state: 'closed', state_reason: 'completed' })
        )
        const payload = JSON.parse(result.content[0].text)
        expect(payload.updates).toContain('state')
    })

    it('adds a comment via REST', async () => {
        const result = await registeredHandler({
            repo: 'owner/repo',
            issueNumber: 14,
            comment: 'Hello!'
        })
        expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledWith(
            expect.objectContaining({ body: 'Hello!' })
        )
        const payload = JSON.parse(result.content[0].text)
        expect(payload.updates).toContain('comment added')
    })

    it('returns no-updates message when nothing provided', async () => {
        const result = await registeredHandler({ repo: 'owner/repo', issueNumber: 15 })
        const payload = JSON.parse(result.content[0].text)
        expect(payload.message).toContain('No updates')
    })
})

