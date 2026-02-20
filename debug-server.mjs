#!/usr/bin/env node

console.log('Testing server startup...');

async function test() {
    try {
        console.log('1. Testing basic imports...');
        const { createServer } = await import('./dist/server.js');
        console.log('✓ Server import successful');

        const { registerTools } = await import('./dist/tools/index.js');
        console.log('✓ Tools import successful');

        console.log('2. Testing server creation...');
        const server = createServer();
        console.log('✓ Server creation successful');

        console.log('3. Testing tool registration...');
        registerTools(server);
        console.log('✓ Tool registration successful');

        console.log('4. Testing HTTP app creation...');
        const { createHttpApp } = await import('./dist/http/server.js');
        console.log('✓ HTTP server import successful');

        const app = await createHttpApp();
        console.log('✓ HTTP app creation successful');

        console.log('All tests passed!');

    } catch (error) {
        console.error('❌ Error during testing:');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

test();