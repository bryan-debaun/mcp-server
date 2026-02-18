import fs from "fs";
import os from "os";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { UpdateIssueInputSchema } from "./schemas.js";
import { runGhCommand } from "./gh-cli.js";
import { createSuccessResult, createErrorResult } from "./results.js";
import { jsonToMarkdown } from "./json-to-markdown.js";
import { ensureLabelsExist } from "./label-helper.js";

const name = "update-issue";
const config = {
    title: "Update Issue",
    description: "Update a GitHub issue's title, body (Markdown allowed), labels, or add a comment",
    inputSchema: UpdateIssueInputSchema
};

/**
 * Registers the update-issue tool with the MCP server.
 */
export function registerUpdateIssueTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        config,
        async (args: any): Promise<CallToolResult> => {
            let tempFile: string | undefined;

            try {
                const { repo, issueNumber, title, body, bodyFile, bodyJson, labels, comment } = args as {
                    repo: string;
                    issueNumber: number;
                    title?: string;
                    body?: string;
                    bodyFile?: string;
                    bodyJson?: any;
                    labels?: string;
                    comment?: string;
                };

                const updates: string[] = [];

                // Update issue fields if provided
                if (title || body || labels || bodyFile || bodyJson) {
                    const editArgs = [
                        "issue", "edit",
                        String(issueNumber),
                        "--repo", repo
                    ];

                    if (title) {
                        editArgs.push("--title", `"${title.replace(/"/g, '\\"')}"`);
                        updates.push("title");
                    }

                    // Ensure labels exist before assigning
                    if (labels) {
                        const requested = labels.split(",").map(s => s.trim()).filter(Boolean);
                        await ensureLabelsExist(repo, requested);
                        editArgs.push("--add-label", labels);
                        updates.push("labels");
                    }

                    // Body handling: prefer file when provided / multi-line / JSON
                    if (bodyFile) {
                        editArgs.push("--body-file", bodyFile);
                        updates.push("body");
                    } else if (bodyJson !== undefined) {
                        const md = jsonToMarkdown(bodyJson);
                        tempFile = path.join(os.tmpdir(), `mcp-issue-body-${Date.now()}.md`);
                        fs.writeFileSync(tempFile, md, "utf8");
                        editArgs.push("--body-file", tempFile);
                        updates.push("body");
                    } else if (body && body.includes("\n")) {
                        tempFile = path.join(os.tmpdir(), `mcp-issue-body-${Date.now()}.md`);
                        fs.writeFileSync(tempFile, body, "utf8");
                        editArgs.push("--body-file", tempFile);
                        updates.push("body");
                    } else if (body) {
                        editArgs.push("--body", `"${body.replace(/"/g, '\\"')}"`);
                        updates.push("body");
                    }

                    await runGhCommand(editArgs);
                }

                // Add comment if provided. Use --body-file for multiline/large comments
                if (comment) {
                    if (comment.includes('\n') || comment.length > 1000) {
                        tempFile = path.join(os.tmpdir(), `mcp-issue-comment-${Date.now()}.md`);
                        fs.writeFileSync(tempFile, comment, 'utf8');

                        const commentArgs = [
                            "issue", "comment",
                            String(issueNumber),
                            "--repo", repo,
                            "--body-file", tempFile
                        ];

                        await runGhCommand(commentArgs);
                    } else {
                        const commentArgs = [
                            "issue", "comment",
                            String(issueNumber),
                            "--repo", repo,
                            "--body", `"${comment.replace(/"/g, '\\"')}"`
                        ];

                        await runGhCommand(commentArgs);
                    }

                    updates.push("comment added");
                }

                if (updates.length === 0) {
                    return createSuccessResult({
                        message: "No updates provided",
                        issueNumber: issueNumber
                    });
                }

                return createSuccessResult({
                    message: `Issue #${issueNumber} updated successfully`,
                    updates: updates,
                    repository: repo
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            } finally {
                if (tempFile) {
                    try { fs.unlinkSync(tempFile); } catch { /* ignore */ }
                }
            }
        }
    );
}
