mod cache;
mod jobs;
mod presets;
mod providers;
mod settings;
pub mod types;

use crate::AppHandle;
use anyhow::Context;
use std::fmt::Display;
use std::time::Instant;
use types::{
    AiModelInfo, AiProfileRequest, AiProfileTestResult, AiSettingsSnapshot,
    AiTranslateBatchRequest, AiTranslateBatchResult, AiTranslationProgressPayload,
    CancelAiJobRequest, SaveAiSettingsRequest,
};

pub use cache::{
    clear_ai_translation_cache, get_ai_translation_cache_stats, read_ai_translation_cache,
    write_ai_translation_cache,
};
pub use settings::{load_ai_settings, save_ai_settings};

pub(crate) fn classify_error_message(message: &str) -> &'static str {
    let message = message.to_ascii_lowercase();
    if message.contains("cancelled") {
        "cancelled"
    } else if message.contains("no default ai profile")
        || message.contains("selected ai profile does not exist")
    {
        "not-configured"
    } else if message.contains("no api key")
        || message.contains("401 unauthorized")
        || message.contains("403 forbidden")
        || message.contains("authentication")
    {
        "authentication"
    } else if message.contains("changed placeholders") {
        "placeholder-mismatch"
    } else if message.contains("429 too many requests") {
        "rate-limit"
    } else if message.contains("timed out") || message.contains("timeout") {
        "timeout"
    } else if message.contains("model") {
        "model"
    } else if message.contains("could not be sent")
        || message.contains("connection")
        || message.contains("dns")
    {
        "network"
    } else if message.contains("ai translation cache") || message.contains("ai cache") {
        "cache"
    } else if message.contains("invalid json")
        || message.contains("translation output")
        || message.contains("translation item is missing")
        || message.contains("structured result")
    {
        "invalid-response"
    } else {
        "unknown"
    }
}

pub(crate) fn format_command_error(error: impl Display) -> String {
    let detail = format!("{error:#}");
    format!("AI_ERROR::{}::{detail}", classify_error_message(&detail))
}

pub fn list_ai_models(request: AiProfileRequest) -> anyhow::Result<Vec<AiModelInfo>> {
    providers::list_models(&settings::resolve_profile(Some(&request.profile_id))?)
}

pub fn test_ai_profile(request: AiProfileRequest) -> anyhow::Result<AiProfileTestResult> {
    let profile = settings::resolve_profile(Some(&request.profile_id))?;
    let started = Instant::now();
    let job_id = format!("profile-test:{}", profile.id);
    let job = jobs::AiJobGuard::register(&job_id)?;
    providers::translate(
        &profile,
        &AiTranslateBatchRequest {
            job_id,
            profile_id: Some(profile.id.clone()),
            source_locale: Some("en".into()),
            target_locale: "zh-Hans".into(),
            items: vec![types::AiTranslationItem {
                id: "probe".into(),
                text: "Connection test".into(),
                format: types::AiTranslationFormat::PlainText,
                context: None,
            }],
        },
        &job,
    )?;
    Ok(AiProfileTestResult {
        model: profile.model,
        latency_ms: started.elapsed().as_millis(),
    })
}

pub fn translate_ai_batch(
    app: AppHandle,
    request: AiTranslateBatchRequest,
) -> anyhow::Result<AiTranslateBatchResult> {
    let profile = settings::resolve_profile(request.profile_id.as_deref())?;
    let job = jobs::AiJobGuard::register(&request.job_id)?;
    let total = request.items.len();
    app.emit(
        "ai://translation-progress",
        AiTranslationProgressPayload {
            job_id: request.job_id.clone(),
            completed: 0,
            total,
            state: "running".into(),
        },
    )
    .map_err(anyhow::Error::msg)?;
    let items = match providers::translate(&profile, &request, &job) {
        Ok(items) => items,
        Err(error) => {
            let state = if classify_error_message(&error.to_string()) == "cancelled" {
                "cancelled"
            } else {
                "error"
            };
            let _ = app.emit(
                "ai://translation-progress",
                AiTranslationProgressPayload {
                    job_id: request.job_id.clone(),
                    completed: 0,
                    total,
                    state: state.into(),
                },
            );
            return Err(error);
        }
    };
    app.emit(
        "ai://translation-progress",
        AiTranslationProgressPayload {
            job_id: request.job_id.clone(),
            completed: items.len(),
            total,
            state: "completed".into(),
        },
    )
    .map_err(anyhow::Error::msg)?;
    Ok(AiTranslateBatchResult {
        job_id: request.job_id,
        profile_id: profile.id,
        model: profile.model,
        items,
    })
}

pub fn cancel_ai_job(request: CancelAiJobRequest) -> anyhow::Result<()> {
    jobs::cancel_ai_job(&request.job_id)
}

pub fn load_settings_for_command() -> anyhow::Result<AiSettingsSnapshot> {
    load_ai_settings().context("Failed to load AI settings.")
}

pub fn save_settings_for_command(
    request: SaveAiSettingsRequest,
) -> anyhow::Result<AiSettingsSnapshot> {
    save_ai_settings(request).context("Failed to save AI settings.")
}

#[cfg(test)]
#[path = "../../tests/integration/ai_real_smoke_tests.rs"]
mod real_smoke_tests;

#[cfg(test)]
#[path = "../../tests/unit/domain/ai/error_tests.rs"]
mod error_tests;
