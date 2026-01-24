import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Executes a GitHub CLI command and returns the output.
 * 
 * @param args - Array of arguments to pass to the gh command
 * @returns The stdout from the command
 * @throws Error if the command fails
 */
export async function runGhCommand(args: string[]): Promise<string> {
    const command = `gh ${args.join(" ")}`;

    try {
        const { stdout } = await execAsync(command);
        return stdout.trim();
    } catch (error) {
        if (error instanceof Error && "stderr" in error) {
            const stderr = (error as { stderr: string }).stderr;
            throw new Error(`GitHub CLI error: ${stderr || error.message}`);
        }
        throw error;
    }
}

/**
 * Parses JSON output from gh CLI commands.
 * 
 * @param json - JSON string to parse
 * @returns Parsed object
 */
export function parseGhJson<T>(json: string): T {
    try {
        return JSON.parse(json) as T;
    } catch {
        throw new Error(`Failed to parse GitHub CLI response: ${json}`);
    }
}
