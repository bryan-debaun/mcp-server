import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpdateAuthorInputSchema } from "./schemas.js";
import { prisma } from "../../../db/index.js";
import { createSuccessResult, createErrorResult } from "../../github-issues/results.js";

const name = "update-author";
const config = {
    title: "Update Author",
    description: "Update an existing author's details (admin only)",
    inputSchema: UpdateAuthorInputSchema
};

export function registerUpdateAuthorTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { id, name, bio, website } = args;

                const updateData: any = {};
                if (name !== undefined) updateData.name = name;
                if (bio !== undefined) updateData.bio = bio;
                if (website !== undefined) updateData.website = website;

                const author = await prisma.author.update({
                    where: { id },
                    data: updateData,
                    include: {
                        creator: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        },
                        books: {
                            include: {
                                book: true
                            }
                        }
                    }
                });

                return createSuccessResult(author);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
