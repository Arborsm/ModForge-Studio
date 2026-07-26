use anyhow::{Context, bail};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

static JOBS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn jobs() -> MutexGuard<'static, HashMap<String, Arc<AtomicBool>>> {
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(crate) struct AiJobGuard {
    id: String,
    cancelled: Arc<AtomicBool>,
}

impl AiJobGuard {
    pub(crate) fn register(id: &str) -> anyhow::Result<Self> {
        let id = id.trim();
        if id.is_empty() {
            bail!("AI job id cannot be empty.");
        }
        let cancelled = Arc::new(AtomicBool::new(false));
        if jobs()
            .insert(id.to_string(), Arc::clone(&cancelled))
            .is_some()
        {
            bail!("AI job {id} is already active.");
        }
        Ok(Self {
            id: id.to_string(),
            cancelled,
        })
    }
    pub(crate) fn check(&self) -> anyhow::Result<()> {
        if self.cancelled.load(Ordering::Acquire) {
            bail!("AI translation was cancelled.");
        }
        Ok(())
    }
}

impl Drop for AiJobGuard {
    fn drop(&mut self) {
        jobs().remove(&self.id);
    }
}

pub fn cancel_ai_job(job_id: &str) -> anyhow::Result<()> {
    jobs()
        .get(job_id.trim())
        .cloned()
        .context("The AI job is no longer active.")?
        .store(true, Ordering::Release);
    Ok(())
}
