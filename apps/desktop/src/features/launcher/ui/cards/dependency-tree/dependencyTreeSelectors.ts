import type { DependencyTreeNode } from '../launcherModDetailData'

/** Collects every loadable remote mod id so the Dependencies tab can preload the full tree by design. */
export function collectLoadableDependencyModIds(nodes: DependencyTreeNode[], ids = new Set<number>()) {
  nodes.forEach((node) => {
    if (node.loadable && node.modId) {
      ids.add(node.modId)
    }
    collectLoadableDependencyModIds(node.children, ids)
  })
  return ids
}

/** Collects dependency nodes that should start expanded to reveal issue paths. */
export function collectExpandedDependencyNodeIds(nodes: DependencyTreeNode[], expanded = new Set<string>()) {
  nodes.forEach((node) => {
    if (node.children.length > 0) {
      expanded.add(node.id)
    }
    if (node.children.length > 0 && node.statusKind !== 'satisfied') {
      collectExpandedDependencyNodeIds(node.children, expanded)
      return
    }
    node.children.forEach((child) => {
      if (child.statusKind !== 'satisfied') {
        expanded.add(node.id)
        collectExpandedDependencyNodeIds([child], expanded)
      }
    })
  })
  return expanded
}

/** Counts actionable dependency issues shown in tabs and badges. */
export function countDependencyIssues(nodes: DependencyTreeNode[]): number {
  return nodes.reduce((count, node) => {
    const ownIssue =
      node.statusKind === 'missing' || node.statusKind === 'disabled' || node.statusKind === 'transitive' || node.statusKind === 'error'
    return count + (ownIssue ? 1 : 0) + countDependencyIssues(node.children)
  }, 0)
}
