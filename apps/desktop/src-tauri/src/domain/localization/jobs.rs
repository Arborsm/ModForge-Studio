//! Localization job cancellation tracking shared across translation, review, and indexing operations.

use crate::support::logging::{LogEvent, targets};
use anyhow::bail;
use std::collections::BTreeSet;
use std::sync::{Mutex, OnceLock};

fn cancelled() -> &'static Mutex<BTreeSet<String>> {
    static VALUE: OnceLock<Mutex<BTreeSet<String>>> = OnceLock::new();
    VALUE.get_or_init(|| Mutex::new(BTreeSet::new()))
}

pub fn cancel(job_id: &str) -> anyhow::Result<()> {
    cancelled()
        .lock()
        .map_err(|_| anyhow::anyhow!("Localization job state is unavailable."))?
        .insert(job_id.to_string());
    Ok(())
}

pub fn check(job_id: &str) -> anyhow::Result<()> {
    if cancelled()
        .lock()
        .map_err(|_| anyhow::anyhow!("Localization job state is unavailable."))?
        .contains(job_id)
    {
        bail!("Localization job was cancelled.");
    }
    Ok(())
}

pub fn clear(job_id: &str) {
    match cancelled().lock() {
        Ok(mut jobs) => {
            jobs.remove(job_id);
        }
        Err(error) => {
            LogEvent::new("localization.jobs.clearPoisoned")
                .field("jobId", job_id)
                .error(error)
                .emit_warn(targets::LOCALIZATION_TRANSLATION);
        }
    }
}
