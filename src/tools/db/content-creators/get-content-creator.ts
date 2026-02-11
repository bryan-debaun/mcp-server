import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { GetContentCreatorInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "get-content-creator";
const config = {
    title: "Get ContentCreator",
    description: "Get a content creator by ID (public)",
    inputSchema: GetContentCreatorInputSchema
};

export function registerGetContentCreatorTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id } = args;
                const cc = await prisma.contentCreator.findUnique({ where: { id } });
                if (!cc) return createErrorResult('ContentCreator not found');
                return createSuccessResult(cc);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}