import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

vi.mock('../../../src/tools/github-projects/graphql.js')

import { registerListProjectItemsTool } from '../../../src/tools/github-projects/list-project-items.js'
import * as graphql from '../../../src/tools/github-projects/graphql.js'

describe('list-project-items tool', () => {
    let mockServer: any
    let registeredHandler: any

    beforeEach(() => {
        vi.clearAllMocks()

        mockServer = {
            registerTool: vi.fn((_name: string, _cfg: any, handler: any) => {
                registeredHandler = handler
            })
        }
        registerListProjectItemsTool(mockServer as McpServer)
    })

    it('registers with correct name', () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            'list-project-items',
            expect.objectContaining({ title: 'List Project Items' }),
            expect.any(Function)
        )
    })

    it('groups items by status and returns board snapshot', async () => {
        vi.mocked(graphql.listProjectItems).mockResolvedValue([
            { id: 'item1', issueNumber: 10, title: 'Fix bug', url: 'https://github.com/x/y/issues/10', fieldValues: { Status: 'In Progress' } },
            { id: 'item2', issueNumber: 11, title: 'Add feature', url: 'https://github.com/x/y/issues/11', fieldValues: { Status: 'Todo' } },
            { id: 'item3', issueNumber: 12, title: 'Review', url: 'https://github.com/x/y/issues/12', fieldValues: { Status: 'In Progress' } },
        ])

        const result = await registeredHandler({ owner: 'bryan-debaun', projectNumber: 5 })
        const payload = JSON.parse(result.content[0].text)

        expect(payload.totalItems).toBe(3)
        expect(payload.byStatus['In Progress']).toHaveLength(2)
        expect(payload.byStatus['Todo']).toHaveLength(1)
    })

    it('places items with no status under "(no status)"', async () => {
        vi.mocked(graphql.listProjectItems).mockResolvedValue([
            { id: 'item1', issueNumber: 1, title: 'Uncategorized', url: '', fieldValues: {} },
        ])

        const result = await registeredHandler({ owner: 'owner', projectNumber: 1 })
        const payload = JSON.parse(result.content[0].text)
        expect(payload.byStatus['(no status)']).toHaveLength(1)
    })

    it('returns error result if graphql throws', async () => {
        vi.mocked(graphql.listProjectItems).mockRejectedValue(new Error('Project not found'))
        const result = await registeredHandler({ owner: 'x', projectNumber: 99 })
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Project not found')
    })
})
