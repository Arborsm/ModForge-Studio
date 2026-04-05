## Desktop Test Layout

- Keep component and module tests next to the code they exercise, using `*.test.ts` or `*.test.tsx`.
- Put cross-cutting regression and ownership checks under `src/test/regressions`.
- Put architecture and repository-shape assertions under `src/test/architecture`.
- Keep shared test setup and render helpers directly under `src/test`.

Examples:
- `src/components/TopMenuBar.test.tsx`
- `src/test/regressions/localizationOwnershipRegression.test.ts`
- `src/test/architecture/styleArchitecture.test.ts`
- `src/test/renderWithLocale.tsx`
