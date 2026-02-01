import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateOrUpdateRatingInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "create-or-update-rating";
const config = {
    title: "Create or Update Rating",
    description: "Create a new rating or update existing rating for a book (authenticated users)",
    inputSchema: CreateOrUpdateRatingInputSchema
};

export function registerCreateOrUpdateRatingTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { bookId, userId, rating, review } = args;

                // Validate rating range
                if (rating < 1 || rating > 10) {
                    return createErrorResult("Rating must be between 1 and 10");
                }

                // Use upsert to create or update
                const ratingRecord = await prisma.rating.upsert({
                    where: {
                        bookId_userId: {
                            bookId,
                            userId
                        }
                    },
                    create: {
                        bookId,
                        userId,
                        rating,
                        review
                    },
                    update: {
                        rating,
                        review
                    },
                    include: {
                        book: {
                            select: {
                                id: true,
                                title: true
                            }
                        },
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                });

                return createSuccessResult(ratingRecord);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
