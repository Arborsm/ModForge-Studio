fn main() {
    if let Err(error) = modforge_studio_desktop_lib::sidecar::run_stdio() {
        modforge_studio_desktop_lib::logging::write_sidecar_fallback_log(
            log::Level::Error,
            "Sidecar",
            format!("modforge sidecar failed: {error}"),
        );
        std::process::exit(1);
    }
}
