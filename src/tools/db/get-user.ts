import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetUserInputSchema } from "./schemas.js";
import { prisma } from "../../db/index.js";
import { createSuccessResult, createErrorResult } from "../github-issues/results.js";

const name = "get-user";
const config = {
    title: "Get User",
    description: "Get a user by id or email",
    inputSchema: GetUserInputSchema
};

export function registerGetUserTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, email } = args as { id?: number; email?: string };
                if (!id && !email) throw new Error('id or email is required');
                const user = await prisma.user.findUnique({ where: id ? { id } : { email } as any, include: { role: true } });
                if (!user) throw new Error('user not found');
                return createSuccessResult(user);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
