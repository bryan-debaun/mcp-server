module.exports = {
    root: true,
    env: {
        node: true,
        es2024: true,
    },
    parser: '@typescript-eslint/parser',
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
    },
    plugins: ['@typescript-eslint'],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    rules: {
        // Use the structured logger (src/logger.ts), not console, in app code.
        'no-console': 'error',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }]
    },
    overrides: [
        {
            // Bootstrap config runs before the logger exists; tests and the logger
            // module itself may use console directly.
            files: ['src/config.ts', 'src/logger.ts', 'test/**/*.ts'],
            rules: { 'no-console': 'off' }
        }
    ],
    globals: {
        fetch: 'readonly'
    }
}
