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
 * Creates an error tool result.
 */
export function createErrorResult(message: string): CallToolResult {
    return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true
    };
}
