import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { DeleteBookInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "delete-book";
const config = {
    title: "Delete Book",
    description: "Delete a book (cascades to ratings and author associations) (admin only)",
    inputSchema: DeleteBookInputSchema
};

export function registerDeleteBookTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args;

                const book = await prisma.book.delete({
                    where: { id }
                });

                return createSuccessResult({ message: "Book deleted successfully", book });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
