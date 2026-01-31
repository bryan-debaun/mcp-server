import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateInviteInputSchema } from "./schemas.js";
import { createInvite } from "../../services/admin-service.js";
import { createSuccessResult, createErrorResult } from "../github-issues/results.js";

const name = "create-invite";
const config = {
    title: "Create Invite",
    description: "Create an invite for a user by email",
    inputSchema: CreateInviteInputSchema
};

export function registerCreateInviteTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { email, invitedBy } = args as { email: string; invitedBy?: number };
                const invite = await createInvite(email, invitedBy);
                return createSuccessResult(invite);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
