import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetProjectFieldsInputSchema } from "./schemas.js";
import { getProjectFields } from "./graphql.js";
import { createSuccessResult, createErrorResult, createPermissionError } from "./results.js";

const name = "get-project-fields";
const config = {
    title: "Get Project Fields",
    description: "List all custom fields and their options for a GitHub Project V2",
    inputSchema: GetProjectFieldsInputSchema
};

/**
 * Registers the get-project-fields tool with the MCP server.
 */
export function registerGetProjectFieldsTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { owner, projectNumber } = args as {
                    owner: string;
                    projectNumber: number;
                };

                const { projectId, fields } = await getProjectFields(owner, projectNumber);

                // Format response with field details
                const formattedFields = fields.map((field) => ({
                    name: field.name,
                    id: field.id,
                    dataType: field.dataType,
                    ...(field.options && {
                        options: field.options.map((opt) => opt.name)
                    })
                }));

                return createSuccessResult({
                    projectId,
                    owner,
                    projectNumber,
                    fields: formattedFields,
                    totalFields: fields.length
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                // Check for common permission errors
                if (message.includes("Could not resolve to a") || message.includes("403")) {
                    return createPermissionError("access project fields");
                }

                return createErrorResult(message);
            }
        }
    );
}
