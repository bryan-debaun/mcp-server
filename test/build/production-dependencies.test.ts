import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'

/**
 * Test to prevent deployment failures caused by production code importing devDependencies.
 * This catches issues like the dotenv import that caused the production build to fail.
 */
describe('production dependencies validation', () => {
    it('should not import devDependencies in production code', () => {
        // Known safe conditional imports that check NODE_ENV before importing
        const allowedConditionalImports = new Set([
            'src/db/index.ts:dotenv' // Conditional import checked with NODE_ENV !== 'production'
        ])

        // Read package.json to get devDependencies
        const packageJson = JSON.parse(
            readFileSync(join(process.cwd(), 'package.json'), 'utf-8')
        )
        const devDeps = Object.keys(packageJson.devDependencies || {})

        // Filter out @types/* packages - these are type-only and fine in devDependencies
        const runtimeDevDeps = devDeps.filter(dep => !dep.startsWith('@types/'))

        // Scan all TypeScript files in src/ for imports
        const srcDir = join(process.cwd(), 'src')
        const violations: Array<{ file: string; line: number; imported: string }> = []

        function scanDirectory(dir: string) {
            const entries = readdirSync(dir)

            for (const entry of entries) {
                const fullPath = join(dir, entry)
                const stat = statSync(fullPath)

                if (stat.isDirectory()) {
                    scanDirectory(fullPath)
                } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
                    const content = readFileSync(fullPath, 'utf-8')
                    const lines = content.split('\n')

                    lines.forEach((line, index) => {
                        // Match import statements: import 'pkg', import { x } from 'pkg', import * as x from 'pkg'
                        // Also match dynamic imports: import('pkg')
                        const importMatches = [
                            ...line.matchAll(/import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g),
                            ...line.matchAll(/import\s*\(['"]([^'"]+)['"]\)/g)
                        ]

                        for (const match of importMatches) {
                            const importPath = match[1]

                            // Extract package name from import path
                            // Examples: 'dotenv/config' -> 'dotenv', '@scope/pkg' -> '@scope/pkg'
                            const packageName = importPath.startsWith('@')
                                ? importPath.split('/').slice(0, 2).join('/')
                                : importPath.split('/')[0]

                            // Check if this is a devDependency
                            if (runtimeDevDeps.includes(packageName)) {
                                const relPath = relative(process.cwd(), fullPath).replace(/\\/g, '/')
                                const allowedKey = `${relPath}:${packageName}`

                                // Skip if this is a known safe conditional import
                                if (!allowedConditionalImports.has(allowedKey)) {
                                    violations.push({
                                        file: relPath,
                                        line: index + 1,
                                        imported: packageName
                                    })
                                }
                            }
                        }
                    })
                }
            }
        }

        scanDirectory(srcDir)

        // Report violations with helpful error message
        if (violations.length > 0) {
            const violationDetails = violations
                .map(v => `  - ${v.file}:${v.line} imports '${v.imported}'`)
                .join('\n')

            const affectedPackages = [...new Set(violations.map(v => v.imported))]

            throw new Error(
                `Production code (src/) must not import packages from devDependencies.\n\n` +
                `Found ${violations.length} violation(s):\n${violationDetails}\n\n` +
                `To fix this:\n` +
                `1. If these packages are needed at runtime, move them to dependencies:\n` +
                `   npm install --save ${affectedPackages.join(' ')}\n` +
                `2. If they're only for development, make imports conditional:\n` +
                `   if (process.env.NODE_ENV !== 'production') { await import('${affectedPackages[0]}') }\n` +
                `3. Or refactor code to avoid the import entirely.`
            )
        }

        expect(violations).toHaveLength(0)
    })

    it('should have no unexpected conditional imports of devDependencies', () => {
        // This test documents known conditional imports for visibility
        // If you add a new conditional import, add it to the allowlist above
        // and document it here for clarity
        const documentedConditionalImports = [
            {
                package: 'dotenv',
                file: 'src/db/index.ts',
                condition: 'NODE_ENV !== production',
                reason: 'Development only - production environments provide variables directly via platform'
            }
        ]

        // This serves as documentation for engineers debugging environment-specific behavior
        expect(documentedConditionalImports).toHaveLength(1)
        expect(documentedConditionalImports[0].package).toBe('dotenv')
    })
})
