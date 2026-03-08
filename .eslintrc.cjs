module.exports = {
  root: true,
  ignorePatterns: ['coverage/', 'dist/', 'frontend/dist/', 'node_modules/'],
  env: {
    es2022: true
  },
  overrides: [
    {
      files: ['src/**/*.js', 'tests/**/*.js', 'scripts/**/*.js'],
      env: {
        node: true,
        jest: true
      },
      extends: ['eslint:recommended'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script'
      },
      rules: {
        'no-console': 'off',
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
      }
    },
    {
      files: ['frontend/src/**/*.{js,jsx}'],
      env: {
        browser: true
      },
      extends: ['eslint:recommended'],
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        sessionStorage: 'readonly',
        localStorage: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        IntersectionObserver: 'readonly',
        MutationObserver: 'readonly'
      },
      rules: {
        'no-console': 'off',
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
      }
    }
  ]
}
