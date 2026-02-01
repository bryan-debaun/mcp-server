import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListRatingsInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "list-ratings";
const config = {
    title: "List Ratings",
    description: "List ratings with optional filters (book, user) (public)",
    inputSchema: ListRatingsInputSchema
};

export function registerListRatingsTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { bookId, userId, limit = 50, offset = 0 } = args;

                const where: any = {};

                if (bookId !== undefined) where.bookId = bookId;
                if (userId !== undefined) where.userId = userId;

                const ratings = await prisma.rating.findMany({
                    where,
                    take: limit,
                    skip: offset,
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
                    },
                    orderBy: {
                        createdAt: 'desc'
                    }
                });

                return createSuccessResult({
                    ratings,
                    total: ratings.length,
                    limit,
                    offset
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
