fn main() {
    if let Err(error) = modforge_studio_desktop_lib::dev_asset_bridge::run_from_env() {
        eprintln!("{error}");
        std::process::exit(1);
    }
}
