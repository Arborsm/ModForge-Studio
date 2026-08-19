//! Localization knowledge facade: re-exports glossary, translation memory, scope, and exchange operations.

mod exchange;
mod store;

pub use exchange::{export_knowledge, import_knowledge};
pub use store::*;

#[cfg(test)]
#[path = "../../../tests/unit/domain/localization_knowledge_tests.rs"]
mod tests;
