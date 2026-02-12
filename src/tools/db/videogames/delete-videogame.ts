import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DeleteVideoGameInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "delete-videogame";
const config = {
    title: "Delete VideoGame",
    description: "Delete a video game (admin only)",
    inputSchema: DeleteVideoGameInputSchema
};

export function registerDeleteVideoGameTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args;
                const game = await prisma.videoGame.delete({ where: { id } });
                return createSuccessResult({ message: "VideoGame deleted successfully", game });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}