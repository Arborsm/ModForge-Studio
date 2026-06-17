import { defineConfig } from 'vite-plus'

export default defineConfig({
  run: {
    cache: {
      scripts: true,
      tasks: true,
    },
    tasks: {
      dev: {
        command: 'node ./scripts/desktop-host-dispatch.cjs dev',
        cache: false,
      },
    },
  },
  lint: {
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: {
      'vite-plus/prefer-vite-plus-imports': 'error',
    },
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    sortTailwindcss: {},
    printWidth: 140,
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    sortPackageJson: false,
    ignorePatterns: [
      'node_modules',
      'dist',
      'coverage',
      'apps/desktop/dist',
      'apps/desktop/electron-dist',
      'apps/desktop/node_modules',
      'apps/desktop/src-tauri/gen/schemas',
      'apps/desktop/src-tauri/target',
      'apps/desktop/src-tauri/tests/fixtures/**/target',
      '.cargo',
      '.codex',
      '.codex-tmp',
      '.devDocs',
      '.dotnet',
      '.idea',
      '.planning',
      '.superpowers',
      '.tmp',
      '.vite',
      '.vscode',
      '.worktrees',
      '.zed',
      'docs/nexusmods-graphql/00-introduction.md',
      'docs/nexusmods-graphql/SUMMARY.md',
      'docs/nexusmods-graphql/queries',
      'docs/nexusmods-graphql/mutations',
      'docs/nexusmods-graphql/types',
      'package-lock.json',
      'pnpm-lock.yaml',
    ],
  },
})
