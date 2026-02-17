import { runGhCommand, parseGhJson } from "./gh-cli.js";

/**
 * Ensure the provided labels exist in the target repo. Creates any missing labels
 * with a sensible default color and returns when complete.
 */
export async function ensureLabelsExist(repo: string, labels: string[]): Promise<void> {
    if (!labels || labels.length === 0) return;

    // Get existing labels from the repo
    const listOutput = await runGhCommand(["label", "list", "--repo", repo, "--json", "name"]);
    let existing: string[] = [];
    try {
        const parsed = parseGhJson<{ name: string }[]>(listOutput || "[]");
        existing = parsed.map(p => p.name);
    } catch {
        existing = [];
    }

    const missing = labels.map(l => l.trim()).filter(l => l && !existing.includes(l));
    for (const name of missing) {
        // Create with a default yellow color (fbca04)
        await runGhCommand(["label", "create", "--repo", repo, "--name", `"${name.replace(/\"/g, '\\\"')}"`, "--color", "fbca04"]);
    }
}
