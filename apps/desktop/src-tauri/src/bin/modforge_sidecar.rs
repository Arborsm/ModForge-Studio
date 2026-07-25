fn main() {
    if let Err(error) = modforge_studio_desktop_lib::sidecar::run_stdio() {
        modforge_studio_desktop_lib::logging::write_sidecar_fallback_log(
            log::Level::Error,
            modforge_studio_desktop_lib::logging::targets::SIDECAR,
            modforge_studio_desktop_lib::logging::LogEvent::new("sidecar.failed")
                .error(format!("{error}"))
                .render(),
        );
        std::process::exit(1);
    }
}
