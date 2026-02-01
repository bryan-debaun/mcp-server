import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCreateInviteTool } from "./create-invite.js";
import { registerAcceptInviteTool } from "./accept-invite.js";
import { registerListUsersTool } from "./list-users.js";
import { registerGetUserTool } from "./get-user.js";
import { registerListInvitesTool } from "./list-invites.js";
import { registerListAuditLogsTool } from "./list-audit-logs.js";
// Book tools
import {
    registerCreateBookTool,
    registerUpdateBookTool,
    registerDeleteBookTool,
    registerGetBookTool,
    registerListBooksTool
} from "./books/index.js";
// Author tools
import {
    registerCreateAuthorTool,
    registerUpdateAuthorTool,
    registerDeleteAuthorTool,
    registerGetAuthorTool,
    registerListAuthorsTool
} from "./authors/index.js";
// Rating tools
import {
    registerCreateOrUpdateRatingTool,
    registerDeleteRatingTool,
    registerListRatingsTool
} from "./ratings/index.js";

export function registerDbTools(server: McpServer): void {
    registerCreateInviteTool(server);
    registerAcceptInviteTool(server);
    // Read-only tools
    registerListUsersTool(server);
    registerGetUserTool(server);
    registerListInvitesTool(server);
    registerListAuditLogsTool(server);

    // Book tools
    registerCreateBookTool(server);
    registerUpdateBookTool(server);
    registerDeleteBookTool(server);
    registerGetBookTool(server);
    registerListBooksTool(server);

    // Author tools
    registerCreateAuthorTool(server);
    registerUpdateAuthorTool(server);
    registerDeleteAuthorTool(server);
    registerGetAuthorTool(server);
    registerListAuthorsTool(server);

    // Rating tools
    registerCreateOrUpdateRatingTool(server);
    registerDeleteRatingTool(server);
    registerListRatingsTool(server);
}
