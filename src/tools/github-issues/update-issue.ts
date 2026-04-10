import fs from "fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpdateIssueInputSchema } from "./schemas.js";
import { createOctokitClient, parseRepo } from "./octokit.js";
import { createSuccessResult, createErrorResult } from "./results.js";
import { jsonToMarkdown } from "./json-to-markdown.js";
import { ensureLabelsExist } from "./label-helper.js";

const name = "update-issue";
const toolConfig = {
    title: "Update Issue",
    description: "Update a GitHub issue's title, body, labels, assignees, milestone, state, or add a comment",
    inputSchema: UpdateIssueInputSchema
};

/**
 * Registers the update-issue tool with the MCP server.
 */
export function registerUpdateIssueTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        toolConfig,
        async (args: any): Promise<CallToolResult> => {
            try {
                const {
                    repo, issueNumber, title, body, bodyFile, bodyJson,
                    labels, removeLabels, assignees, milestone, state, stateReason, comment
                } = args as {
                    repo: string;
                    issueNumber: number;
                    title?: string;
                    body?: string;
                    bodyFile?: string;
                    bodyJson?: any;
                    labels?: string;
                    removeLabels?: string;
                    assignees?: string;
                    milestone?: number;
                    state?: "open" | "closed";
                    stateReason?: "completed" | "not_planned" | "reopened";
                    comment?: string;
                };

                const { owner, repo: repoName } = parseRepo(repo);
                const octokit = createOctokitClient();
                const updates: string[] = [];

                // Resolve body content
                let resolvedBody: string | undefined;
                if (bodyFile) {
                    resolvedBody = fs.readFileSync(bodyFile, "utf8");
                    updates.push("body");
                } else if (bodyJson !== undefined) {
                    resolvedBody = jsonToMarkdown(bodyJson);
                    updates.push("body");
                } else if (body !== undefined) {
                    resolvedBody = body;
                    updates.push("body");
                }

                if (title) updates.push("title");
                if (state) updates.push("state");
                if (milestone !== undefined) updates.push("milestone");

                // Ensure labels exist before adding
                if (labels) {
                    const requested = labels.split(",").map((s) => s.trim()).filter(Boolean);
                    await ensureLabelsExist(octokit, owner, repoName, requested);
                    updates.push("labels");
                }

                // Step 1: Update issue fields (title, body, state, milestone, assignees, stateReason)
                const hasIssueUpdate = title !== undefined || resolvedBody !== undefined ||
                    state !== undefined || milestone !== undefined || assignees !== undefined;

                if (hasIssueUpdate) {
                    await octokit.rest.issues.update({
                        owner,
                        repo: repoName,
                        issue_number: issueNumber,
                        ...(title !== undefined && { title }),
                        ...(resolvedBody !== undefined && { body: resolvedBody }),
                        ...(state !== undefined && { state }),
                        ...(state === "closed" && stateReason ? { state_reason: stateReason } : {}),
                        ...(milestone !== undefined && { milestone: milestone === 0 ? null : milestone }),
                        ...(assignees !== undefined && {
                            assignees: assignees.split(",").map((s) => s.trim()).filter(Boolean)
                        }),
                    });
                    if (assignees !== undefined) updates.push("assignees");
                }

                // Step 2: Add labels
                if (labels) {
                    const labelList = labels.split(",").map((s) => s.trim()).filter(Boolean);
                    await octokit.rest.issues.addLabels({ owner, repo: repoName, issue_number: issueNumber, labels: labelList });
                }

                // Step 3: Remove labels
                if (removeLabels) {
                    const toRemove = removeLabels.split(",").map((s) => s.trim()).filter(Boolean);
                    for (const label of toRemove) {
                        await octokit.rest.issues.removeLabel({ owner, repo: repoName, issue_number: issueNumber, name: label });
                    }
                    updates.push("removeLabels");
                }

                // Step 4: Add comment
                if (comment) {
                    await octokit.rest.issues.createComment({ owner, repo: repoName, issue_number: issueNumber, body: comment });
                    updates.push("comment added");
                }

                if (updates.length === 0) {
                    return createSuccessResult({ message: "No updates provided", issueNumber });
                }

                return createSuccessResult({
                    message: `Issue #${issueNumber} updated successfully`,
                    updates,
                    repository: repo,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
