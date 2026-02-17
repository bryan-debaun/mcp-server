// Small helper to convert JSON payloads into a readable Markdown representation.
export function jsonToMarkdown(value: any): string {
    if (value === null || value === undefined) return String(value);

    // Primitives -> inline string
    if (typeof value !== "object") return String(value);

    // Arrays -> JSON block
    if (Array.isArray(value)) {
        return '\n```json\n' + JSON.stringify(value, null, 2) + '\n```\n';
    }

    // Plain flat object -> bullet list
    const keys = Object.keys(value);
    const isFlat = keys.every(k => typeof value[k] !== "object");
    if (isFlat) {
        return keys.map(k => `- **${k}**: ${String(value[k])}`).join("\n");
    }

    // Nested object -> JSON block fallback
    return '\n```json\n' + JSON.stringify(value, null, 2) + '\n```\n';
}
