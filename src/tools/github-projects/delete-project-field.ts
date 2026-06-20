import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { registerTool } from '../registration.js'
import {
    clearProjectCache,
    deleteProjectField,
    getProjectFields,
} from './graphql.js'
import {
    createErrorResult,
    createFieldNotFoundError,
    createPermissionError,
    createSuccessResult,
} from './results.js'
import { DeleteProjectFieldInputSchema } from './schemas.js'

const name = 'delete-project-field'
const config = {
    title: 'Delete Project Field',
    description: 'Delete a custom field from a GitHub Project V2',
    inputSchema: DeleteProjectFieldInputSchema,
}

/**
 * Registers the delete-project-field tool with the MCP server.
 */
export function registerDeleteProjectFieldTool(server: McpServer): void {
    registerTool(
        server,
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { owner, projectNumber, fieldName } = args as {
                    owner: string
                    projectNumber: number
                    fieldName: string
                }

                // Get project metadata and find the field
                const { projectId, fields } = await getProjectFields(
                    owner,
                    projectNumber,
                )
                const field = fields.find((f) => f.name === fieldName)

                if (!field) {
                    return createFieldNotFoundError(
                        fieldName,
                        fields.map((f) => f.name),
                    )
                }

                // Delete the field
                await deleteProjectField(projectId, field.id)

                // Clear cache to force refresh
                clearProjectCache(owner, projectNumber)

                return createSuccessResult({
                    message: `Successfully deleted field '${fieldName}'`,
                    fieldName,
                    fieldType: field.dataType,
                    owner,
                    projectNumber,
                })
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : String(error)

                // Check for permission errors
                if (
                    message.includes('Could not resolve to a') ||
                    message.includes('403') ||
                    message.includes('permission')
                ) {
                    return createPermissionError('delete project fields')
                }

                return createErrorResult(message)
            }
        },
    )
}
