import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { AcceptInviteInputSchema } from "./schemas.js";
import { acceptInvite } from "../../services/admin-service.js";
import { createSuccessResult, createErrorResult } from "../github-issues/results.js";

const name = "accept-invite";
const config = {
    title: "Accept Invite",
    description: "Accept an invite token to create a user",
    inputSchema: AcceptInviteInputSchema
};

export function registerAcceptInviteTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { token, name: displayName, password } = args as { token: string; name?: string; password?: string };
                const user = await acceptInvite(token, { name: displayName, password });
                return createSuccessResult(user);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
