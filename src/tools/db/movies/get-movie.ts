import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetMovieInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "get-movie";
const config = {
    title: "Get Movie",
    description: "Get a movie by ID (public)",
    inputSchema: GetMovieInputSchema
};

export function registerGetMovieTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args;
                const movie = await prisma.movie.findUnique({ where: { id } });
                if (!movie) return createErrorResult('Movie not found');
                return createSuccessResult(movie);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}