import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerListUsersTool } from "./list-users.js";
import { registerGetUserTool } from "./get-user.js";
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

export function registerDbTools(server: McpServer): void {
    // User tools
    registerListUsersTool(server);
    registerGetUserTool(server);

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
}
