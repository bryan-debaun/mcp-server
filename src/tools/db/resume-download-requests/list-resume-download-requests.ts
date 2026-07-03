import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { withEffectiveStatus } from './expiry.js'
import { ListResumeDownloadRequestsInputSchema } from './schemas.js'

const name = 'list-resume-download-requests'
const config = {
    title: 'List Résumé Download Requests',
    description:
        'List résumé-download requests (admin). Filter by stored status and/or user. ' +
        'Output status reflects lazy expiry (an approved row past its window shows as expired).',
    inputSchema: ListResumeDownloadRequestsInputSchema,
}

export function registerListResumeDownloadRequestsTool(
    server: McpServer,
): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { status, userId, limit = 50, offset = 0 } = args

                // Filter operates on the stored status; `all`/undefined = no filter.
                const where: any = {}
                if (status && status !== 'all') where.status = status
                if (userId) where.userId = userId

                const rows = await prisma.resumeDownloadRequest.findMany({
                    where,
                    take: limit,
                    skip: offset,
                    orderBy: { createdAt: 'desc' },
                })

                const requests = rows.map((r: any) => withEffectiveStatus(r))

                return createSuccessResult({
                    requests,
                    total: requests.length,
                    limit,
                    offset,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
