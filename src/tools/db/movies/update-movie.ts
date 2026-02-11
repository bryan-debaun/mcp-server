import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpdateMovieInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { normalizeStatusInput, statusLabel } from "../books/status.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "update-movie";
const config = {
    title: "Update Movie",
    description: "Update an existing movie (admin only)",
    inputSchema: UpdateMovieInputSchema
};

export function registerUpdateMovieTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, title, description, iasn, imdbId, releasedAt, status } = args;
                const data: any = {};
                if (title !== undefined) data.title = title;
                if (description !== undefined) data.description = description;
                if (iasn !== undefined) data.iasn = iasn;
                if (imdbId !== undefined) data.imdbId = imdbId;
                if (releasedAt !== undefined) data.releasedAt = releasedAt ? new Date(releasedAt) : null;
                if (status !== undefined) data.status = normalizeStatusInput(status);

                const movie = await prisma.movie.update({ where: { id }, data });
                return createSuccessResult({ ...movie, statusLabel: statusLabel(movie.status) });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}