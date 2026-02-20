import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateBookInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { normalizeStatusInput, statusLabel } from "./status.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "create-book";
const config = {
    title: "Create Book",
    description: "Create a new book with optional author associations (admin only)",
    inputSchema: CreateBookInputSchema
};

export function registerCreateBookTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { title, description, isbn, publishedAt, authorIds, status, rating, review } = args;
                const normalizedStatus = normalizeStatusInput(status);

                // Validate rating if provided
                if (rating !== undefined && (rating < 1 || rating > 10)) {
                    return createErrorResult("Rating must be between 1 and 10");
                }

                const book = await prisma.book.create({
                    data: {
                        title,
                        description,
                        isbn,
                        publishedAt: publishedAt ? new Date(publishedAt) : null,
                        status: normalizedStatus,
                        rating: rating !== undefined ? rating : null,
                        review: review || null,
                        ratedAt: rating !== undefined ? new Date() : null,
                        authors: authorIds ? {
                            create: authorIds.map((authorId: number) => ({
                                authorId
                            }))
                        } : undefined
                    },
                    include: {
                        authors: {
                            include: {
                                author: true
                            }
                        }
                    }
                });

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
