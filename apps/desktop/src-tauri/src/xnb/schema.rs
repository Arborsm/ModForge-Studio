use std::collections::BTreeMap;
use std::sync::OnceLock;

use serde::Deserialize;

#[derive(Debug, Clone)]
pub enum CustomTypeSchema {
    Object(ObjectSchema),
    Enum(EnumSchema),
}

#[derive(Debug, Clone)]
pub struct ObjectSchema {
    pub members: Vec<SchemaMember>,
}

#[derive(Debug, Clone)]
pub struct SchemaMember {
    pub name: String,
    pub type_name: String,
}

#[derive(Debug, Clone)]
pub struct EnumSchema {
    pub underlying_type: String,
    pub values: BTreeMap<i32, String>,
}

#[derive(Debug)]
pub struct SchemaRegistry {
    types: BTreeMap<String, CustomTypeSchema>,
}

impl SchemaRegistry {
    pub fn get(&self, type_name: &str) -> Option<&CustomTypeSchema> {
        self.types.get(type_name)
    }

    pub fn contains(&self, type_name: &str) -> bool {
        self.types.contains_key(type_name)
    }
}

pub fn schema_registry() -> &'static SchemaRegistry {
    static REGISTRY: OnceLock<SchemaRegistry> = OnceLock::new();
    REGISTRY.get_or_init(load_schema_registry)
}

fn load_schema_registry() -> SchemaRegistry {
    let raw: RawSchemaFile = serde_json::from_str(include_str!("gamedata_schema.json"))
        .expect("embedded GameData schema JSON must be valid");
    let mut types = BTreeMap::new();

    for (name, raw_type) in raw.types {
        let schema = match raw_type.kind.as_str() {
            "object" => CustomTypeSchema::Object(ObjectSchema {
                members: raw_type
                    .members
                    .unwrap_or_default()
                    .into_iter()
                    .map(|member| SchemaMember {
                        name: member.name,
                        type_name: member.type_name,
                    })
                    .collect(),
            }),
            "enum" => {
                let mut values = BTreeMap::new();
                for value in raw_type.enum_values.unwrap_or_default() {
                    values.insert(value.value, value.name);
                }
                CustomTypeSchema::Enum(EnumSchema {
                    underlying_type: raw_type
                        .underlying_type
                        .unwrap_or_else(|| "System.Int32".to_string()),
                    values,
                })
            }
            other => panic!("Unsupported embedded schema kind: {other}"),
        };
        types.insert(name, schema);
    }

    SchemaRegistry { types }
}

#[derive(Debug, Deserialize)]
struct RawSchemaFile {
    types: BTreeMap<String, RawSchemaType>,
}

#[derive(Debug, Deserialize)]
struct RawSchemaType {
    kind: String,
    #[serde(default)]
    members: Option<Vec<RawSchemaMember>>,
    #[serde(rename = "underlyingType", default)]
    underlying_type: Option<String>,
    #[serde(rename = "enumValues", default)]
    enum_values: Option<Vec<RawEnumValue>>,
}

#[derive(Debug, Deserialize)]
struct RawSchemaMember {
    name: String,
    #[serde(rename = "type")]
    type_name: String,
}

#[derive(Debug, Deserialize)]
struct RawEnumValue {
    name: String,
    value: i32,
}
