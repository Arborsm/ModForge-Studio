import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const desktopRootDir = path.resolve(rootDir, 'apps/desktop')
const desktopSrcDir = path.resolve(desktopRootDir, 'src')
const require = createRequire(import.meta.url)
const vitePlusPackageDir = path.dirname(require.resolve('vite-plus/package.json'))
const vitePlusTestEntry = path.join(vitePlusPackageDir, 'dist/test/index.js')
const vitePlusTestRequire = createRequire(vitePlusTestEntry)
const vitestPackageDir = path.dirname(vitePlusTestRequire.resolve('vitest/package.json'))
const vitestEntry = path.join(vitestPackageDir, 'dist/index.js')

export default defineConfig({
  resolve: {
    alias: [
      { find: /^vite-plus\/test$/, replacement: vitePlusTestEntry },
      { find: /^vitest$/, replacement: vitestEntry },
      { find: '@app', replacement: path.resolve(desktopSrcDir, 'app') },
      { find: '@pages', replacement: path.resolve(desktopSrcDir, 'pages') },
      { find: '@widgets', replacement: path.resolve(desktopSrcDir, 'widgets') },
      { find: '@features', replacement: path.resolve(desktopSrcDir, 'features') },
      { find: '@entities', replacement: path.resolve(desktopSrcDir, 'entities') },
      { find: '@shared', replacement: path.resolve(desktopSrcDir, 'shared') },
      { find: '@platform', replacement: path.resolve(desktopSrcDir, 'platform') },
      { find: '@test', replacement: path.resolve(desktopSrcDir, 'tests/support') },
      { find: /^@locales$/, replacement: path.resolve(desktopSrcDir, 'locales/index.ts') },
      { find: /^@locales\/(.*)$/, replacement: path.resolve(desktopSrcDir, 'locales/$1') },
    ],
  },
  test: {
    root: desktopRootDir,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/support/setup.ts'],
    include: ['src/tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', 'src/dev/**'],
  },
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
