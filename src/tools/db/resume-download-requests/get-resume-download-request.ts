import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { withEffectiveStatus } from './expiry.js'
import { GetResumeDownloadRequestInputSchema } from './schemas.js'

const name = 'get-resume-download-request'
const config = {
    title: 'Get Résumé Download Request',
    description: 'Get a résumé-download request by id (admin).',
    inputSchema: GetResumeDownloadRequestInputSchema,
}

export function registerGetResumeDownloadRequestTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args
                const request = await prisma.resumeDownloadRequest.findUnique({
                    where: { id },
                })
                if (!request) {
                    return createErrorResult(
                        'Resume download request not found',
                    )
                }
                return createSuccessResult(withEffectiveStatus(request))
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
