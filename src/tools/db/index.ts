import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
// Article tools
import {
    registerCreateArticleTool,
    registerDeleteArticleTool,
    registerGetArticleTool,
    registerListArticlesTool,
    registerUpdateArticleTool,
} from './articles/index.js'
// Author tools
import {
    registerCreateAuthorTool,
    registerDeleteAuthorTool,
    registerGetAuthorTool,
    registerListAuthorsTool,
    registerUpdateAuthorTool,
} from './authors/index.js'
// Bet tools (sports-betting tracker)
import {
    registerBetAnalyticsTool,
    registerCreateBetTool,
    registerDeleteBetTool,
    registerGetBetTool,
    registerListBetsTool,
    registerSettleBetTool,
    registerUpdateBetTool,
} from './bets/index.js'
// Book tools
import {
    registerCreateBookTool,
    registerDeleteBookTool,
    registerGetBookTool,
    registerListBooksTool,
    registerUpdateBookTool,
} from './books/index.js'
// ContentCreator tools
import {
    registerCreateContentCreatorTool,
    registerDeleteContentCreatorTool,
    registerGetContentCreatorTool,
    registerListContentCreatorsTool,
    registerUpdateContentCreatorTool,
} from './content-creators/index.js'
import { registerGetUserTool } from './get-user.js'
import { registerListUsersTool } from './list-users.js'
// Movie tools
import {
    registerCreateMovieTool,
    registerDeleteMovieTool,
    registerGetMovieTool,
    registerListMoviesTool,
    registerUpdateMovieTool,
} from './movies/index.js'
// VideoGame tools
import {
    registerCreateVideoGameTool,
    registerDeleteVideoGameTool,
    registerGetVideoGameTool,
    registerListVideoGamesTool,
    registerUpdateVideoGameTool,
} from './videogames/index.js'

export function registerDbTools(server: McpServer): void {
    // User tools
    registerListUsersTool(server)
    registerGetUserTool(server)

    // Book tools
    registerCreateBookTool(server)
    registerUpdateBookTool(server)
    registerDeleteBookTool(server)
    registerGetBookTool(server)
    registerListBooksTool(server)

    // Author tools
    registerCreateAuthorTool(server)
    registerUpdateAuthorTool(server)
    registerDeleteAuthorTool(server)
    registerGetAuthorTool(server)
    registerListAuthorsTool(server)

    // Movie tools
    registerCreateMovieTool(server)
    registerUpdateMovieTool(server)
    registerDeleteMovieTool(server)
    registerGetMovieTool(server)
    registerListMoviesTool(server)

    // VideoGame tools
    registerCreateVideoGameTool(server)
    registerGetVideoGameTool(server)
    registerListVideoGamesTool(server)
    registerUpdateVideoGameTool(server)
    registerDeleteVideoGameTool(server)

    // ContentCreator tools
    registerCreateContentCreatorTool(server)
    registerGetContentCreatorTool(server)
    registerListContentCreatorsTool(server)
    registerUpdateContentCreatorTool(server)
    registerDeleteContentCreatorTool(server)

    // Article tools
    registerCreateArticleTool(server)
    registerUpdateArticleTool(server)
    registerDeleteArticleTool(server)
    registerGetArticleTool(server)
    registerListArticlesTool(server)

    // Bet tools (sports-betting tracker)
    registerCreateBetTool(server)
    registerUpdateBetTool(server)
    registerGetBetTool(server)
    registerListBetsTool(server)
    registerDeleteBetTool(server)
    registerSettleBetTool(server)
    registerBetAnalyticsTool(server)
}
