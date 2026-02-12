import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateMovieInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { normalizeStatusInput, statusLabel } from "../books/status.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "create-movie";
const config = {
    title: "Create Movie",
    description: "Create a new movie (admin only)",
    inputSchema: CreateMovieInputSchema
};

export function registerCreateMovieTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { title, description, iasn, imdbId, releasedAt, createdBy, status } = args;
                const normalizedStatus = normalizeStatusInput(status);

                const movie = await prisma.movie.create({
                    data: {
                        title,
                        description,
                        iasn,
                        imdbId,
                        releasedAt: releasedAt ? new Date(releasedAt) : null,
                        createdBy,
                        status: normalizedStatus
                    }
                });

                return createSuccessResult({ ...movie, statusLabel: statusLabel(movie.status) });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}