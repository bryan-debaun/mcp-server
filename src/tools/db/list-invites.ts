import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListInvitesInputSchema } from "./schemas.js";
import { prisma } from "../../db/index.js";
import { createSuccessResult, createErrorResult } from "../github-issues/results.js";

const name = "db/list-invites";
const config = {
    title: "List Invites",
    description: "List invites in the database",
    inputSchema: ListInvitesInputSchema
};

export function registerListInvitesTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (_args: any): Promise<CallToolResult> => {
            try {
                const invites = await prisma.invite.findMany({ orderBy: { createdAt: 'desc' } });
                return createSuccessResult(invites);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
