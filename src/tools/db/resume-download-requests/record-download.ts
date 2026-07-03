import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { RESUME_MAX_DOWNLOADS } from './constants.js'
import { RecordResumeDownloadInputSchema } from './schemas.js'

const name = 'record-resume-download'
const config = {
    title: 'Record Résumé Download',
    description:
        'Record a download against an approved request and enforce the cap ' +
        `(max ${RESUME_MAX_DOWNLOADS} per approval). Atomically increments ` +
        'downloadCount and flips status to fulfilled once the cap is reached; ' +
        'errors if the request is not approved, expired, or already at the cap.',
    inputSchema: RecordResumeDownloadInputSchema,
}

export function registerRecordResumeDownloadTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args
                const now = new Date()

                // Atomic, race-safe gate: only an approved, unexpired row that is
                // still under the cap gets incremented. Because the increment is
                // guarded by `downloadCount < cap`, at most `cap` increments can
                // ever succeed for a row — no over-counting under concurrency.
                const res = await prisma.resumeDownloadRequest.updateMany({
                    where: {
                        id,
                        status: 'approved',
                        expiresAt: { gt: now },
                        downloadCount: { lt: RESUME_MAX_DOWNLOADS },
                    },
                    data: { downloadCount: { increment: 1 } },
                })

                if (res.count === 0) {
                    // Nothing was updated — determine why for a precise error.
                    const row = await prisma.resumeDownloadRequest.findUnique({
                        where: { id },
                    })
                    if (!row) {
                        return createErrorResult(
                            'Resume download request not found',
                        )
                    }
                    if (
                        row.status === 'fulfilled' ||
                        row.downloadCount >= RESUME_MAX_DOWNLOADS
                    ) {
                        return createErrorResult('Download cap reached')
                    }
                    if (
                        !row.expiresAt ||
                        new Date(row.expiresAt).getTime() <= now.getTime()
                    ) {
                        return createErrorResult('Download window has expired')
                    }
                    return createErrorResult(
                        'Request is not approved for download',
                    )
                }

                // Increment succeeded. Exactly the caller that reaches the cap
                // flips the request to fulfilled (the `< cap` gate means only one
                // increment can land on the cap).
                let row = await prisma.resumeDownloadRequest.findUnique({
                    where: { id },
                })
                if (
                    row &&
                    row.downloadCount >= RESUME_MAX_DOWNLOADS &&
                    row.status !== 'fulfilled'
                ) {
                    row = await prisma.resumeDownloadRequest.update({
                        where: { id },
                        data: { status: 'fulfilled' },
                    })
                }

                return createSuccessResult(row)
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
