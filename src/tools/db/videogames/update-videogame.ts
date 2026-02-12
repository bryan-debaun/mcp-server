import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpdateVideoGameInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { normalizeStatusInput, statusLabel } from "../books/status.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "update-videogame";
const config = {
    title: "Update VideoGame",
    description: "Update an existing video game (admin only)",
    inputSchema: UpdateVideoGameInputSchema
};

export function registerUpdateVideoGameTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, title, description, platform, igdbId, releasedAt, status } = args;
                const data: any = {};
                if (title !== undefined) data.title = title;
                if (description !== undefined) data.description = description;
                if (platform !== undefined) data.platform = platform;
                if (igdbId !== undefined) data.igdbId = igdbId;
                if (releasedAt !== undefined) data.releasedAt = releasedAt ? new Date(releasedAt) : null;
                if (status !== undefined) data.status = normalizeStatusInput(status);

                const game = await prisma.videoGame.update({ where: { id }, data });
                return createSuccessResult({ ...game, statusLabel: statusLabel(game.status) });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}