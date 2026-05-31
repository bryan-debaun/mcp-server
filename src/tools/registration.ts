import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ZodRawShape } from "zod";

/**
 * Configuration for an MCP tool — mirrors the shape the SDK's `registerTool`
 * accepts. `inputSchema` is a Zod raw shape (a plain object of Zod types).
 */
export interface ToolDefinition {
    title?: string;
    description: string;
    inputSchema?: ZodRawShape;
}

/** A tool handler: takes validated args, returns an MCP tool result. */
export type ToolHandler = (args: any) => Promise<CallToolResult>;

/**
 * Typed wrapper over `McpServer.registerTool`.
 *
 * The SDK's `registerTool` is heavily overloaded and its generic inference
 * fights a plain `ZodRawShape` config + loosely-typed handler, which is why
 * every tool previously called `(server as any).registerTool(...)`. This helper
 * centralizes that single cast so individual tools get full type-checking on
 * their `name`, `config`, and `handler` instead of opting out with `as any`.
 */
export function registerTool(
    server: McpServer,
    name: string,
    config: ToolDefinition,
    handler: ToolHandler,
): void {
    (server as any).registerTool(name, config, handler);
}
