import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListMoviesInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "list-movies";
const config = {
    title: "List Movies",
    description: "List movies with optional filters (public)",
    inputSchema: ListMoviesInputSchema
};

export function registerListMoviesTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { minRating, search, status, limit = 50, offset = 0 } = args;

                const where: any = {};
                if (status) where.status = status;
                if (search) where.OR = [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }];
                if (minRating !== undefined) where.averageRating = { gte: minRating };

                const movies = await prisma.movie.findMany({
                    where,
                    take: limit,
                    skip: offset,
                    orderBy: { createdAt: 'desc' }
                });

                return createSuccessResult({ movies, total: movies.length, limit, offset });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}