import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { RESUME_APPROVAL_WINDOW_HOURS } from './constants.js'
import { ApproveResumeDownloadRequestInputSchema } from './schemas.js'

const name = 'approve-resume-download-request'
const config = {
    title: 'Approve Résumé Download Request',
    description:
        'Approve a pending résumé-download request (admin). Sets approvedAt and a ' +
        `${RESUME_APPROVAL_WINDOW_HOURS}h download window.`,
    inputSchema: ApproveResumeDownloadRequestInputSchema,
}

export function registerApproveResumeDownloadRequestTool(
    server: McpServer,
): void {
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
                        `Cannot approve a request that is ${existing.status}`,
                    )
                }

                const now = new Date()
                const expiresAt = new Date(
                    now.getTime() +
                        RESUME_APPROVAL_WINDOW_HOURS * 60 * 60 * 1000,
                )

                const updated = await prisma.resumeDownloadRequest.update({
                    where: { id },
                    data: {
                        status: 'approved',
                        approvedAt: now,
                        expiresAt,
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
