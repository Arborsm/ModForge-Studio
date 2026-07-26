//! Renders a representative slice of the log surface so terminal layout and
//! colors can be eyeballed without launching the app.
//!
//! ```bash
//! MODFORGE_LOG_COLOR=always cargo run --manifest-path apps/desktop/src-tauri/Cargo.toml --example log_format_sample
//! ```

use modforge_studio_desktop_lib::logging::terminal::{
    LogLine, LogSink, format_log_line, should_colorize_terminal_output,
};

fn main() {
    let colorize = should_colorize_terminal_output(true);
    let samples: &[(log::Level, &str, &str)] = &[
        (
            log::Level::Info,
            "Launcher",
            "launcherSettings.loaded apiKeyPresent=true",
        ),
        (
            log::Level::Debug,
            "Launcher.Trace",
            r#"launcher.install.start archivePath="E:\Downloads\Example Pack.zip" modsPath=E:/SDV/Mods hasBackupRoot=true"#,
        ),
        (
            log::Level::Info,
            "Localization.Translation",
            "translation.started job=kimi-batch engine=generative-ai items=12 characters=4821",
        ),
        (
            log::Level::Warn,
            "Nexus",
            "nexus.request.retry route=modFiles reason=http-status status=429 delayMs=1500 retry=1 maxRetries=3",
        ),
        (
            log::Level::Error,
            "Launcher.Downloads",
            "launcher.lock.poisoned resource=download-queue-file",
        ),
        (
            log::Level::Warn,
            "HostRuntime",
            "hostRuntime.stats reason=shutdown uptime=4m12s\nPools\n  Io/Lane\n    load active=0/4 peak=3/4 75.0% [#######...]\n    work jobs=182 ok=180 fail=2 rej=0",
        ),
        (
            log::Level::Debug,
            "Webview",
            "[vite] hot updated: /src/styles/index.css method=debug source=console count=3",
        ),
        // Long enough to wrap on a normal terminal, which is the case the
        // message column exists to protect.
        (
            log::Level::Debug,
            "Launcher.Trace",
            r#"launcher.updateCache.miss modsPath="E:\SteamLibrary\steamapps\common\Stardew Valley\Mods" cacheKey="e:\steamlibrary\steamapps\common\stardew valley\mods" entryState=missing activeChecks=0 hadActiveCheck=false"#,
        ),
        (
            log::Level::Info,
            "Launcher.GmcmProbe",
            r#"gmcmProbe.diagnostics status=Ready probeAssembly="E:\Arbor\ModForge Studio\apps\desktop\src-tauri\target\release\gmcm-probe\modforge-gmcm-probe.dll" dotnetPath="C:\Program Files\dotnet\dotnet.exe" runtimes=20"#,
        ),
    ];

    println!("--- terminal (colorize={colorize}) ---");
    for (level, target, message) in samples {
        println!(
            "{}",
            format_log_line(
                LogLine {
                    timestamp: "12:34:56",
                    process_tag: None,
                    level: *level,
                    target,
                    message,
                },
                LogSink::Terminal,
                colorize,
            )
        );
    }

    println!("\n--- log file ---");
    for (level, target, message) in samples {
        println!(
            "{}",
            format_log_line(
                LogLine {
                    timestamp: "12:34:56",
                    process_tag: Some("host"),
                    level: *level,
                    target,
                    message,
                },
                LogSink::File,
                false,
            )
        );
    }
}
