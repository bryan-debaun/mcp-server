import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { GetResumeInputSchema } from './schemas.js'
import { stripPrivateContact } from './strip.js'

const name = 'get-resume'
const config = {
    title: 'Get Résumé',
    description:
        'Get the singleton résumé document. Public reads omit basics.privateContact; ' +
        'pass includePrivate=true (admin / server-to-server) to include it.',
    inputSchema: GetResumeInputSchema,
}

// The résumé is a singleton stored at a fixed id.
const RESUME_ID = 1

export function registerGetResumeTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const includePrivate = args?.includePrivate === true
                const row = await prisma.resume.findUnique({
                    where: { id: RESUME_ID },
                })
                if (!row) return createErrorResult('Resume not found')

                const document = includePrivate
                    ? row.document
                    : stripPrivateContact(row.document)

                return createSuccessResult({
                    document,
                    updatedAt: row.updatedAt,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)
                return createErrorResult(message)
            }
        },
    )
}
