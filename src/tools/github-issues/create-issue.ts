import fs from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateIssueInputSchema } from "./schemas.js";
import { createOctokitClient, parseRepo } from "./octokit.js";
import { createSuccessResult, createErrorResult } from "./results.js";
import { jsonToMarkdown } from "./json-to-markdown.js";
import { ensureLabelsExist } from "./label-helper.js";

const name = "create-issue";
const toolConfig = {
    title: "Create Issue",
    description: "Create a new GitHub issue with title, body (Markdown allowed), file, or JSON payload",
    inputSchema: CreateIssueInputSchema
};

/**
 * Registers the create-issue tool with the MCP server.
 */
export function registerCreateIssueTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        toolConfig,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { repo, title, body, bodyFile, bodyJson, labels, assignees, milestone } = args as {
                    repo: string;
                    title: string;
                    body?: string;
                    bodyFile?: string;
                    bodyJson?: any;
                    labels?: string;
                    assignees?: string;
                    milestone?: number;
                };

                const { owner, repo: repoName } = parseRepo(repo);
                const octokit = createOctokitClient();

                // Resolve body content
                let resolvedBody: string | undefined;
                if (bodyFile) {
                    resolvedBody = fs.readFileSync(bodyFile, "utf8");
                } else if (bodyJson !== undefined) {
                    resolvedBody = jsonToMarkdown(bodyJson);
                } else {
                    resolvedBody = body;
                }

                // Ensure labels exist before assigning
                if (labels) {
                    const requested = labels.split(",").map((s) => s.trim()).filter(Boolean);
                    await ensureLabelsExist(octokit, owner, repoName, requested);
                }

                const labelList = labels
                    ? labels.split(",").map((s) => s.trim()).filter(Boolean)
                    : undefined;
                const assigneeList = assignees
                    ? assignees.split(",").map((s) => s.trim()).filter(Boolean)
                    : undefined;

                const response = await octokit.rest.issues.create({
                    owner,
                    repo: repoName,
                    title,
                    body: resolvedBody,
                    labels: labelList,
                    assignees: assigneeList,
                    milestone: milestone,
                });

                const issue = response.data;
                return createSuccessResult({
                    message: `Issue #${issue.number} created successfully`,
                    url: issue.html_url,
                    number: issue.number,
                    title: issue.title,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
