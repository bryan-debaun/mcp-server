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
// Movie tools
import {
    registerCreateMovieTool,
    registerUpdateMovieTool,
    registerDeleteMovieTool,
    registerGetMovieTool,
    registerListMoviesTool
} from "./movies/index.js";

// VideoGame tools
import {
    registerCreateVideoGameTool,
    registerGetVideoGameTool,
    registerListVideoGamesTool,
    registerUpdateVideoGameTool,
    registerDeleteVideoGameTool
} from "./videogames/index.js";

// ContentCreator tools
import {
    registerCreateContentCreatorTool,
    registerGetContentCreatorTool,
    registerListContentCreatorsTool,
    registerUpdateContentCreatorTool,
    registerDeleteContentCreatorTool
} from "./content-creators/index.js";

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

    // Movie tools
    registerCreateMovieTool(server);
    registerUpdateMovieTool(server);
    registerDeleteMovieTool(server);
    registerGetMovieTool(server);
    registerListMoviesTool(server);

    // VideoGame tools
    registerCreateVideoGameTool(server);
    registerGetVideoGameTool(server);
    registerListVideoGamesTool(server);
    registerUpdateVideoGameTool(server);
    registerDeleteVideoGameTool(server);

    // ContentCreator tools
    registerCreateContentCreatorTool(server);
    registerGetContentCreatorTool(server);
    registerListContentCreatorsTool(server);
    registerUpdateContentCreatorTool(server);
    registerDeleteContentCreatorTool(server);

    // Rating tools
    registerCreateOrUpdateRatingTool(server);
    registerDeleteRatingTool(server);
    registerListRatingsTool(server);
}
