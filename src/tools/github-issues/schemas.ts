import { z } from "zod";

/**
 * Common schema for repository identifier in owner/repo format.
 */
export const RepoSchema = z
    .string()
    .regex(/^[^/]+\/[^/]+$/, "Repository must be in owner/repo format")
    .describe("Repository in owner/repo format (e.g., 'owner/repo')");

/**
 * Schema for issue number.
 */
export const IssueNumberSchema = z
    .number()
    .int()
    .positive()
    .describe("Issue number");

/**
 * Schema for get-open-issues tool input.
 */
export const GetOpenIssuesInputSchema = {
    repo: RepoSchema,
    labels: z
        .string()
        .optional()
        .describe("Comma-separated labels to filter by"),
    limit: z
        .number()
        .int()
        .positive()
        .default(10)
        .describe("Maximum number of issues to return (default: 10)")
};

/**
 * Schema for get-issue tool input.
 */
export const GetIssueInputSchema = {
    repo: RepoSchema,
    issueNumber: IssueNumberSchema
};

/**
 * Schema for create-issue tool input.
 */
export const CreateIssueInputSchema = {
    repo: RepoSchema,
    title: z.string().min(1).describe("Issue title"),
    body: z.string().optional().describe("Issue body/description"),
    labels: z.string().optional().describe("Comma-separated labels to add")
};

/**
 * Schema for update-issue tool input.
 */
export const UpdateIssueInputSchema = {
    repo: RepoSchema,
    issueNumber: IssueNumberSchema,
    title: z.string().optional().describe("New issue title"),
    body: z.string().optional().describe("New issue body"),
    labels: z.string().optional().describe("Comma-separated labels to set"),
    comment: z.string().optional().describe("Comment to add to the issue")
};

/**
 * Schema for close-issue tool input.
 */
export const CloseIssueInputSchema = {
    repo: RepoSchema,
    issueNumber: IssueNumberSchema,
    comment: z.string().optional().describe("Comment to add before closing")
};

/**
 * Type representing a GitHub issue from the CLI.
 */
export interface GitHubIssue {
    number: number;
    title: string;
    state: string;
    body: string;
    url: string;
    createdAt: string;
    updatedAt: string;
    author: {
        login: string;
    };
    labels: Array<{
        name: string;
    }>;
    assignees: Array<{
        login: string;
    }>;
}
