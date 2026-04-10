import { describe, it, expect, vi, beforeEach } from 'vitest'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

vi.mock('../../../src/tools/github-projects/graphql.js')

import { registerGetProjectStatusOptionsTool } from '../../../src/tools/github-projects/get-project-status-options.js'
import * as graphql from '../../../src/tools/github-projects/graphql.js'

describe('get-project-status-options tool', () => {
    let mockServer: any
    let registeredHandler: any

    beforeEach(() => {
        vi.clearAllMocks()
        mockServer = {
            registerTool: vi.fn((_name: string, _cfg: any, handler: any) => { registeredHandler = handler })
        }
        registerGetProjectStatusOptionsTool(mockServer as McpServer)
    })

    it('registers with correct name', () => {
        expect(mockServer.registerTool).toHaveBeenCalledWith(
            'get-project-status-options',
            expect.objectContaining({ title: 'Get Project Status Options' }),
            expect.any(Function)
        )
    })

    it('returns status options when Status field exists', async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: 'PVT_123',
            fields: [
                {
                    id: 'PVTSSF_1',
                    name: 'Status',
                    dataType: 'SINGLE_SELECT',
                    options: [
                        { id: 'opt1', name: 'Todo' },
                        { id: 'opt2', name: 'In Progress' },
                        { id: 'opt3', name: 'Done' },
                    ]
                }
            ]
        })

        const result = await registeredHandler({ owner: 'bryan-debaun', projectNumber: 5 })
        const payload = JSON.parse(result.content[0].text)

        expect(payload.statusFieldId).toBe('PVTSSF_1')
        expect(payload.statusOptions).toHaveLength(3)
        expect(payload.statusOptions[0]).toMatchObject({ id: 'opt1', name: 'Todo' })
    })

    it('returns empty options when no Status field found', async () => {
        vi.mocked(graphql.getProjectFields).mockResolvedValue({
            projectId: 'PVT_123',
            fields: [{ id: 'f1', name: 'Title', dataType: 'TEXT' }]
        })

        const result = await registeredHandler({ owner: 'owner', projectNumber: 1 })
        const payload = JSON.parse(result.content[0].text)
        expect(payload.statusOptions).toHaveLength(0)
        expect(payload.message).toContain('No Status field')
    })

    it('returns error result if graphql throws', async () => {
        vi.mocked(graphql.getProjectFields).mockRejectedValue(new Error('Not found'))
        const result = await registeredHandler({ owner: 'x', projectNumber: 99 })
        expect(result.isError).toBe(true)
        expect(result.content[0].text).toContain('Not found')
    })
})
