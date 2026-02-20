#!/usr/bin/env node

import fs from 'fs';

console.log('=== TSOA Build Debug ===');

// Check if key files exist
const checks = [
    'src/http/controllers/BooksController.ts',
    'src/http/controllers/MoviesController.ts',
    'src/http/controllers/VideoGamesController.ts',
    'tsoa.json'
];

for (const file of checks) {
    const exists = fs.existsSync(file);
    console.log(`${file}: ${exists ? '✓' : '✗'}`);
}

// Simple syntax check  
try {
    const { execSync } = await import('child_process');
    console.log('\n=== TypeScript Check ===');
    const result = execSync('npx tsc --noEmit --skipLibCheck', { encoding: 'utf8', timeout: 30000 });
    console.log('TypeScript OK:', result.length === 0 ? 'No errors' : result);
} catch (error) {
    console.log('TypeScript Error:', error.message);
    if (error.stdout) console.log('STDOUT:', error.stdout);
    if (error.stderr) console.log('STDERR:', error.stderr);
}

console.log('\nDebug complete.');