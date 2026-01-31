import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateInviteTool } from "./create-invite.js";
import { registerAcceptInviteTool } from "./accept-invite.js";
import { registerListUsersTool } from "./list-users.js";
import { registerGetUserTool } from "./get-user.js";
import { registerListInvitesTool } from "./list-invites.js";
import { registerListAuditLogsTool } from "./list-audit-logs.js";

export function registerDbTools(server: McpServer): void {
    registerCreateInviteTool(server);
    registerAcceptInviteTool(server);
    // Read-only tools
    registerListUsersTool(server);
    registerGetUserTool(server);
    registerListInvitesTool(server);
    registerListAuditLogsTool(server);
}
