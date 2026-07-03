import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { prisma } from '../../../db/index.js'
import {
    createErrorResult,
    createSuccessResult,
} from '../../github-issues/results.js'
import { registerTool } from '../../registration.js'
import { ResumeDocumentSchema, UpdateResumeInputSchema } from './schemas.js'

const name = 'update-resume'
const config = {
    title: 'Update Résumé',
    description:
        'Replace the singleton résumé document (admin). Validates the top-level ' +
        'JSON Resume shape (basics + work/education/skills/projects).',
    inputSchema: UpdateResumeInputSchema,
}

const RESUME_ID = 1

export function registerUpdateResumeTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                // Validate here so both surfaces (MCP + REST via callTool) enforce
                // the shape — the REST facade doesn't re-run the Zod input schema.
                const parsed = ResumeDocumentSchema.safeParse(args?.document)
                if (!parsed.success) {
                    const detail = parsed.error.issues
                        .map(
                            (i) =>
                                `${i.path.join('.') || '(root)'}: ${i.message}`,
                        )
                        .join('; ')
                    return createErrorResult(
                        `Invalid resume document: ${detail}`,
                    )
                }
                const document = parsed.data

                const row = await prisma.resume.upsert({
                    where: { id: RESUME_ID },
                    update: { document },
                    create: { id: RESUME_ID, document },
                })

                return createSuccessResult({
                    document: row.document,
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
