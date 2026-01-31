import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateInviteTool } from "./create-invite.js";
import { registerAcceptInviteTool } from "./accept-invite.js";

export function registerDbTools(server: McpServer): void {
    registerCreateInviteTool(server);
    registerAcceptInviteTool(server);
    // Future read-only tools (list-users, get-user, list-invites, list-audit-logs) will be added here
}
