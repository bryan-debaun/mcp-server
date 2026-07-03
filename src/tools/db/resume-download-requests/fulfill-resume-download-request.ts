import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { FulfillResumeDownloadRequestInputSchema } from './schemas.js'

const name = 'fulfill-resume-download-request'
const config = {
    title: 'Fulfill Résumé Download Request',
    description:
        'Record a download against an approved request (owner only). Increments ' +
        'downloadCount and flips status to fulfilled; allowed only within the ' +
        'approval window.',
    inputSchema: FulfillResumeDownloadRequestInputSchema,
}

export function registerFulfillResumeDownloadRequestTool(
    server: McpServer,
): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, userId } = args
                const existing = await prisma.resumeDownloadRequest.findUnique({
                    where: { id },
                })
                // Ownership mismatch is reported as not-found so a user can't probe
                // for other users' request ids.
                if (!existing || existing.userId !== userId) {
                    return createErrorResult(
                        'Resume download request not found',
                    )
                }

                if (
                    existing.status !== 'approved' &&
                    existing.status !== 'fulfilled'
                ) {
                    return createErrorResult(
                        'Request is not approved for download',
                    )
                }
                if (
                    !existing.expiresAt ||
                    new Date(existing.expiresAt).getTime() < Date.now()
                ) {
                    return createErrorResult('Download window has expired')
                }

                const updated = await prisma.resumeDownloadRequest.update({
                    where: { id },
                    data: {
                        status: 'fulfilled',
                        downloadCount: { increment: 1 },
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
