import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SetProjectFieldValueInputSchema } from "./schemas.js";
import {
    getProjectFields,
    getIssueNodeId,
    addIssueToProject,
    updateProjectFieldValue
} from "./graphql.js";
import {
    createSuccessResult,
    createErrorResult,
    createPermissionError,
    createFieldNotFoundError,
    createOptionNotFoundError
} from "./results.js";

const name = "set-project-field-value";
const config = {
    title: "Set Project Field Value",
    description: "Set a custom field value on a GitHub Project V2 item (issue or PR)",
    inputSchema: SetProjectFieldValueInputSchema
};

/**
 * Registers the set-project-field-value tool with the MCP server.
 */
export function registerSetProjectFieldValueTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { owner, repo, projectNumber, issueNumber, fieldName, value } = args as {
                    owner: string;
                    repo: string;
                    projectNumber: number;
                    issueNumber: number;
                    fieldName: string;
                    value: string | number;
                };

                // Step 1: Get project metadata and find the field
                const { projectId, fields } = await getProjectFields(owner, projectNumber);
                const field = fields.find((f) => f.name === fieldName);

                if (!field) {
                    return createFieldNotFoundError(
                        fieldName,
                        fields.map((f) => f.name)
                    );
                }

                // Step 2: For SINGLE_SELECT fields, resolve option name to ID
                let resolvedValue: string | number = value;
                if (field.dataType === "SINGLE_SELECT") {
                    if (!field.options) {
                        return createErrorResult(
                            `Field '${fieldName}' is SINGLE_SELECT but has no options defined.`
                        );
                    }

                    const option = field.options.find((opt) => opt.name === String(value));
                    if (!option) {
                        return createOptionNotFoundError(
                            String(value),
                            fieldName,
                            field.options.map((opt) => opt.name)
                        );
                    }

                    resolvedValue = option.id;
                }

                // Step 3: Get issue node ID
                const issueNodeId = await getIssueNodeId(owner, repo, issueNumber);

                // Step 4: Add issue to project (idempotent - GitHub handles duplicates)
                const itemId = await addIssueToProject(projectId, issueNodeId);

                // Step 5: Update the field value
                await updateProjectFieldValue(
                    projectId,
                    itemId,
                    field.id,
                    resolvedValue,
                    field.dataType
                );

                return createSuccessResult({
                    message: `Successfully set field '${fieldName}' to '${value}' for issue #${issueNumber}`,
                    owner,
                    repo,
                    projectNumber,
                    issueNumber,
                    fieldName,
                    value,
                    fieldType: field.dataType
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                // Check for permission errors
                if (
                    message.includes("Could not resolve to a") ||
                    message.includes("403") ||
                    message.includes("permission")
                ) {
                    return createPermissionError("set project field values");
                }

                return createErrorResult(message);
            }
        }
    );
}
