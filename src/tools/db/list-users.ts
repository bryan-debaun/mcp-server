import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListUsersInputSchema } from "./schemas.js";
import { prisma } from "../../db/index.js";
import { createSuccessResult, createErrorResult } from "../github-issues/results.js";

const name = "list-users";
const config = {
    title: "List Users",
    description: "List users in the database",
    inputSchema: ListUsersInputSchema
};

export function registerListUsersTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (_args: any): Promise<CallToolResult> => {
            try {
                const users = await prisma.profile.findMany({ include: { role: true } });
                return createSuccessResult(users);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
