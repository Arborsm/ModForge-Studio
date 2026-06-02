fn main() {
    if let Err(error) = modforge_studio_desktop_lib::sidecar::run_stdio() {
        eprintln!("modforge sidecar failed: {error}");
        std::process::exit(1);
    }
}
