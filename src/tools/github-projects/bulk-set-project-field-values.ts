import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { BulkSetProjectFieldValuesInputSchema } from "./schemas.js";
import {
    getProjectFields,
    getIssueNodeId,
    addIssueToProject,
    updateProjectFieldValue
} from "./graphql.js";
import {
    createSuccessResult,
    createErrorResult,
    createPermissionError
} from "./results.js";

const name = "bulk-set-project-field-values";
const config = {
    title: "Bulk Set Project Field Values",
    description: "Set multiple custom field values for multiple GitHub Project V2 items in one operation",
    inputSchema: BulkSetProjectFieldValuesInputSchema
};

interface UpdateResult {
    issueNumber: number;
    success: boolean;
    fieldsUpdated?: string[];
    error?: string;
}

/**
 * Registers the bulk-set-project-field-values tool with the MCP server.
 */
export function registerBulkSetProjectFieldValuesTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { owner, repo, projectNumber, updates } = args as {
                    owner: string;
                    repo: string;
                    projectNumber: number;
                    updates: Array<{
                        issueNumber: number;
                        fields: Record<string, string | number>;
                    }>;
                };

                // Get project metadata once (cached)
                const { projectId, fields: projectFields } = await getProjectFields(
                    owner,
                    projectNumber
                );

                const results: UpdateResult[] = [];

                // Process each issue
                for (const update of updates) {
                    try {
                        const { issueNumber, fields: fieldUpdates } = update;

                        // Get issue node ID
                        const issueNodeId = await getIssueNodeId(owner, repo, issueNumber);

                        // Add issue to project
                        const itemId = await addIssueToProject(projectId, issueNodeId);

                        // Update each field
                        const updatedFields: string[] = [];
                        for (const [fieldName, value] of Object.entries(fieldUpdates)) {
                            const field = projectFields.find((f) => f.name === fieldName);

                            if (!field) {
                                throw new Error(
                                    `Field '${fieldName}' not found. Available fields: ${projectFields
                                        .map((f) => f.name)
                                        .join(", ")}`
                                );
                            }

                            // Resolve SINGLE_SELECT option
                            let resolvedValue: string | number = value;
                            if (field.dataType === "SINGLE_SELECT") {
                                if (!field.options) {
                                    throw new Error(
                                        `Field '${fieldName}' is SINGLE_SELECT but has no options`
                                    );
                                }

                                const option = field.options.find(
                                    (opt) => opt.name === String(value)
                                );
                                if (!option) {
                                    throw new Error(
                                        `Option '${value}' not found for field '${fieldName}'. Available options: ${field.options
                                            .map((opt) => opt.name)
                                            .join(", ")}`
                                    );
                                }

                                resolvedValue = option.id;
                            }

                            // Update field value
                            await updateProjectFieldValue(
                                projectId,
                                itemId,
                                field.id,
                                resolvedValue,
                                field.dataType
                            );

                            updatedFields.push(fieldName);
                        }

                        results.push({
                            issueNumber,
                            success: true,
                            fieldsUpdated: updatedFields
                        });
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        results.push({
                            issueNumber: update.issueNumber,
                            success: false,
                            error: message
                        });
                    }
                }

                // Summarize results
                const successful = results.filter((r) => r.success).length;
                const failed = results.filter((r) => !r.success).length;

                return createSuccessResult({
                    message: `Bulk update completed: ${successful} successful, ${failed} failed`,
                    owner,
                    repo,
                    projectNumber,
                    totalUpdates: updates.length,
                    successful,
                    failed,
                    results
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);

                // Check for permission errors
                if (
                    message.includes("Could not resolve to a") ||
                    message.includes("403") ||
                    message.includes("permission")
                ) {
                    return createPermissionError("bulk set project field values");
                }

                return createErrorResult(message);
            }
        }
    );
}
