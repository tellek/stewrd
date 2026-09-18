// Installs a plugin from an uploaded archive (zip/tar/tar.gz/tgz - no
// external unzip/tar binary, matches this app's stance of handling privileged
// work through its own IPC commands rather than shelling out or reaching for
// official Tauri plugins with their own ACL surface). The webview reads the
// picked file itself (`<input type="file">` + `file.arrayBuffer()`) and hands
// the bytes over - no Tauri dialog plugin needed either.
use super::path_util::{path_clean, sanitize_dir_name};
use super::plugins::resolve_plugins_dir;
use std::io::{Cursor, Read};
use std::path::Path;
use tauri::AppHandle;

/// One file pulled out of an archive, path already relative to the archive
/// root. Both supported archive kinds (zip, tar/tar.gz) are normalized into
/// this shape so the rest of the install logic - prefix stripping,
/// plugin.json lookup, extraction - is written once.
struct ArchiveEntry {
    path: String,
    is_dir: bool,
    contents: Vec<u8>,
}

fn read_zip_entries(bytes: &[u8]) -> Result<Vec<ArchiveEntry>, String> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("invalid zip archive: {e}"))?;
    let mut entries = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| format!("invalid zip entry: {e}"))?;
        let path = file.name().to_string();
        let is_dir = file.is_dir();
        let mut contents = Vec::new();
        if !is_dir {
            file.read_to_end(&mut contents).map_err(|e| format!("failed to read {path}: {e}"))?;
        }
        entries.push(ArchiveEntry { path, is_dir, contents });
    }
    Ok(entries)
}

fn read_tar_entries(bytes: &[u8], gzip: bool) -> Result<Vec<ArchiveEntry>, String> {
    let cursor = Cursor::new(bytes);
    if gzip {
        let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(cursor));
        read_tar_archive(&mut archive)
    } else {
        let mut archive = tar::Archive::new(cursor);
        read_tar_archive(&mut archive)
    }
}

fn read_tar_archive<R: Read>(archive: &mut tar::Archive<R>) -> Result<Vec<ArchiveEntry>, String> {
    let mut entries = Vec::new();
    for entry in archive.entries().map_err(|e| format!("invalid tar archive: {e}"))? {
        let mut entry = entry.map_err(|e| format!("invalid tar entry: {e}"))?;
        let is_dir = entry.header().entry_type().is_dir();
        let path = entry.path().map_err(|e| format!("invalid tar entry path: {e}"))?.to_string_lossy().to_string();
        let mut contents = Vec::new();
        if !is_dir {
            entry.read_to_end(&mut contents).map_err(|e| format!("failed to read {path}: {e}"))?;
        }
        entries.push(ArchiveEntry { path, is_dir, contents });
    }
    Ok(entries)
}

/// Reads every entry, dropping macOS archive noise (`__MACOSX/*`,
/// `.DS_Store`) up front so it never factors into prefix detection below.
fn read_archive_entries(bytes: &[u8], file_name: &str) -> Result<Vec<ArchiveEntry>, String> {
    let lower = file_name.to_ascii_lowercase();
    let mut entries = if lower.ends_with(".zip") {
        read_zip_entries(bytes)?
    } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        read_tar_entries(bytes, true)?
    } else if lower.ends_with(".tar") {
        read_tar_entries(bytes, false)?
    } else {
        return Err(format!(
            "unsupported archive type for '{file_name}' - only .zip, .tar, .tar.gz, and .tgz are supported"
        ));
    };
    entries.retain(|e| !e.path.starts_with("__MACOSX/") && !e.path.ends_with(".DS_Store"));
    Ok(entries)
}

/// A single common top-level directory is stripped only when every entry's
/// path starts with the same first segment *and* that segment is actually
/// used as a directory by at least one entry (some entry path has a `/`
/// after it) - not just "first segment of the first entry", which would
/// misfire on an archive containing exactly one root-level file.
fn detect_common_prefix(entries: &[ArchiveEntry]) -> Option<String> {
    let mut first_segment: Option<&str> = None;
    let mut segment_used_as_dir = false;
    for entry in entries {
        let normalized = entry.path.trim_start_matches('/');
        let mut parts = normalized.splitn(2, '/');
        let seg = parts.next().unwrap_or("");
        if seg.is_empty() {
            continue;
        }
        match first_segment {
            None => first_segment = Some(seg),
            Some(existing) if existing == seg => {}
            Some(_) => return None, // more than one distinct top-level segment
        }
        if parts.next().is_some() {
            segment_used_as_dir = true;
        }
    }
    if segment_used_as_dir {
        first_segment.map(|s| s.to_string())
    } else {
        None
    }
}

fn strip_prefix(path: &str, prefix: &Option<String>) -> String {
    match prefix {
        Some(p) => path.strip_prefix(p).and_then(|s| s.strip_prefix('/')).unwrap_or(path).to_string(),
        None => path.to_string(),
    }
}

#[tauri::command]
pub fn install_plugin_from_archive(app: AppHandle, bytes: Vec<u8>, file_name: String) -> Result<String, String> {
    let entries = read_archive_entries(&bytes, &file_name)?;
    if entries.is_empty() {
        return Err("archive is empty".to_string());
    }
    let prefix = detect_common_prefix(&entries);

    let manifest_entry = entries
        .iter()
        .find(|e| !e.is_dir && strip_prefix(&e.path, &prefix) == "plugin.json")
        .ok_or_else(|| "archive does not contain a plugin.json at its top level".to_string())?;
    let manifest: super::plugins::PluginManifest = serde_json::from_slice(&manifest_entry.contents)
        .map_err(|e| format!("archive's plugin.json is malformed: {e}"))?;

    let Some(dir_name) = sanitize_dir_name(&manifest.id) else {
        return Err(format!("plugin id '{}' is not a valid folder name", manifest.id));
    };

    let plugins_dir = resolve_plugins_dir(&app)?;
    let target_dir = plugins_dir.join(&dir_name);
    if target_dir.exists() {
        return Err(format!("a plugin folder named '{dir_name}' already exists"));
    }
    std::fs::create_dir_all(&target_dir).map_err(|e| format!("could not create {}: {e}", target_dir.display()))?;

    if let Err(e) = extract_entries(&entries, &prefix, &target_dir) {
        let _ = std::fs::remove_dir_all(&target_dir);
        return Err(e);
    }

    if let Err(e) = verify_installed_plugin(&target_dir, &manifest) {
        let _ = std::fs::remove_dir_all(&target_dir);
        return Err(e);
    }

    Ok(dir_name)
}

fn extract_entries(entries: &[ArchiveEntry], prefix: &Option<String>, target_dir: &Path) -> Result<(), String> {
    for entry in entries {
        let relative = strip_prefix(&entry.path, prefix);
        if relative.is_empty() {
            continue;
        }
        let joined = target_dir.join(&relative);
        let cleaned = path_clean(&joined);
        if !cleaned.starts_with(target_dir) {
            return Err(format!("archive entry '{}' escapes the plugin folder", entry.path));
        }
        if entry.is_dir {
            std::fs::create_dir_all(&cleaned).map_err(|e| format!("could not create {}: {e}", cleaned.display()))?;
        } else {
            if let Some(parent) = cleaned.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("could not create {}: {e}", parent.display()))?;
            }
            std::fs::write(&cleaned, &entry.contents).map_err(|e| format!("could not write {}: {e}", cleaned.display()))?;
        }
    }
    Ok(())
}

fn verify_installed_plugin(target_dir: &Path, manifest: &super::plugins::PluginManifest) -> Result<(), String> {
    let manifest_path = target_dir.join("plugin.json");
    if !manifest_path.exists() {
        return Err("extraction failed: plugin.json missing after install".to_string());
    }
    let entry_path = target_dir.join(&manifest.entry);
    if !entry_path.exists() {
        return Err(format!(
            "extraction failed: built entry file '{}' missing after install",
            manifest.entry
        ));
    }
    Ok(())
}
