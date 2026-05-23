---
name: codegraph
description: Use when answering codebase structure, symbol, call graph, impact, architecture, feature flow, or "how does this work" questions in a project with CodeGraph MCP tools or a .codegraph index.
---

# CodeGraph

Use CodeGraph as the primary project-structure and symbol index. It is a tree-sitter parsed graph of files, symbols, and call edges; it answers structural questions faster and with less context than grep/read loops.

## Tool Choice

| Need | Preferred tool |
|---|---|
| Find files under a path | `codegraph_files` |
| Find a symbol by name | `codegraph_search` |
| Understand an area/task/bug | `codegraph_context` first |
| Inspect several related symbols | `codegraph_explore` |
| Inspect one symbol signature/source | `codegraph_node` |
| Find callers of a symbol | `codegraph_callers` |
| Find callees of a symbol | `codegraph_callees` |
| Estimate change impact | `codegraph_impact` |
| Check index health | `codegraph_status` |

## Rules

- For architecture, feature-flow, "how does X work", bug-context, and symbol-location questions, call `codegraph_context` first.
- For file/folder exploration, call `codegraph_files` first.
- Use native `rg`/file reads for literal text, comments, docs, config snippets, or after CodeGraph identifies a specific file that needs exact inspection.
- Do not re-verify CodeGraph structural results with grep by default. Trust the index unless results are stale or inconsistent.
- Do not chain many `codegraph_node` calls. Use one `codegraph_explore` for related symbols/source.
- After editing files, expect a short index lag; do not immediately re-query modified symbols in the same breath.

## If Missing

If `.codegraph/` is absent or `codegraph_status` says the project is not initialized, ask before running initialization:

```text
我看到这个项目还没有初始化 CodeGraph。要我运行 `codegraph init -i` 建索引吗？
```
