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
        // Project-specific adjustments to avoid noisy failures
        'no-console': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }]
    },
    globals: {
        fetch: 'readonly'
    }
}
