import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpdateBookInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "update-book";
const config = {
    title: "Update Book",
    description: "Update an existing book's details and/or author associations (admin only)",
    inputSchema: UpdateBookInputSchema
};

export function registerUpdateBookTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, title, description, isbn, publishedAt, authorIds } = args;

                // Build update data
                const updateData: any = {};
                if (title !== undefined) updateData.title = title;
                if (description !== undefined) updateData.description = description;
                if (isbn !== undefined) updateData.isbn = isbn;
                if (publishedAt !== undefined) {
                    updateData.publishedAt = publishedAt ? new Date(publishedAt) : null;
                }

                // Handle author associations if provided
                if (authorIds !== undefined) {
                    // Delete existing associations and create new ones
                    await prisma.bookAuthor.deleteMany({ where: { bookId: id } });
                    updateData.authors = {
                        create: authorIds.map((authorId: number) => ({
                            authorId
                        }))
                    };
                }

                const book = await prisma.book.update({
                    where: { id },
                    data: updateData,
                    include: {
                        authors: {
                            include: {
                                author: true
                            }
                        },
                        creator: true
                    }
                });

                return createSuccessResult(book);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
