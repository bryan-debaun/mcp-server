import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DeleteRatingInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "delete-rating";
const config = {
    title: "Delete Rating",
    description: "Delete a rating (owner or admin only)",
    inputSchema: DeleteRatingInputSchema
};

export function registerDeleteRatingTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args;

                const rating = await prisma.rating.delete({
                    where: { id }
                });

                return createSuccessResult({ message: "Rating deleted successfully", rating });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
