// Shared by plugin_icons.rs and category_icons.rs: reads an image file and
// returns it as a data URL so the frontend can render it with zero
// asset-protocol/filesystem-plugin configuration.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::Path;

pub fn read_as_data_url(path: &Path, mime: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}
