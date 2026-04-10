import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { CreateIssueInProjectInputSchema } from "./schemas.js";
import { getProjectFields, getIssueNodeId, addIssueToProject, updateProjectFieldValue } from "./graphql.js";
import { createOctokitClient } from "../github-issues/octokit.js";
import { ensureLabelsExist } from "../github-issues/label-helper.js";
import { createSuccessResult, createErrorResult } from "./results.js";

const name = "create-issue-in-project";
const toolConfig = {
    title: "Create Issue in Project",
    description:
        "Atomically create a GitHub issue, add it to a Projects V2 board, and optionally set its Status column — all in one call. " +
        "Use get-project-status-options first to discover valid status values if needed.",
    inputSchema: CreateIssueInProjectInputSchema
};

/**
 * Registers the create-issue-in-project tool with the MCP server.
 */
export function registerCreateIssueInProjectTool(server: McpServer): void {
    (server as any).registerTool(
        name,
        toolConfig,
        async (args: any): Promise<CallToolResult> => {
            try {
                const { owner, repo, projectNumber, title, body, labels, status } = args as {
                    owner: string;
                    repo: string;
                    projectNumber: number;
                    title: string;
                    body?: string;
                    labels?: string;
                    status?: string;
                };

                const octokit = createOctokitClient();

                // Step 1: Ensure labels exist, then create the issue via REST
                const labelList = labels
                    ? labels.split(",").map((s) => s.trim()).filter(Boolean)
                    : undefined;

                if (labelList && labelList.length > 0) {
                    await ensureLabelsExist(octokit, owner, repo, labelList);
                }

                const issueResponse = await octokit.rest.issues.create({
                    owner,
                    repo,
                    title,
                    body,
                    labels: labelList,
                });

                const issue = issueResponse.data;

                // Step 2: Get project metadata (fields + projectId) and issue node ID in parallel
                const [{ projectId, fields }, issueNodeId] = await Promise.all([
                    getProjectFields(owner, projectNumber),
                    getIssueNodeId(owner, repo, issue.number),
                ]);

                // Step 3: Add issue to project
                const itemId = await addIssueToProject(projectId, issueNodeId);

                // Step 4: Set Status field if requested
                let statusSet: string | null = null;
                if (status) {
                    const statusField = fields.find(
                        (f) => f.name === "Status" && f.dataType === "SINGLE_SELECT"
                    );
                    if (!statusField) {
                        // Issue is already on the board — just warn, don't fail
                        return createSuccessResult({
                            message: `Issue #${issue.number} created and added to project #${projectNumber}, but no Status field was found.`,
                            issueNumber: issue.number,
                            issueUrl: issue.html_url,
                            projectItemId: itemId,
                            statusSet: null,
                        });
                    }

                    const option = statusField.options?.find(
                        (o) => o.name.toLowerCase() === status.toLowerCase()
                    );
                    if (!option) {
                        const availableNames = (statusField.options ?? []).map((o) => o.name).join(", ");
                        return createSuccessResult({
                            message:
                                `Issue #${issue.number} created and added to project #${projectNumber}, ` +
                                `but status "${status}" was not found. Available options: ${availableNames}.`,
                            issueNumber: issue.number,
                            issueUrl: issue.html_url,
                            projectItemId: itemId,
                            statusSet: null,
                        });
                    }

                    await updateProjectFieldValue(projectId, itemId, statusField.id, option.id, "SINGLE_SELECT");
                    statusSet = option.name;
                }

                return createSuccessResult({
                    message: `Issue #${issue.number} created and added to project #${projectNumber}${statusSet ? ` with status "${statusSet}"` : ""}.`,
                    issueNumber: issue.number,
                    issueUrl: issue.html_url,
                    projectItemId: itemId,
                    statusSet,
                });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return createErrorResult(message);
            }
        }
    );
}
