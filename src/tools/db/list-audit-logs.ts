import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListAuditLogsInputSchema } from "./schemas.js";
import { prisma } from "../../db/index.js";
import { createSuccessResult, createErrorResult } from "../github-issues/results.js";

const name = "list-audit-logs";
const config = {
    title: "List Audit Logs",
    description: "List audit logs",
    inputSchema: ListAuditLogsInputSchema
};

export function registerListAuditLogsTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { limit } = args as { limit?: number };
                const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit || 50 });
                return createSuccessResult(logs);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
