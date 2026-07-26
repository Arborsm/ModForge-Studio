use modforge_studio_desktop_lib::diagnostics as semantic;
use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    source_locale: String,
    queries: Vec<String>,
    cold_start: semantic::SemanticBenchmarkSample,
    warm: Summary,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Summary {
    iterations: usize,
    samples: Vec<semantic::SemanticBenchmarkSample>,
    embedding_p50_ms: f64,
    embedding_p95_ms: f64,
    knn_p50_ms: f64,
    knn_p95_ms: f64,
    total_p50_ms: f64,
    total_p95_ms: f64,
}

fn percentile(values: impl Iterator<Item = f64>, fraction: f64) -> f64 {
    let mut values = values.collect::<Vec<_>>();
    values.sort_by(f64::total_cmp);
    let index = ((values.len() as f64 * fraction).ceil() as usize)
        .saturating_sub(1)
        .min(values.len().saturating_sub(1));
    values[index]
}

fn main() -> anyhow::Result<()> {
    let mut args = std::env::args().skip(1);
    let mut source_locale = "en-US".to_string();
    let mut queries = Vec::new();
    let mut iterations = 10_usize;
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--source-locale" => {
                source_locale = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--source-locale requires a value"))?;
            }
            "--query" => queries.push(
                args.next()
                    .ok_or_else(|| anyhow::anyhow!("--query requires a value"))?,
            ),
            "--iterations" => {
                iterations = args
                    .next()
                    .ok_or_else(|| anyhow::anyhow!("--iterations requires a value"))?
                    .parse()?;
                if !(3..=100).contains(&iterations) {
                    anyhow::bail!("--iterations must be between 3 and 100");
                }
            }
            _ => anyhow::bail!("Unknown argument: {arg}"),
        }
    }
    if queries.is_empty() {
        queries = vec![
            "Active on Main Menu".into(),
            "Welcome to Pelican Town".into(),
            "The valley looks beautiful today".into(),
        ];
    }
    let cold_start = semantic::benchmark_query(&queries[0], &source_locale)?;
    let mut samples = Vec::with_capacity(iterations);
    for index in 0..iterations {
        samples.push(semantic::benchmark_query(
            &queries[index % queries.len()],
            &source_locale,
        )?);
    }
    let warm = Summary {
        iterations,
        embedding_p50_ms: percentile(samples.iter().map(|sample| sample.embedding_ms), 0.50),
        embedding_p95_ms: percentile(samples.iter().map(|sample| sample.embedding_ms), 0.95),
        knn_p50_ms: percentile(samples.iter().map(|sample| sample.knn_ms), 0.50),
        knn_p95_ms: percentile(samples.iter().map(|sample| sample.knn_ms), 0.95),
        total_p50_ms: percentile(samples.iter().map(|sample| sample.total_ms), 0.50),
        total_p95_ms: percentile(samples.iter().map(|sample| sample.total_ms), 0.95),
        samples,
    };
    println!(
        "{}",
        serde_json::to_string_pretty(&Report {
            source_locale,
            queries,
            cold_start,
            warm,
        })?
    );
    Ok(())
}
