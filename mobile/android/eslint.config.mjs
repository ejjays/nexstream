import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import react from 'eslint-plugin-react';
import prettierConfig from 'eslint-config-prettier';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const pluginPath = join(
  process.cwd(),
  '../../scripts/eslint-plugin-nexstream.js'
);
const hasPlugin = existsSync(pluginPath);
const nexstreamPlugin = hasPlugin
  ? (await import('../../scripts/eslint-plugin-nexstream.js')).default
  : null;

export default tseslint.config(
  {
    ignores: [
      'node_modules',
      '.expo',
      'dist',
      'web-build',
      'babel.config.js',
      'metro.config.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  prettierConfig,
  {
    plugins: {
      ...(nexstreamPlugin ? { nexstream: nexstreamPlugin } : {}),
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...(nexstreamPlugin ? { 'nexstream/nexstream-comments': 'error' } : {}),
      complexity: ['error', 30],
      'object-shorthand': ['error', 'always'],
      'no-extra-boolean-cast': 'error',
      'no-unneeded-ternary': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      'no-use-before-define': 'off',
      '@typescript-eslint/no-use-before-define': [
        'error',
        {
          functions: false,
          classes: false,
          variables: true,
          enums: false,
          typedefs: false,
          ignoreTypeReferences: true,
        },
      ],
      'id-length': [
        'error',
        {
          min: 2,
          exceptions: [
            'i',
            'j',
            '_',
            'x',
            'y',
            'z',
            'C',
            'D',
            'E',
            'F',
            'G',
            'A',
            'B',
            'id',
            'ip',
            'cb',
            'fs',
            'db',
            'ms',
            'ok',
            'err',
            'req',
            'res',
            'url',
            'e',
            's',
            'v',
            'o',
            't',
            'k',
            'a',
            'd',
            'f',
          ],
        },
      ],
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/no-identical-expressions': 'off',
      'sonarjs/no-ignored-exceptions': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/single-character-alternation': 'off',
      'sonarjs/duplicates-in-character-class': 'off',
      'sonarjs/regex-complexity': 'off',
      'sonarjs/no-duplicated-branches': 'off',
      'sonarjs/link-with-target-blank': 'off',
      'sonarjs/void-use': 'off',
      'react/jsx-max-depth': ['error', { max: 12 }],
      'react/no-array-index-key': 'error',
      'react/jsx-boolean-value': ['error', 'never'],
      'react/prop-types': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^[A-Z_]',
          argsIgnorePattern: '^[A-Z_]',
          caughtErrorsIgnorePattern: '^[A-Z_]',
        },
      ],
      'require-await': 'error',
      'prefer-template': 'error',
      '@typescript-eslint/no-inferrable-types': 'error',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
      'no-template-curly-in-string': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportNamedDeclaration > VariableDeclaration[kind="let"]',
          message: 'Use "const" instead of "let" for exports.',
        },
        {
          selector: 'ExportNamedDeclaration > VariableDeclaration[kind="var"]',
          message: 'Use "const" instead of "var" for exports.',
        },
      ],
      'spaced-comment': ['error', 'always'],
    },
  }
);
