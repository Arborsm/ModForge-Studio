use crate::domain::modding::attached_api::AttachedApiRegistry;

pub(crate) mod scaleup;

pub(crate) fn load_attached_api_registry(
    _plugin_root_override: Option<&str>,
) -> AttachedApiRegistry {
    AttachedApiRegistry::from_descriptors(&[scaleup::descriptor()])
}
