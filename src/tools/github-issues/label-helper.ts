import type { Octokit } from "@octokit/rest";

/**
 * Ensure the provided labels exist in the target repo. Creates any missing labels
 * with a sensible default color and returns when complete.
 */
export async function ensureLabelsExist(
    octokit: Octokit,
    owner: string,
    repo: string,
    labels: string[]
): Promise<void> {
    if (!labels || labels.length === 0) return;

    const response = await octokit.rest.issues.listLabelsForRepo({ owner, repo, per_page: 100 });
    const existing = response.data.map((l) => l.name);

    const missing = labels.map((l) => l.trim()).filter((l) => l && !existing.includes(l));
    for (const name of missing) {
        await octokit.rest.issues.createLabel({ owner, repo, name, color: "fbca04" });
    }
}
