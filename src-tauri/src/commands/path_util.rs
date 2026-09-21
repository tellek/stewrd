// Small path-safety helpers shared by anything that turns webview-supplied
// strings into filesystem paths: plugin dir lookups, deletes, and archive
// extraction. Kept in one place so the safety properties are obviously
// shared rather than re-derived per call site.
use std::path::{Path, PathBuf};

/// The folder the running executable lives in - the single root everything
/// app-level (log file, boot-marks/disabled-plugins state, the `plugins`
/// folder itself) is anchored under. Deliberately has no app-data fallback:
/// this app is portable-by-design, so if the exe's own folder isn't
/// writable that's a real error, not something to silently paper over by
/// writing somewhere the user didn't install it.
pub(crate) fn exe_dir() -> Result<PathBuf, String> {
    std::env::current_exe()
        .map_err(|e| format!("could not resolve current exe path: {e}"))?
        .parent()
        .ok_or_else(|| "exe path has no parent directory".to_string())
        .map(|p| p.to_path_buf())
}

/// Resolves `..`/`.` components without touching the filesystem (unlike
/// `Path::canonicalize`, which requires the path to exist). Used to check
/// whether a relative path - e.g. one entry's name out of an archive -
/// would escape a root directory once joined onto it.
pub(crate) fn path_clean(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::ParentDir => {
                out.pop();
            }
            std::path::Component::CurDir => {}
            other => out.push(other),
        }
    }
    out
}

/// Narrow check for values that are already a discovered plugin's own `dir`
/// name coming back from the frontend (e.g. an icon lookup) - just rejects
/// empty/`.`/`..`/path separators. Not a sanitizer for attacker-controlled
/// input that drives a delete or an archive-extraction target - use
/// `sanitize_dir_name` for that.
pub(crate) fn is_valid_dir_segment(dir: &str) -> bool {
    !dir.is_empty() && dir != "." && dir != ".." && !dir.contains('/') && !dir.contains('\\')
}

const RESERVED_WINDOWS_NAMES: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
    "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Strict allow-list sanitizer for a directory name that will be created,
/// deleted, or extracted into directly from untrusted input (a plugin's own
/// declared `id`, or a webview-supplied `dir`). Deliberately stricter than
/// `is_valid_dir_segment`: rejects anything outside `[A-Za-z0-9._-]`, a
/// leading dot, and Windows-reserved device names, since those can otherwise
/// do things `is_valid_dir_segment` alone doesn't catch (a value like `"C:"`
/// isn't blocked by `is_valid_dir_segment` and would make `PathBuf::join`
/// discard the base path entirely on Windows via the drive prefix).
pub(crate) fn sanitize_dir_name(raw: &str) -> Option<String> {
    if raw.is_empty() || raw.len() > 100 {
        return None;
    }
    if raw.starts_with('.') {
        return None;
    }
    if !raw.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-') {
        return None;
    }
    let upper = raw.to_ascii_uppercase();
    let stem = upper.split('.').next().unwrap_or(&upper);
    if RESERVED_WINDOWS_NAMES.contains(&stem) {
        return None;
    }
    Some(raw.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_clean_resolves_dot_and_dotdot_components() {
        assert_eq!(path_clean(Path::new("a/./b/../c")), PathBuf::from("a/c"));
    }

    #[test]
    fn path_clean_pops_above_root_when_given_extra_parent_dirs() {
        assert_eq!(path_clean(Path::new("../../a")), PathBuf::from("a"));
    }

    #[test]
    fn is_valid_dir_segment_rejects_empty_dot_dotdot_and_separators() {
        assert!(!is_valid_dir_segment(""));
        assert!(!is_valid_dir_segment("."));
        assert!(!is_valid_dir_segment(".."));
        assert!(!is_valid_dir_segment("a/b"));
        assert!(!is_valid_dir_segment("a\\b"));
    }

    #[test]
    fn is_valid_dir_segment_accepts_a_normal_name() {
        assert!(is_valid_dir_segment("my-plugin"));
    }

    #[test]
    fn sanitize_dir_name_rejects_windows_reserved_names_case_insensitively_with_or_without_extension() {
        assert!(sanitize_dir_name("CON").is_none());
        assert!(sanitize_dir_name("con").is_none());
        assert!(sanitize_dir_name("Con.txt").is_none());
        assert!(sanitize_dir_name("NUL").is_none());
        assert!(sanitize_dir_name("com1").is_none());
        assert!(sanitize_dir_name("COM1.tar.gz").is_none());
    }

    #[test]
    fn sanitize_dir_name_rejects_names_over_100_chars() {
        let long = "a".repeat(101);
        assert!(sanitize_dir_name(&long).is_none());
        let ok = "a".repeat(100);
        assert!(sanitize_dir_name(&ok).is_some());
    }

    #[test]
    fn sanitize_dir_name_rejects_a_leading_dot() {
        assert!(sanitize_dir_name(".hidden").is_none());
    }

    #[test]
    fn sanitize_dir_name_rejects_a_drive_letter_style_input() {
        assert!(sanitize_dir_name("C:").is_none());
    }

    #[test]
    fn sanitize_dir_name_accepts_a_normal_plugin_id() {
        assert_eq!(sanitize_dir_name("my-plugin_1.0").as_deref(), Some("my-plugin_1.0"));
    }
}
