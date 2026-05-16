# ModRequirementPage

## Fields

| Field Name | Description |
| --- | --- |
| `facets` - [[NodesFacet!]](../types/NodesFacet.md) | Facets available, if supported for this query and requested. |
| `facetsData` - [JSON](../types/JSON.md) | Facets available, if supported for this query and requested. Schema is {"facetName":{"facetValue":count}} |
| `nodes` - [[ModRequirement!]!](../types/ModRequirement.md) | Nodes for pagination |
| `nodesCount` - [Int!](../types/Int.md) | Number of nodes returned by this query |
| `nodesFacets` - [[NodesFacet!]](../types/NodesFacet.md) | Facets available, if supported for this query and requested. |
| `nodesFilter` - [String](../types/String.md) | String representation of the filter query used to locate the nodes. |
| `totalCount` - [Int!](../types/Int.md) | Total number of collections found. |

## Example

```json
{
  "facets": [NodesFacet],
  "facetsData": {},
  "nodes": [ModRequirement],
  "nodesCount": 123,
  "nodesFacets": [NodesFacet],
  "nodesFilter": "abc123",
  "totalCount": 123
}
```
