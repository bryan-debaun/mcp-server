#!/usr/bin/env tsx
/**
 * Post-processing script to fix tsoa-generated imports
 * Adds .js extensions to all relative imports in tsoa-routes.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const tsoaRoutesPath = join(__dirname, '../src/http/tsoa-routes.ts');

try {
    let content = readFileSync(tsoaRoutesPath, 'utf8');

    // Fix controller imports - add .js extension
    content = content.replace(
        /from '\.\/controllers\/(\w+)';/g,
        "from './controllers/$1.js';"
    );

    // Fix authentication import - add .js extension
    content = content.replace(
        /from '\.\/authentication';/g,
        "from './authentication.js';"
    );

    writeFileSync(tsoaRoutesPath, content, 'utf8');
    console.log('✓ Fixed imports in tsoa-routes.ts');
} catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error fixing tsoa imports:', message);
    process.exit(1);
}
