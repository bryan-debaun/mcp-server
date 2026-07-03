import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { RESUME_QUOTA_MAX, RESUME_QUOTA_WINDOW_DAYS } from './constants.js'
import { CreateResumeDownloadRequestInputSchema } from './schemas.js'

const name = 'create-resume-download-request'
const config = {
    title: 'Create Résumé Download Request',
    description:
        'Create a résumé-download request for a user. Enforces a per-user quota ' +
        `(max ${RESUME_QUOTA_MAX} in the trailing ${RESUME_QUOTA_WINDOW_DAYS} days).`,
    inputSchema: CreateResumeDownloadRequestInputSchema,
}

export function registerCreateResumeDownloadRequestTool(
    server: McpServer,
): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { userId, userEmail, reason } = args

                // Server-side quota: reject if the user already has RESUME_QUOTA_MAX
                // requests in the trailing window. The controller maps this to 429.
                const windowStart = new Date(
                    Date.now() - RESUME_QUOTA_WINDOW_DAYS * 24 * 60 * 60 * 1000,
                )
                const recentCount = await prisma.resumeDownloadRequest.count({
                    where: { userId, createdAt: { gte: windowStart } },
                })
                if (recentCount >= RESUME_QUOTA_MAX) {
                    return createErrorResult(
                        `Quota exceeded: at most ${RESUME_QUOTA_MAX} résumé-download requests per ${RESUME_QUOTA_WINDOW_DAYS} days`,
                    )
                }

                const created = await prisma.resumeDownloadRequest.create({
                    data: {
                        userId,
                        userEmail,
                        reason: reason ?? null,
                        status: 'pending',
                    },
                })

                return createSuccessResult(created)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
