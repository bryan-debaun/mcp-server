import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateProjectFieldInputSchema } from "./schemas.js";
import { getProjectFields, createProjectField, clearProjectCache } from "./graphql.js";
import { createSuccessResult, createErrorResult, createPermissionError } from "./results.js";

const name = "create-project-field";
const config = {
    title: "Create Project Field",
    description: "Create a new custom field in a GitHub Project V2",
    inputSchema: CreateProjectFieldInputSchema
};

/**
 * Registers the create-project-field tool with the MCP server.
 */
export function registerCreateProjectFieldTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { owner, projectNumber, name: fieldName, dataType, options } = args as {
                    owner: string;
                    projectNumber: number;
                    name: string;
                    dataType: "TEXT" | "NUMBER" | "DATE" | "SINGLE_SELECT" | "ITERATION";
                    options?: string[];
                };

                // Validate SINGLE_SELECT requires options
                if (dataType === "SINGLE_SELECT" && (!options || options.length === 0)) {
                    return createErrorResult(
                        "SINGLE_SELECT fields require at least one option.",
                        { hint: "Provide options parameter with an array of option names" }
                    );
                }

                // Get project ID
                const { projectId } = await getProjectFields(owner, projectNumber);

                // Create the field
                const { fieldId } = await createProjectField(projectId, fieldName, dataType, options);

                // Clear cache to force refresh on next query
                clearProjectCache(owner, projectNumber);

                return createSuccessResult({
                    message: `Successfully created field '${fieldName}' of type ${dataType}`,
                    fieldId,
                    fieldName,
                    dataType,
                    ...(options && { options }),
                    owner,
                    projectNumber
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                // Check for permission errors
                if (
                    message.includes("Could not resolve to a") ||
                    message.includes("403") ||
                    message.includes("permission")
                ) {
                    return createPermissionError("create project fields");
                }

                return createErrorResult(message);
            }
        }
    );
}
