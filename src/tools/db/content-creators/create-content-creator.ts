import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateContentCreatorInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "create-content-creator";
const config = {
    title: "Create ContentCreator",
    description: "Create a new content creator (admin only)",
    inputSchema: CreateContentCreatorInputSchema
};

export function registerCreateContentCreatorTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { name, description, website, createdBy } = args;

                const cc = await prisma.contentCreator.create({
                    data: {
                        name,
                        description,
                        website,
                        createdBy
                    }
                });

                return createSuccessResult(cc);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}