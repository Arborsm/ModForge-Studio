#[path = "../support/infrastructure.rs"]
mod infrastructure;
#[path = "../support/mod.rs"]
mod test_support;

use std::fs;
use std::path::PathBuf;
use std::time::Instant;

use infrastructure::game_formats::xact;

fn main() {
    report_xact_simple_cue_coverage();
    report_xact_total_cue_coverage();
}

fn report_xact_simple_cue_coverage() {
    let game_root = test_support::resolve_game_root();
    let xsb_path = game_root.join("Content/XACT/Sound Bank.xsb");
    assert!(
        xsb_path.exists(),
        "missing XACT sound bank: {}",
        xsb_path.display()
    );

    let xsb = fs::read(&xsb_path).unwrap_or_else(|error| panic!("{}: {error}", xsb_path.display()));
    let header =
        parse_xsb_header(&xsb).unwrap_or_else(|error| panic!("{}: {error}", xsb_path.display()));
    let cue_names = read_xsb_cue_names(&xsb, &header)
        .unwrap_or_else(|error| panic!("{}: {error}", xsb_path.display()));
    assert!(header.num_simple_cues > 0, "XACT bank has no simple cues");
    assert!(header.num_complex_cues > 0, "XACT bank has no complex cues");

    let (passed, total, failures, timings) = collect_cue_results(
        &game_root,
        cue_names
            .iter()
            .take(header.num_simple_cues as usize)
            .cloned(),
    );
    assert!(total > 0, "XACT simple cue scan produced no cases");

    let timing_summary = summarize_timings(&timings);
    let report = format!(
        "Rust XACT simple cue coverage report\nGame root: {}\nSimple cues: {passed}/{total} ({:.2}%)\nComplex cues present: {}\nLoad time total: {:.3} ms\nLoad time avg: {:.3} ms\nLoad time p95: {:.3} ms\nSlowest cue: {}\t{:.3} ms\n",
        game_root.display(),
        percentage(passed, total),
        header.num_complex_cues,
        timing_summary.total_ms,
        timing_summary.avg_ms,
        timing_summary.p95_ms,
        timing_summary.slowest_name,
        timing_summary.slowest_ms
    );

    write_report(
        "xact-simple-cue-coverage-report.txt",
        "xact-simple-cue-coverage-failures.txt",
        &report,
        &failures,
        &timings,
    );
    assert_eq!(passed, total, "some simple cues still failed");
}

fn report_xact_total_cue_coverage() {
    let game_root = test_support::resolve_game_root();
    let xsb_path = game_root.join("Content/XACT/Sound Bank.xsb");
    assert!(
        xsb_path.exists(),
        "missing XACT sound bank: {}",
        xsb_path.display()
    );

    let xsb = fs::read(&xsb_path).unwrap_or_else(|error| panic!("{}: {error}", xsb_path.display()));
    let header =
        parse_xsb_header(&xsb).unwrap_or_else(|error| panic!("{}: {error}", xsb_path.display()));
    let cue_names = read_xsb_cue_names(&xsb, &header)
        .unwrap_or_else(|error| panic!("{}: {error}", xsb_path.display()));

    let (passed, total, failures, timings) =
        collect_cue_results(&game_root, cue_names.iter().cloned());
    let simple_total = header.num_simple_cues as usize;
    let complex_total = header.num_complex_cues as usize;
    assert!(simple_total > 0, "XACT bank has no simple cues");
    assert!(complex_total > 0, "XACT bank has no complex cues");
    assert_eq!(
        total,
        simple_total + complex_total,
        "XACT cue counts do not match the parsed cue list"
    );
    let simple_passed = timings
        .iter()
        .take(simple_total)
        .filter(|timing| timing.error.is_none())
        .count();
    let complex_passed = timings
        .iter()
        .skip(simple_total)
        .filter(|timing| timing.error.is_none())
        .count();
    let simple_timing = summarize_timings(&timings[..simple_total]);
    let complex_timing = summarize_timings(&timings[simple_total..]);
    let total_timing = summarize_timings(&timings);

    let report = format!(
        "Rust XACT cue coverage report\nGame root: {}\nTotal cues: {passed}/{total} ({:.2}%)\nSimple cues: {simple_passed}/{simple_total} ({:.2}%)\nComplex cues: {complex_passed}/{complex_total} ({:.2}%)\nTotal load time: {:.3} ms\nTotal avg: {:.3} ms\nTotal p95: {:.3} ms\nSimple avg: {:.3} ms\nComplex avg: {:.3} ms\nSlowest cue: {}\t{:.3} ms\n",
        game_root.display(),
        percentage(passed, total),
        percentage(simple_passed, simple_total),
        percentage(complex_passed, complex_total),
        total_timing.total_ms,
        total_timing.avg_ms,
        total_timing.p95_ms,
        simple_timing.avg_ms,
        complex_timing.avg_ms,
        total_timing.slowest_name,
        total_timing.slowest_ms
    );

    write_report(
        "xact-cue-coverage-report.txt",
        "xact-cue-coverage-failures.txt",
        &report,
        &failures,
        &timings,
    );
    assert_eq!(passed, total, "some cues still failed");
}

fn percentage(passed: usize, total: usize) -> f64 {
    if total == 0 {
        0.0
    } else {
        passed as f64 * 100.0 / total as f64
    }
}

fn collect_cue_results<I>(
    game_root: &std::path::Path,
    cues: I,
) -> (usize, usize, Vec<String>, Vec<CueTiming>)
where
    I: IntoIterator<Item = String>,
{
    let mut passed = 0usize;
    let mut total = 0usize;
    let mut failures = Vec::new();
    let mut timings = Vec::new();

    for cue in cues {
        total += 1;
        let started = Instant::now();
        match load_as_wav(game_root, &cue) {
            Ok(()) => {
                passed += 1;
                timings.push(CueTiming {
                    cue,
                    elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                    error: None,
                });
            }
            Err(error) => {
                failures.push(format!("{cue} => {error}"));
                timings.push(CueTiming {
                    cue,
                    elapsed_ms: started.elapsed().as_secs_f64() * 1000.0,
                    error: Some(error),
                });
            }
        }
    }

    (passed, total, failures, timings)
}

fn load_as_wav(game_root: &std::path::Path, cue: &str) -> Result<(), String> {
    match xact::load_xact_audio_data_url(game_root.display().to_string(), cue.to_string()) {
        Ok(url) if url.starts_with("data:audio/wav;base64,") => Ok(()),
        Ok(_) => Err("returned non-wav data url".to_string()),
        Err(error) => Err(error.to_string()),
    }
}

fn write_report(
    report_name: &str,
    failures_name: &str,
    report: &str,
    failures: &[String],
    timings: &[CueTiming],
) {
    let report_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join(report_name);
    fs::write(&report_path, report)
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", report_path.display()));

    let failures_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join(failures_name);
    fs::write(&failures_path, failures.join("\n"))
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", failures_path.display()));

    let timing_path =
        report_path.with_file_name(report_name.replace("-report.txt", "-timings.txt"));
    let timing_content = timings
        .iter()
        .map(|timing| match &timing.error {
            Some(error) => format!(
                "{}\t{:.3} ms\tERROR\t{}",
                timing.cue, timing.elapsed_ms, error
            ),
            None => format!("{}\t{:.3} ms\tOK", timing.cue, timing.elapsed_ms),
        })
        .collect::<Vec<_>>()
        .join("\n");
    fs::write(&timing_path, timing_content)
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", timing_path.display()));

    eprintln!("{report}");
    if !failures.is_empty() {
        eprintln!("Failures:");
        for failure in failures.iter().take(20) {
            eprintln!("  {failure}");
        }
    }
    eprintln!("Report written to {}", report_path.display());
    eprintln!("Failure details written to {}", failures_path.display());
    eprintln!("Timing details written to {}", timing_path.display());
}

#[derive(Clone)]
struct CueTiming {
    cue: String,
    elapsed_ms: f64,
    error: Option<String>,
}

struct TimingSummary {
    total_ms: f64,
    avg_ms: f64,
    p95_ms: f64,
    slowest_name: String,
    slowest_ms: f64,
}

fn summarize_timings(timings: &[CueTiming]) -> TimingSummary {
    if timings.is_empty() {
        return TimingSummary {
            total_ms: 0.0,
            avg_ms: 0.0,
            p95_ms: 0.0,
            slowest_name: "<none>".to_string(),
            slowest_ms: 0.0,
        };
    }

    let total_ms = timings.iter().map(|timing| timing.elapsed_ms).sum::<f64>();
    let avg_ms = total_ms / timings.len() as f64;
    let mut sorted = timings
        .iter()
        .map(|timing| timing.elapsed_ms)
        .collect::<Vec<_>>();
    sorted.sort_by(|left, right| left.total_cmp(right));
    let p95_index = ((sorted.len() - 1) as f64 * 0.95).round() as usize;
    let slowest = timings
        .iter()
        .max_by(|left, right| left.elapsed_ms.total_cmp(&right.elapsed_ms))
        .unwrap_or(&timings[0]);

    TimingSummary {
        total_ms,
        avg_ms,
        p95_ms: sorted[p95_index],
        slowest_name: slowest.cue.clone(),
        slowest_ms: slowest.elapsed_ms,
    }
}

struct XsbHeader {
    num_simple_cues: u16,
    num_complex_cues: u16,
    cue_name_table_len: u32,
    cue_names_offset: u32,
}

fn parse_xsb_header(bytes: &[u8]) -> Result<XsbHeader, String> {
    if bytes.len() < 80 {
        return Err("sound bank is too small".to_string());
    }
    if &bytes[0..4] != b"SDBK" {
        return Err("sound bank does not start with SDBK".to_string());
    }

    Ok(XsbHeader {
        num_simple_cues: read_u16_le(bytes, 19)?,
        num_complex_cues: read_u16_le(bytes, 21)?,
        cue_name_table_len: read_u32_le(bytes, 30)?,
        cue_names_offset: read_u32_le(bytes, 42)?,
    })
}

fn read_xsb_cue_names(bytes: &[u8], header: &XsbHeader) -> Result<Vec<String>, String> {
    let start = header.cue_names_offset as usize;
    let len = header.cue_name_table_len as usize;
    let end = start
        .checked_add(len)
        .ok_or_else(|| "cue name table overflowed".to_string())?;
    let raw = bytes
        .get(start..end)
        .ok_or_else(|| "cue name table is out of range".to_string())?;

    Ok(String::from_utf8_lossy(raw)
        .split('\0')
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string())
        .collect())
}

fn read_u16_le(bytes: &[u8], offset: usize) -> Result<u16, String> {
    let slice = bytes
        .get(offset..offset + 2)
        .ok_or_else(|| format!("u16 offset {offset} is out of range"))?;
    Ok(u16::from_le_bytes([slice[0], slice[1]]))
}

fn read_u32_le(bytes: &[u8], offset: usize) -> Result<u32, String> {
    let slice = bytes
        .get(offset..offset + 4)
        .ok_or_else(|| format!("u32 offset {offset} is out of range"))?;
    Ok(u32::from_le_bytes([slice[0], slice[1], slice[2], slice[3]]))
}
