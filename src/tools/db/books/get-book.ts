import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetBookInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";
import { statusLabel } from "./status.js";

const name = "get-book";
const config = {
    title: "Get Book",
    description: "Get a book by ID with authors and ratings summary (public)",
    inputSchema: GetBookInputSchema
};

export function registerGetBookTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args;

                const book = await prisma.book.findUnique({
                    where: { id },
                    include: {
                        authors: {
                            include: {
                                author: true
                            }
                        }
                    }
                });

                if (!book) {
                    return createErrorResult("Book not found");
                }

                // Return book with embedded rating fields and formatted authors
                return createSuccessResult({
                    ...book,
                    authors: book.authors.map((ba: any) => ba.author),
                    statusLabel: statusLabel(book.status)
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
