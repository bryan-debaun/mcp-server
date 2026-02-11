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
                const { bookId, entityType: argEntityType, entityId: argEntityId, userId, limit = 50, offset = 0 } = args;

                // Build polymorphic where clause; support legacy bookId filter
                const where: any = {};
                if (argEntityType && argEntityId !== undefined) {
                    where.entityType = argEntityType;
                    where.entityId = argEntityId;
                } else if (bookId !== undefined) {
                    where.entityType = 'book';
                    where.entityId = bookId;
                }
                if (userId !== undefined) where.userId = userId;

                // Only include user in primary query; fetch parent entities in bulk afterwards
                const ratings = await prisma.rating.findMany({
                    where,
                    take: limit,
                    skip: offset,
                    include: {
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

                // Bulk fetch parent entities by type so we can attach minimal info
                const idsByType: Record<string, Set<number>> = {};
                for (const r of ratings) {
                    if (!r.entityType) continue;
                    idsByType[r.entityType] ??= new Set<number>();
                    idsByType[r.entityType].add(r.entityId);
                }

                const booksById: Record<number, any> = {};
                const moviesById: Record<number, any> = {};
                const gamesById: Record<number, any> = {};

                if (idsByType['book'] && idsByType['book'].size) {
                    const ids = Array.from(idsByType['book']);
                    const bs = await prisma.book.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
                    for (const b of bs) booksById[b.id] = b;
                }
                if (idsByType['movie'] && idsByType['movie'].size) {
                    const ids = Array.from(idsByType['movie']);
                    const ms = await prisma.movie.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
                    for (const m of ms) moviesById[m.id] = m;
                }
                if (idsByType['videogame'] && idsByType['videogame'].size) {
                    const ids = Array.from(idsByType['videogame']);
                    const gs = await prisma.videoGame.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, platform: true } });
                    for (const g of gs) gamesById[g.id] = g;
                }

                // Attach parent entity info for compatibility with existing API shapes
                const decorated = ratings.map((r: any) => {
                    const out = { ...r };
                    if (r.entityType === 'book') out.book = booksById[r.entityId] ?? null;
                    if (r.entityType === 'movie') out.movie = moviesById[r.entityId] ?? null;
                    if (r.entityType === 'videogame') out.videoGame = gamesById[r.entityId] ?? null;
                    return out;
                });

                return createSuccessResult({
                    ratings: decorated,
                    total: decorated.length,
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
