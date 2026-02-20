import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Creates a successful tool result with text content.
 */
export function createSuccessResult(data: unknown): CallToolResult {
    const text = typeof data === "string"
        ? data
        : JSON.stringify(data, null, 2);

    return {
        content: [{ type: "text", text }]
    };
}

/**
 * Creates an error tool result with actionable feedback.
 */
export function createErrorResult(message: string, context?: Record<string, unknown>): CallToolResult {
    let errorText = `Error: ${message}`;

    if (context) {
        errorText += `\n\nContext: ${JSON.stringify(context, null, 2)}`;
    }

    return {
        content: [{ type: "text", text: errorText }],
        isError: true
    };
}

/**
 * Creates an error result for permission issues
 */
export function createPermissionError(operation: string): CallToolResult {
    return createErrorResult(
        `Permission denied: Unable to ${operation}.`,
        {
            suggestion: "Ensure your GitHub token has 'project' scope permissions.",
            howToFix: "Run 'gh auth refresh -s project' to add project permissions to your token."
        }
    );
}

/**
 * Creates an error result for field not found
 */
export function createFieldNotFoundError(
    fieldName: string,
    availableFields: string[]
): CallToolResult {
    return createErrorResult(
        `Field '${fieldName}' not found in project.`,
        {
            availableFields,
            suggestion: `Use one of the available fields or create a new field with 'create-project-field'.`
        }
    );
}

/**
 * Creates an error result for option not found in SINGLE_SELECT field
 */
export function createOptionNotFoundError(
    optionName: string,
    fieldName: string,
    availableOptions: string[]
): CallToolResult {
    return createErrorResult(
        `Option '${optionName}' not found for field '${fieldName}'.`,
        {
            availableOptions,
            suggestion: `Use one of the available options or update the field to add new options.`
        }
    );
}
