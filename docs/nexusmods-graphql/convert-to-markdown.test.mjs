import test from 'node:test'
import assert from 'node:assert/strict'

import { convertSnapshotToMarkdownFiles, cleanGeneratedMarkdown } from './convert-to-markdown.mjs'

test('converts SpectaQL sections into grouped Markdown files', () => {
  const html = `
    <article id="content">
      <h1 class="doc-heading">Nexus Mods API v2 Reference</h1>
      <div id="introduction">
        <p>Welcome to the <strong>GraphQL API</strong>.</p>
        <pre><code>https://api.nexusmods.com/v2/graphql</code></pre>
      </div>
      <h1 id="group-Operations-Queries">Queries</h1>
      <section id="query-mod" class="operation operation-query">
        <h2 class="operation-heading"><code>mod</code></h2>
        <h5>Description</h5>
        <p>Get a mod.</p>
        <h5>Response</h5>
        <p>Returns <a href="#definition-Mod"><code>Mod</code></a></p>
        <pre><code class="hljs language-gql"><span class="hljs-keyword">query</span> mod { mod { name } }</code></pre>
      </section>
      <section id="mutation-trackMod" class="operation operation-mutation">
        <h2 class="operation-heading"><code>trackMod</code></h2>
        <p>Track a mod.</p>
      </section>
      <section id="definition-Mod" class="definition definition-object">
        <h2 class="definition-heading">Mod</h2>
        <h5>Fields</h5>
        <table>
          <thead><tr><th>Field Name</th><th>Description</th></tr></thead>
          <tbody><tr><td><span class="property-name"><code>name</code></span> - <span class="property-type"><a href="#definition-String"><code>String!</code></a></span></td><td>Mod name.</td></tr></tbody>
        </table>
      </section>
    </article>
  `

  const files = convertSnapshotToMarkdownFiles(html)
  const byPath = new Map(files.map((file) => [file.path, file.content]))

  assert.match(byPath.get('00-introduction.md'), /# Nexus Mods API v2 Reference/)
  assert.match(byPath.get('00-introduction.md'), /Welcome to the \*\*GraphQL API\*\*\./)
  assert.match(byPath.get('queries/mod.md'), /# mod/)
  assert.match(byPath.get('queries/mod.md'), /\[Mod\]\(\.\.\/types\/Mod.md\)/)
  assert.match(byPath.get('queries/mod.md'), /```gql\nquery mod \{ mod \{ name \} \}\n```/)
  assert.match(byPath.get('mutations/trackMod.md'), /# trackMod/)
  assert.match(byPath.get('types/Mod.md'), /\| Field Name \| Description \|/)
  assert.match(byPath.get('SUMMARY.md'), /- \[mod\]\(queries\/mod.md\)/)
})

test('cleans only generated Markdown output paths', () => {
  const deletedPaths = []
  const fsLike = {
    rmSync(targetPath, options) {
      deletedPaths.push([targetPath, options])
    },
  }

  cleanGeneratedMarkdown('docs/nexusmods-graphql', fsLike)

  assert.deepEqual(
    deletedPaths.map(([targetPath]) => targetPath.replaceAll('\\', '/')),
    [
      'docs/nexusmods-graphql/00-introduction.md',
      'docs/nexusmods-graphql/SUMMARY.md',
      'docs/nexusmods-graphql/queries',
      'docs/nexusmods-graphql/mutations',
      'docs/nexusmods-graphql/types',
      'docs/nexusmods-graphql/markdown',
      'docs/nexusmods-graphql/index.html',
      'docs/nexusmods-graphql/images',
      'docs/nexusmods-graphql/javascripts',
      'docs/nexusmods-graphql/stylesheets',
    ],
  )
  assert.ok(deletedPaths.every(([, options]) => options.recursive === true && options.force === true))
})
