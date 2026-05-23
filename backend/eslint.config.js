import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'temp'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  sonarjs.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
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
          ],
        },
      ],

      // sonarjs rules
      'sonarjs/cognitive-complexity': 'off',
      'sonarjs/no-os-command-from-path': 'off',
      'sonarjs/regex-complexity': 'off',
      'sonarjs/slow-regex': 'off',
      'sonarjs/no-nested-conditional': 'off',
      'sonarjs/no-identical-expressions': 'off',
      'sonarjs/duplicates-in-character-class': 'off',
      'sonarjs/single-character-alternation': 'off',
      'sonarjs/pseudo-random': 'off',
      'sonarjs/content-length': 'off',
      'sonarjs/unused-import': 'error',

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
    files: [
      'tests/**/*.ts',
      'tests/**/*.js',
      'src/temp/**/*.ts',
      'src/instrument.ts',
      'scripts/**/*.ts',
    ],
    rules: {
      'id-length': 'off',
      'sonarjs/no-hardcoded-ip': 'off',
      'sonarjs/no-clear-text-protocols': 'off',
      complexity: 'off',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-ignored-exceptions': 'off',
      'sonarjs/no-commented-code': 'off',
      'sonarjs/cors': 'off',
      'sonarjs/x-powered-by': 'off',
      'sonarjs/no-all-duplicated-branches': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'sonarjs/unused-import': 'off',
    },
  }
);
