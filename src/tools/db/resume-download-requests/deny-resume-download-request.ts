import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { DenyResumeDownloadRequestInputSchema } from './schemas.js'

const name = 'deny-resume-download-request'
const config = {
    title: 'Deny Résumé Download Request',
    description: 'Deny a pending résumé-download request (admin).',
    inputSchema: DenyResumeDownloadRequestInputSchema,
}

export function registerDenyResumeDownloadRequestTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, adminNote } = args
                const existing = await prisma.resumeDownloadRequest.findUnique({
                    where: { id },
                })
                if (!existing) {
                    return createErrorResult(
                        'Resume download request not found',
                    )
                }
                if (existing.status !== 'pending') {
                    return createErrorResult(
                        `Cannot deny a request that is ${existing.status}`,
                    )
                }

                const updated = await prisma.resumeDownloadRequest.update({
                    where: { id },
                    data: {
                        status: 'denied',
                        ...(adminNote !== undefined ? { adminNote } : {}),
                    },
                })

                return createSuccessResult(updated)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
