import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { DeleteContentCreatorInputSchema } from './schemas.js'

const name = 'delete-content-creator'
const config = {
    title: 'Delete ContentCreator',
    description: 'Delete a content creator (admin only)',
    inputSchema: DeleteContentCreatorInputSchema,
}

export function registerDeleteContentCreatorTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args
                const cc = await prisma.contentCreator.delete({ where: { id } })
                return createSuccessResult({
                    message: 'ContentCreator deleted successfully',
                    cc,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
