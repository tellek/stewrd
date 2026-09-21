// Shared by plugin_icons.rs and category_icons.rs: reads an image file and
// returns it as a data URL so the frontend can render it with zero
// asset-protocol/filesystem-plugin configuration.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::path::Path;

pub fn read_as_data_url(path: &Path, mime: &str) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    Some(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_none_for_a_missing_file() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("does-not-exist.png");
        assert!(read_as_data_url(&path, "image/png").is_none());
    }

    #[test]
    fn wraps_arbitrary_bytes_as_base64_without_validating_image_content() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("not-really-an-image.png");
        std::fs::write(&path, b"not an image, just bytes").unwrap();

        let url = read_as_data_url(&path, "image/png").unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
        assert_eq!(url, format!("data:image/png;base64,{}", STANDARD.encode(b"not an image, just bytes")));
    }
}
