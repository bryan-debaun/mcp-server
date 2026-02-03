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
                const { title, description, isbn, publishedAt, authorIds, createdBy, status } = args;
                const normalizedStatus = normalizeStatusInput(status);

                const book = await prisma.book.create({
                    data: {
                        title,
                        description,
                        isbn,
                        publishedAt: publishedAt ? new Date(publishedAt) : null,
                        createdBy,
                        status: normalizedStatus,
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
                        },
                        creator: true
                    }
                });

                return createSuccessResult({ ...book, statusLabel: statusLabel(book.status) });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
