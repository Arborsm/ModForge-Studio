#[path = "../src/pathing.rs"]
mod pathing;
#[path = "../src/xact/mod.rs"]
mod xact;

use std::path::Path;
use std::{fs, path::PathBuf, time::Instant};

#[test]
fn loads_reference_xact_cues_as_wav_data_urls() {
    let game_root = Path::new(r"E:\SteamLibrary\steamapps\common\Stardew Valley");
    assert!(
        game_root.join(r"Content\XACT\Sound Bank.xsb").exists(),
        "expected XACT files under {}",
        game_root.display()
    );

    let mut timings = Vec::new();
    let suite_started = Instant::now();

    for cue in [
        "doorClose",
        "dialogueCharacterClose",
        "smallSelect",
        "fishBite",
        "drumkit1",
        "musicboxsong",
        "bigSelect",
        "stoneCrack",
        "wateringCan",
        "woodchipper_occasional",
    ] {
        let started = Instant::now();
        let url = xact::load_xact_audio_data_url(game_root.display().to_string(), cue.to_string())
            .unwrap_or_else(|error| panic!("{cue}: {error}"));
        let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
        assert!(url.starts_with("data:audio/wav;base64,"), "{cue}: expected wav data url");
        assert!(url.len() > 64, "{cue}: data url was unexpectedly short");
        timings.push((cue, elapsed_ms));
    }

    let total_ms = suite_started.elapsed().as_secs_f64() * 1000.0;
    let avg_ms = timings.iter().map(|(_, elapsed_ms)| *elapsed_ms).sum::<f64>() / timings.len() as f64;
    let slowest = timings
        .iter()
        .max_by(|left, right| left.1.total_cmp(&right.1))
        .copied()
        .unwrap_or(("<none>", 0.0));
    let detail = timings
        .iter()
        .map(|(cue, elapsed_ms)| format!("{cue}\t{elapsed_ms:.3} ms"))
        .collect::<Vec<_>>()
        .join("\n");

    let report = format!(
        "XACT regression performance\nCues: {}\nTotal: {:.3} ms\nAverage: {:.3} ms\nSlowest: {}\t{:.3} ms\n\nPer cue:\n{}\n",
        timings.len(),
        total_ms,
        avg_ms,
        slowest.0,
        slowest.1,
        detail
    );
    let report_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target")
        .join("xact-regression-performance-report.txt");
    fs::write(&report_path, &report)
        .unwrap_or_else(|error| panic!("failed to write {}: {error}", report_path.display()));
    eprintln!("{report}");
}
