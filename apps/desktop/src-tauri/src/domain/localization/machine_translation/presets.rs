use crate::domain::localization::types::*;

fn capability(
    dynamic: bool,
    item: u64,
    batch: u64,
    html: bool,
    glossary: bool,
    usage: &str,
    auth: &str,
) -> MachineTranslationCapability {
    MachineTranslationCapability {
        languages_dynamic: dynamic,
        max_item_characters: item,
        max_batch_characters: batch,
        supports_html: html,
        supports_glossary: glossary,
        usage_capability: usage.into(),
        authentication: auth.into(),
    }
}

pub fn presets() -> Vec<MachineTranslationPreset> {
    vec![
        MachineTranslationPreset {
            id: "deepl-free".into(),
            name: "DeepL API Free".into(),
            protocol: MachineTranslationProtocol::Deepl,
            base_url: "https://api-free.deepl.com".into(),
            credential_fields: vec!["api-key".into()],
            capability: capability(
                true,
                128_000,
                128_000,
                true,
                true,
                "billed-characters",
                "header",
            ),
        },
        MachineTranslationPreset {
            id: "deepl-pro".into(),
            name: "DeepL API Pro".into(),
            protocol: MachineTranslationProtocol::Deepl,
            base_url: "https://api.deepl.com".into(),
            credential_fields: vec!["api-key".into()],
            capability: capability(
                true,
                128_000,
                128_000,
                true,
                true,
                "billed-characters",
                "header",
            ),
        },
        MachineTranslationPreset {
            id: "google-basic-v2".into(),
            name: "Google Cloud Translation Basic v2".into(),
            protocol: MachineTranslationProtocol::GoogleBasicV2,
            base_url: "https://translation.googleapis.com".into(),
            credential_fields: vec!["api-key".into()],
            capability: capability(
                true,
                30_000,
                100_000,
                true,
                false,
                "local-measured",
                "query",
            ),
        },
        MachineTranslationPreset {
            id: "microsoft-v3".into(),
            name: "Microsoft Translator v3".into(),
            protocol: MachineTranslationProtocol::MicrosoftV3,
            base_url: "https://api.cognitive.microsofttranslator.com".into(),
            credential_fields: vec!["api-key".into()],
            capability: capability(
                true,
                50_000,
                50_000,
                true,
                false,
                "metered-characters",
                "header",
            ),
        },
        MachineTranslationPreset {
            id: "baidu-general".into(),
            name: "Baidu General Translation".into(),
            protocol: MachineTranslationProtocol::BaiduGeneral,
            base_url: "https://fanyi-api.baidu.com".into(),
            credential_fields: vec!["app-id".into(), "secret".into()],
            capability: capability(
                false,
                6_000,
                6_000,
                false,
                false,
                "local-measured",
                "signed-form",
            ),
        },
        MachineTranslationPreset {
            id: "tencent-tmt".into(),
            name: "Tencent Cloud TMT".into(),
            protocol: MachineTranslationProtocol::TencentTmt,
            base_url: "https://tmt.tencentcloudapi.com".into(),
            credential_fields: vec!["secret-id".into(), "secret-key".into()],
            capability: capability(
                false,
                2_000,
                10_000,
                false,
                false,
                "local-measured",
                "tc3-hmac",
            ),
        },
        MachineTranslationPreset {
            id: "libretranslate".into(),
            name: "LibreTranslate".into(),
            protocol: MachineTranslationProtocol::LibreTranslate,
            base_url: "https://libretranslate.com".into(),
            credential_fields: vec!["api-key".into()],
            capability: capability(true, 10_000, 50_000, true, false, "local-measured", "body"),
        },
    ]
}

pub fn preset(id: &str) -> Option<MachineTranslationPreset> {
    presets().into_iter().find(|preset| preset.id == id)
}
