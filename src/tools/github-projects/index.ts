import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerBulkSetProjectFieldValuesTool } from './bulk-set-project-field-values.js'
import { registerCreateIssueInProjectTool } from './create-issue-in-project.js'
import { registerCreateProjectFieldTool } from './create-project-field.js'
import { registerDeleteProjectFieldTool } from './delete-project-field.js'
import { registerGetProjectFieldsTool } from './get-project-fields.js'
import { registerGetProjectStatusOptionsTool } from './get-project-status-options.js'
import { registerListProjectItemsTool } from './list-project-items.js'
import { registerSetProjectFieldValueTool } from './set-project-field-value.js'
import { registerUpdateProjectFieldTool } from './update-project-field.js'

/**
 * Registers all GitHub Projects V2 tools with the MCP server.
 */
export function registerGitHubProjectsTools(server: McpServer): void {
    // Field management (CRUD)
    registerGetProjectFieldsTool(server)
    registerCreateProjectFieldTool(server)
    registerUpdateProjectFieldTool(server)
    registerDeleteProjectFieldTool(server)

    // Value operations
    registerSetProjectFieldValueTool(server)
    registerBulkSetProjectFieldValuesTool(server)

    // Board visibility
    registerListProjectItemsTool(server)
    registerGetProjectStatusOptionsTool(server)

    // Atomic workflows
    registerCreateIssueInProjectTool(server)
}
