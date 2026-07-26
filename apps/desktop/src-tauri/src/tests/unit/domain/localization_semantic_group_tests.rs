use super::*;
use std::cell::Cell;

#[test]
fn batched_grouped_search_embeds_all_queries_once_and_reuses_each_vector() {
    let embedding_calls = Cell::new(0);
    let search_calls = Cell::new(0);
    let groups = [("official", 1_000), ("official-entity", 20)];
    let queries = vec!["first".into(), "second".into(), "third".into()];

    let matches = search_candidate_groups_batch_with(
        &groups,
        &queries,
        || {
            embedding_calls.set(embedding_calls.get() + 1);
            Ok((
                "model-key".into(),
                vec![vec![1.0, 0.0], vec![0.0, 1.0], vec![0.5, 0.5]],
            ))
        },
        |model_key, source_kind, vector, limit| {
            search_calls.set(search_calls.get() + 1);
            assert_eq!(model_key, "model-key");
            assert_eq!(limit, groups[(search_calls.get() - 1) % groups.len()].1);
            assert_eq!(vector.len(), 2);
            Ok(vec![index::SemanticMatch {
                source_id: source_kind.into(),
                source_fingerprint: "fingerprint".into(),
                similarity: 0.9,
            }])
        },
    )
    .unwrap();

    assert_eq!(embedding_calls.get(), 1);
    assert_eq!(search_calls.get(), queries.len() * groups.len());
    assert_eq!(matches.len(), queries.len());
    assert_eq!(matches[0][0][0].0, "official");
    assert_eq!(matches[0][1][0].0, "official-entity");
}
