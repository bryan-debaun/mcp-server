import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListVideoGamesInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "list-videogames";
const config = {
    title: "List VideoGames",
    description: "List video games with optional filters (public)",
    inputSchema: ListVideoGamesInputSchema
};

export function registerListVideoGamesTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { platform, search, limit = 50, offset = 0 } = args;

                const where: any = {};
                if (platform) where.platform = platform;
                if (search) where.OR = [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }];

                const games = await prisma.videoGame.findMany({ where, take: limit, skip: offset, orderBy: { createdAt: 'desc' } });
                return createSuccessResult({ videoGames: games, total: games.length, limit, offset });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}