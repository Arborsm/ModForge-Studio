use super::{restrict_secret_file, write_secret_file};
use crate::test_support::create_temp_dir;
use std::fs;

#[test]
fn write_secret_file_writes_contents() {
    let dir = create_temp_dir("secret-file-write");
    let path = dir.join("settings.json");

    write_secret_file(&path, "{\"nexusApiKey\":\"secret\"}\n").expect("write secret file");

    assert_eq!(
        fs::read_to_string(&path).expect("read secret file"),
        "{\"nexusApiKey\":\"secret\"}\n"
    );
    fs::remove_dir_all(&dir).ok();
}

#[cfg(unix)]
#[test]
fn write_secret_file_restricts_access_to_the_owner() {
    use std::os::unix::fs::PermissionsExt;

    let dir = create_temp_dir("secret-file-mode");
    let path = dir.join("settings.json");
    fs::write(&path, "world readable").expect("seed secret file");
    fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).expect("seed permissions");

    write_secret_file(&path, "secret").expect("write secret file");

    let mode = fs::metadata(&path).expect("metadata").permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
    fs::remove_dir_all(&dir).ok();
}

#[cfg(unix)]
#[test]
fn restrict_secret_file_tightens_existing_files() {
    use std::os::unix::fs::PermissionsExt;

    let dir = create_temp_dir("secret-file-restrict");
    let path = dir.join("ai-settings.json");
    fs::write(&path, "secret").expect("seed secret file");
    fs::set_permissions(&path, fs::Permissions::from_mode(0o666)).expect("seed permissions");

    restrict_secret_file(&path).expect("restrict secret file");

    let mode = fs::metadata(&path).expect("metadata").permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
    fs::remove_dir_all(&dir).ok();
}
