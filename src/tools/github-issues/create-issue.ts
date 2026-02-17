import fs from "fs";
import os from "os";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateIssueInputSchema } from "./schemas.js";
import { runGhCommand } from "./gh-cli.js";
import { createSuccessResult, createErrorResult } from "./results.js";
import { jsonToMarkdown } from "./json-to-markdown.js";
import { ensureLabelsExist } from "./label-helper.js";

const name = "create-issue";
const config = {
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
        config,
        async (args: any): Promise<CallToolResult> => {
            let tempFile: string | undefined;

            try {
                const { repo, title, body, bodyFile, bodyJson, labels } = args as {
                    repo: string;
                    title: string;
                    body?: string;
                    bodyFile?: string;
                    bodyJson?: any;
                    labels?: string;
                };

                const ghArgs = [
                    "issue", "create",
                    "--repo", repo,
                    "--title", `"${title.replace(/"/g, '\\"')}"`
                ];

                // Ensure labels exist before attempting to assign them
                if (labels) {
                    const requested = labels.split(",").map(s => s.trim()).filter(Boolean);
                    await ensureLabelsExist(repo, requested);
                }

                // Determine how to provide the body to gh: prefer file when multi-line, when
                // `bodyFile` is provided, or when caller passed `bodyJson`.
                if (bodyFile) {
                    ghArgs.push("--body-file", bodyFile);
                } else if (bodyJson !== undefined) {
                    const md = jsonToMarkdown(bodyJson);
                    tempFile = path.join(os.tmpdir(), `mcp-issue-body-${Date.now()}.md`);
                    fs.writeFileSync(tempFile, md, "utf8");
                    ghArgs.push("--body-file", tempFile);
                } else if (body && body.includes("\n")) {
                    tempFile = path.join(os.tmpdir(), `mcp-issue-body-${Date.now()}.md`);
                    fs.writeFileSync(tempFile, body, "utf8");
                    ghArgs.push("--body-file", tempFile);
                } else if (body) {
                    ghArgs.push("--body", `"${body.replace(/"/g, '\\"')}"`);
                }

                if (labels) {
                    ghArgs.push("--label", labels);
                }

                const output = await runGhCommand(ghArgs);

                // gh issue create returns the URL of the created issue
                const issueUrl = output.trim();
                const issueNumber = issueUrl.split("/").pop();

                return createSuccessResult({
                    message: `Issue #${issueNumber} created successfully`,
                    url: issueUrl,
                    title: title
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
