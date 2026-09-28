pub(crate) mod cleanup;
pub mod logging;

/// Test-only credential-store shim.
///
/// The test binary runs on hosts without an OS credential store (CI Linux
/// runners have no Secret Service on DBus), where `keyring::Entry::new` fails
/// before any assertion runs. Installing the keyring crate's in-memory mock
/// once per test process keeps store semantics (NoEntry, read/write/delete)
/// without the platform dependency; production builds are unaffected.
#[cfg(test)]
pub(crate) fn install_mock_credential_store() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    });
}
