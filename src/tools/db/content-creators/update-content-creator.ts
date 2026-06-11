import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { UpdateContentCreatorInputSchema } from './schemas.js'

const name = 'update-content-creator'
const config = {
    title: 'Update ContentCreator',
    description: 'Update an existing content creator (admin only)',
    inputSchema: UpdateContentCreatorInputSchema,
}

export function registerUpdateContentCreatorTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, name, description, website } = args
                const data: any = {}
                if (name !== undefined) data.name = name
                if (description !== undefined) data.description = description
                if (website !== undefined) data.website = website

                const cc = await prisma.contentCreator.update({
                    where: { id },
                    data,
                })
                return createSuccessResult(cc)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
