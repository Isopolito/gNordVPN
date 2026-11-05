import js from '@eslint/js';
import globals from 'globals';

// GJS globals available to both the shell and prefs processes.
const gjsGlobals = {
    global: 'readonly',
    imports: 'readonly',
    log: 'readonly',
    logError: 'readonly',
    print: 'readonly',
    printerr: 'readonly',
    console: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    ARGV: 'readonly',
};

export default [
    {ignores: ['node_modules/', '__tests__/', '__mocks__/', 'claude_docs/', 'eslint.config.js']},
    js.configs.recommended,
    {
        files: ['extension.js', 'prefs.js', 'modules/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {...globals.es2021, ...gjsGlobals},
        },
        rules: {
            'max-len': ['error', {code: 200, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true, ignoreRegExpLiterals: true}],
            'no-unused-vars': ['error', {args: 'none'}],
            'no-shadow': 'error',
            'prefer-const': 'error',
            'eqeqeq': ['error', 'always'],
            'no-var': 'error',
            'semi': ['error', 'always'],
            'indent': ['error', 4, {SwitchCase: 1, MemberExpression: 'off', CallExpression: {arguments: 'off'}, ignoredNodes: ['TemplateLiteral *']}],
            'no-trailing-spaces': 'error',
            'no-empty': ['error', {allowEmptyCatch: false}],
        },
    },
];
