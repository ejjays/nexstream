import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import react from 'eslint-plugin-react';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'temp', 'public'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat['jsx-runtime'],
  prettierConfig,
  {
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
      // deepsource alignment
      complexity: ['error', 35],
      'object-shorthand': ['error', 'always'],
      'no-extra-boolean-cast': 'error',
      'no-unneeded-ternary': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
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
            'f', // common abbreviations
          ],
        },
      ],

      // sonarjs optimizations
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-nested-functions': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/no-identical-expressions': 'off',
      'sonarjs/no-ignored-exceptions': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/no-duplicated-branches': 'off',
      'sonarjs/link-with-target-blank': 'off',
      'sonarjs/void-use': 'off',

      // react optimizations
      'react/jsx-max-depth': ['error', { max: 10 }],
      'react/no-array-index-key': 'off',
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
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['tests/**/*.ts', 'tests/**/*.js', 'src/temp/**/*.ts'],
    rules: {
      'id-length': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      complexity: 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-ignored-exceptions': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/no-all-duplicated-branches': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'sonarjs/unused-import': 'off',
    },
  }
);
