import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ListContentCreatorsInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "list-content-creators";
const config = {
    title: "List ContentCreators",
    description: "List content creators with optional filters (public)",
    inputSchema: ListContentCreatorsInputSchema
};

export function registerListContentCreatorsTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { search, limit = 50, offset = 0 } = args;

                const where: any = {};
                if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }];

                const creators = await prisma.contentCreator.findMany({ where, take: limit, skip: offset, orderBy: { createdAt: 'desc' } });
                return createSuccessResult({ creators, total: creators.length, limit, offset });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}