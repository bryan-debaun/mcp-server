import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateVideoGameInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { normalizeStatusInput, statusLabel } from "../books/status.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "create-videogame";
const config = {
    title: "Create VideoGame",
    description: "Create a new video game (admin only)",
    inputSchema: CreateVideoGameInputSchema
};

export function registerCreateVideoGameTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { title, description, platform, igdbId, releasedAt, status } = args;
                const normalizedStatus = normalizeStatusInput(status);

                const game = await prisma.videoGame.create({
                    data: {
                        title,
                        description,
                        platform,
                        igdbId,
                        releasedAt: releasedAt ? new Date(releasedAt) : null,
                        status: normalizedStatus
                    }
                });

                return createSuccessResult({ ...game, statusLabel: statusLabel(game.status) });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}