# Nexus Mods GraphQL API Documentation Snapshot

This directory is a local snapshot of the public Nexus Mods GraphQL API v2 documentation from `https://graphql.nexusmods.com/`.

- Captured at: 2026-05-16 00:08:49 +08:00
- Source: `https://graphql.nexusmods.com/`
- API endpoint documented by the page: `https://api.nexusmods.com/v2/graphql`
- Entry point: `SUMMARY.md`

The Markdown files in this directory are generated from the live SpectaQL HTML page. The raw HTML, CSS, JavaScript, and image assets are intentionally not kept in the repository.

## Markdown output

Refresh the Markdown files with:

```powershell
node docs\nexusmods-graphql\convert-to-markdown.mjs
```

The generated Markdown lives directly in this directory:

- `00-introduction.md`
- `SUMMARY.md`
- `queries/*.md`
- `mutations/*.md`
- `types/*.md`

The script fetches `https://graphql.nexusmods.com/`, removes Cloudflare analytics/challenge fragments, clears the previous generated Markdown output, and writes a fresh split copy.

The converter has a small regression test:

```powershell
node --test docs\nexusmods-graphql\convert-to-markdown.test.mjs
```
