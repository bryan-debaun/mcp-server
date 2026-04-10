import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

vi.mock('../../../src/tools/github-projects/graphql.js')
vi.mock('../../../src/tools/github-issues/octokit.js', () => ({
    createOctokitClient: vi.fn()
}))
vi.mock('../../../src/tools/github-issues/label-helper.js', () => ({
    ensureLabelsExist: vi.fn().mockResolvedValue(undefined)
}))

import { registerCreateIssueInProjectTool } from '../../../src/tools/github-projects/create-issue-in-project.js'
import * as graphql from '../../../src/tools/github-projects/graphql.js'
import * as octokitModule from '../../../src/tools/github-issues/octokit.js'

const PROJECT_FIELDS = {
    projectId: 'PVT_123',
    fields: [
        {
            id: 'PVTSSF_1',
            name: 'Status',
            dataType: 'SINGLE_SELECT' as const,
            options: [
                { id: 'opt_todo', name: 'Todo' },
                { id: 'opt_inprog', name: 'In Progress' },
            ]
        }
    ]
}

describe('create-issue-in-project tool', () => {
    let mockServer: any
    let registeredHandler: any
    let mockOctokit: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockOctokit = {
            rest: {
                issues: {
                    create: vi.fn().mockResolvedValue({
                        data: { number: 99, html_url: 'https://github.com/owner/repo/issues/99', title: 'New issue' }
                    })
                }
            }
        }
        vi.mocked(octokitModule.createOctokitClient).mockReturnValue(mockOctokit as any)
        vi.mocked(graphql.getProjectFields).mockResolvedValue(PROJECT_FIELDS)
        vi.mocked(graphql.getIssueNodeId).mockResolvedValue('I_node_99')
        vi.mocked(graphql.addIssueToProject).mockResolvedValue('PVTI_item_1')
        vi.mocked(graphql.updateProjectFieldValue).mockResolvedValue(undefined)

        mockServer = {
            registerTool: vi.fn((_name: string, _cfg: any, handler: any) => { registeredHandler = handler })
        }
        registerCreateIssueInProjectTool(mockServer as McpServer)
    })

    it('registers with correct name', () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            'create-issue-in-project',
            expect.objectContaining({ title: 'Create Issue in Project' }),
            expect.any(Function)
        )
    })

    it('creates issue, adds to project, and sets status', async () => {
        const result = await registeredHandler({
            owner: 'bryan-debaun',
            repo: 'mcp-server',
            projectNumber: 5,
            title: 'New issue',
            body: 'Issue body',
            status: 'Todo'
        })

        expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith(
            expect.objectContaining({ owner: 'bryan-debaun', repo: 'mcp-server', title: 'New issue' })
        )
        expect(graphql.getIssueNodeId).toHaveBeenCalledWith('bryan-debaun', 'mcp-server', 99)
        expect(graphql.addIssueToProject).toHaveBeenCalledWith('PVT_123', 'I_node_99')
        expect(graphql.updateProjectFieldValue).toHaveBeenCalledWith(
            'PVT_123', 'PVTI_item_1', 'PVTSSF_1', 'opt_todo', 'SINGLE_SELECT'
        )

        const payload = JSON.parse(result.content[0].text)
        expect(payload.issueNumber).toBe(99)
        expect(payload.statusSet).toBe('Todo')
    })

    it('adds to project without setting status when status omitted', async () => {
        await registeredHandler({
            owner: 'owner',
            repo: 'repo',
            projectNumber: 1,
            title: 'No status'
        })

        expect(graphql.updateProjectFieldValue).not.toHaveBeenCalled()
    })

    it('warns when status option name is not recognised', async () => {
        const result = await registeredHandler({
            owner: 'owner',
            repo: 'repo',
            projectNumber: 1,
            title: 'Bad status',
            status: 'Nonexistent'
        })

        const payload = JSON.parse(result.content[0].text)
        expect(payload.statusSet).toBeNull()
        expect(payload.message).toContain('Nonexistent')
        expect(payload.message).toContain('Todo')
    })

    it('warns when project has no Status field', async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: 'PVT_123',
            fields: [{ id: 'f1', name: 'Title', dataType: 'TEXT' }]
        })

        const result = await registeredHandler({
            owner: 'owner',
            repo: 'repo',
            projectNumber: 1,
            title: 'No status field',
            status: 'Todo'
        })

        const payload = JSON.parse(result.content[0].text)
        expect(payload.statusSet).toBeNull()
        expect(payload.message).toContain('no Status field')
    })

    it('returns error result if issue creation fails', async () => {
        mockOctokit.rest.issues.create.mockRejectedValue(new Error('Forbidden'))
        const result = await registeredHandler({ owner: 'o', repo: 'r', projectNumber: 1, title: 'Fail' })
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Forbidden')
    })
})
