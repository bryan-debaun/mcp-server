import { Octokit } from "@octokit/rest";
import { config } from "../../config.js";

/**
 * Create an authenticated Octokit REST client using GITHUB_TOKEN from config.
 * Throws if GITHUB_TOKEN is not configured — REST calls require explicit auth.
 */
export function createOctokitClient(): Octokit {
    const token = config.github.token;
    if (!token) {
        throw new Error(
            "GITHUB_TOKEN is not configured. Set GITHUB_TOKEN to enable GitHub issue tools."
        );
    }
    return new Octokit({ auth: token });
}

/**
 * Parse "owner/repo" string into separate owner and repo components.
 */
export function parseRepo(repo: string): { owner: string; repo: string } {
    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) {
        throw new Error(`Invalid repo format: "${repo}". Expected "owner/repo".`);
    }
    return { owner, repo: repoName };
}
