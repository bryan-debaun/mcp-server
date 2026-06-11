import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { CreateContentCreatorInputSchema } from './schemas.js'

const name = 'create-content-creator'
const config = {
    title: 'Create ContentCreator',
    description: 'Create a new content creator (admin only)',
    inputSchema: CreateContentCreatorInputSchema,
}

export function registerCreateContentCreatorTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { name, description, website } = args

                const cc = await prisma.contentCreator.create({
                    data: {
                        name,
                        description,
                        website,
                    },
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
