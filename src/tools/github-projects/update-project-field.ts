import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpdateProjectFieldInputSchema } from "./schemas.js";
import {
    getProjectFields,
    updateProjectFieldName,
    addFieldOptions,
    removeFieldOptions,
    clearProjectCache
} from "./graphql.js";
import {
    createSuccessResult,
    createErrorResult,
    createPermissionError,
    createFieldNotFoundError
} from "./results.js";

const name = "update-project-field";
const config = {
    title: "Update Project Field",
    description: "Update a custom field in a GitHub Project V2 (rename, add/remove options)",
    inputSchema: UpdateProjectFieldInputSchema
};

/**
 * Registers the update-project-field tool with the MCP server.
 */
export function registerUpdateProjectFieldTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { owner, projectNumber, fieldName, newName, addOptions, removeOptions } = args as {
                    owner: string;
                    projectNumber: number;
                    fieldName: string;
                    newName?: string;
                    addOptions?: string[];
                    removeOptions?: string[];
                };

                // Get project metadata and find the field
                const { projectId, fields } = await getProjectFields(owner, projectNumber);
                const field = fields.find((f) => f.name === fieldName);

                if (!field) {
                    return createFieldNotFoundError(
                        fieldName,
                        fields.map((f) => f.name)
                    );
                }

                const changes: string[] = [];

                // Rename field if requested
                if (newName) {
                    await updateProjectFieldName(projectId, field.id, newName);
                    changes.push(`renamed to '${newName}'`);
                }

                // Add options (only for SINGLE_SELECT)
                if (addOptions && addOptions.length > 0) {
                    if (field.dataType !== "SINGLE_SELECT") {
                        return createErrorResult(
                            `Cannot add options to field '${fieldName}' of type ${field.dataType}. Only SINGLE_SELECT fields support options.`
                        );
                    }

                    await addFieldOptions(projectId, field.id, addOptions);
                    changes.push(`added options: ${addOptions.join(", ")}`);
                }

                // Remove options (only for SINGLE_SELECT)
                if (removeOptions && removeOptions.length > 0) {
                    if (field.dataType !== "SINGLE_SELECT") {
                        return createErrorResult(
                            `Cannot remove options from field '${fieldName}' of type ${field.dataType}. Only SINGLE_SELECT fields support options.`
                        );
                    }

                    if (!field.options) {
                        return createErrorResult(`Field '${fieldName}' has no options to remove.`);
                    }

                    // Find option IDs by name
                    const optionIdsToRemove: string[] = [];
                    for (const optionName of removeOptions) {
                        const option = field.options.find((opt) => opt.name === optionName);
                        if (!option) {
                            return createErrorResult(
                                `Option '${optionName}' not found in field '${fieldName}'.`,
                                {
                                    availableOptions: field.options.map((opt) => opt.name)
                                }
                            );
                        }
                        optionIdsToRemove.push(option.id);
                    }

                    await removeFieldOptions(projectId, optionIdsToRemove);
                    changes.push(`removed options: ${removeOptions.join(", ")}`);
                }

                if (changes.length === 0) {
                    return createErrorResult(
                        "No changes specified. Provide newName, addOptions, or removeOptions."
                    );
                }

                // Clear cache to force refresh
                clearProjectCache(owner, projectNumber);

                return createSuccessResult({
                    message: `Successfully updated field '${fieldName}': ${changes.join(", ")}`,
                    fieldName,
                    changes,
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
                    return createPermissionError("update project fields");
                }

                return createErrorResult(message);
            }
        }
    );
}
