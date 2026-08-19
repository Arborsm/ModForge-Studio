//! Modding domain: attached API registry for mod-to-mod capability declarations.
//!
//! Also hosts the compat plugin manifest model (`compat_plugin`), the disk-based
//! source for `AttachedApiRegistry` descriptors as of format 1.

pub mod attached_api;
pub(crate) mod compat_plugin;
