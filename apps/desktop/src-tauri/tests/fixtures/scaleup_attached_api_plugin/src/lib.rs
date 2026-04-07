#[repr(C)]
pub struct AttachedApiDescriptorJsonV1 {
    pub json_ptr: *const u8,
    pub json_len: usize,
}

const DESCRIPTOR_JSON: &[u8] = br#"{
  "schemaVersion": 1,
  "module": {
    "id": "modforge.scaleup.attached-api",
    "version": "1.0.0"
  },
  "entries": [
    {
      "providerUniqueId": "Arborsm.ScaleUpUnofficial",
      "providesUniqueIds": [
        "Arborsm.ScaleUpUnofficial",
        "Platonymous.ScaleUp",
        "BleakCodex.SpritesInDetail"
      ],
      "targets": [
        {
          "assetPath": "Assets",
          "assetKind": "json"
        },
        {
          "assetPath": "PreviewTexture",
          "assetKind": "image"
        }
      ]
    }
  ]
}"#;

#[no_mangle]
pub extern "C" fn modforge_attached_api_get_descriptor_json_v1() -> AttachedApiDescriptorJsonV1 {
    AttachedApiDescriptorJsonV1 {
        json_ptr: DESCRIPTOR_JSON.as_ptr(),
        json_len: DESCRIPTOR_JSON.len(),
    }
}
