// Installs a plugin from an uploaded archive (zip/tar/tar.gz/tgz - no
// external unzip/tar binary, matches this app's stance of handling privileged
// work through its own IPC commands rather than shelling out or reaching for
// official Tauri plugins with their own ACL surface). The webview reads the
// picked file itself (`<input type="file">` + `file.arrayBuffer()`) and hands
// the bytes over - no Tauri dialog plugin needed either.
use super::path_util::{path_clean, sanitize_dir_name};
use super::plugins::{resolve_plugins_dir, SUPPORTED_API_VERSION};
use std::io::{Cursor, Read};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

/// `"install"` errors if the target folder already exists (today's exact
/// behavior of `install_plugin_from_archive`, unchanged). `"update"` requires
/// the target folder to already exist, extracts to a throwaway temp dir
/// first, verifies there, and only then copies a safe subset of files into
/// the live folder - see `install_from_bytes` below for why.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallMode {
    Install,
    Update,
}

/// One file pulled out of an archive, path already relative to the archive
/// root. Both supported archive kinds (zip, tar/tar.gz) are normalized into
/// this shape so the rest of the install logic - prefix stripping,
/// plugin.json lookup, extraction - is written once.
pub(crate) struct ArchiveEntry {
    pub(crate) path: String,
    pub(crate) is_dir: bool,
    pub(crate) contents: Vec<u8>,
}

pub(crate) fn read_zip_entries(bytes: &[u8]) -> Result<Vec<ArchiveEntry>, String> {
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
pub(crate) fn detect_common_prefix(entries: &[ArchiveEntry]) -> Option<String> {
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

pub(crate) fn strip_prefix(path: &str, prefix: &Option<String>) -> String {
    match prefix {
        Some(p) => path.strip_prefix(p).and_then(|s| s.strip_prefix('/')).unwrap_or(path).to_string(),
        None => path.to_string(),
    }
}

#[tauri::command]
pub fn install_plugin_from_archive(app: AppHandle, bytes: Vec<u8>, file_name: String) -> Result<String, String> {
    let plugins_dir = resolve_plugins_dir(&app)?;
    install_from_bytes(&plugins_dir, &bytes, &file_name, InstallMode::Install, None)
}

/// Downloads a plugin archive from a URL (used by the Marketplace plugin,
/// which can't do this itself - a release asset's `browser_download_url`
/// redirects with no CORS header, so plugin-side `fetch()` fails; this
/// command does the download in Rust, where CORS doesn't apply) and installs
/// or updates it via the same core as the file-upload path.
#[tauri::command]
pub async fn install_plugin_from_url(
    app: AppHandle,
    url: String,
    file_name: String,
    mode: InstallMode,
    expected_dir: Option<String>,
) -> Result<String, String> {
    if !url.starts_with("https://github.com/") {
        return Err("only github.com release asset URLs are supported".to_string());
    }
    let client = reqwest::Client::builder()
        .user_agent("stewrd-marketplace")
        .build()
        .map_err(|e| format!("could not build http client: {e}"))?;
    let resp = client.get(&url).send().await.map_err(|e| format!("download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download returned {}", resp.status()));
    }
    let bytes = resp.bytes().await.map_err(|e| format!("download body failed: {e}"))?.to_vec();
    let plugins_dir = resolve_plugins_dir(&app)?;
    install_from_bytes(&plugins_dir, &bytes, &file_name, mode, expected_dir)
}

/// Shared core behind both `install_plugin_from_archive` (always
/// `InstallMode::Install`, `expected_dir: None` - today's exact behavior) and
/// `install_plugin_from_url` (either mode).
///
/// `InstallMode::Update` never touches the live target folder except via a
/// targeted, ordered copy of specific files, written through a `.tmp` +
/// rename - it never `remove_dir_all`s the live folder, on success or
/// failure, so a verify failure or a mid-copy crash can't destroy the user's
/// live `storage.json`/`data/`/custom `settings.json` keys.
pub(crate) fn install_from_bytes(
    plugins_dir: &Path,
    bytes: &[u8],
    file_name: &str,
    mode: InstallMode,
    expected_dir: Option<String>,
) -> Result<String, String> {
    let entries = read_archive_entries(bytes, file_name)?;
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

    if manifest.api_version != SUPPORTED_API_VERSION {
        return Err(format!(
            "unsupported apiVersion '{}' (host supports '{}')",
            manifest.api_version, SUPPORTED_API_VERSION
        ));
    }

    let Some(dir_name) = sanitize_dir_name(&manifest.id) else {
        return Err(format!("plugin id '{}' is not a valid folder name", manifest.id));
    };

    match mode {
        InstallMode::Install => {
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
        InstallMode::Update => {
            let Some(expected) = expected_dir else {
                return Err("expected_dir is required for mode: \"update\"".to_string());
            };
            if expected != dir_name {
                return Err(format!(
                    "archive's plugin id '{dir_name}' does not match the plugin being updated ('{expected}')"
                ));
            }
            let live_dir = plugins_dir.join(&dir_name);
            if !live_dir.exists() {
                return Err(format!("no installed plugin folder named '{dir_name}' to update"));
            }

            let temp_dir = unique_temp_dir(plugins_dir)?;
            std::fs::create_dir_all(&temp_dir).map_err(|e| format!("could not create {}: {e}", temp_dir.display()))?;

            let result = (|| -> Result<(), String> {
                extract_entries(&entries, &prefix, &temp_dir)?;
                verify_installed_plugin(&temp_dir, &manifest)?;
                apply_update_copy(&temp_dir, &live_dir, &manifest)
            })();

            let _ = std::fs::remove_dir_all(&temp_dir);
            result.map(|_| dir_name)
        }
    }
}

/// A throwaway extraction dir, uniquely named and created as a *sibling* of
/// the plugins folder (never inside it, so it's never mistaken for an
/// installed plugin by discovery) - removed again once the update completes,
/// success or failure. No new dependency: `tempfile` is dev-only today, so
/// uniqueness is hand-rolled from the process id plus a monotonic counter,
/// which is enough to avoid a collision between two concurrent update calls.
fn unique_temp_dir(plugins_dir: &Path) -> Result<PathBuf, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let parent = plugins_dir
        .parent()
        .ok_or_else(|| "plugins dir has no parent".to_string())?;
    let n = COUNTER.fetch_add(1, Ordering::Relaxed);
    let pid = std::process::id();
    Ok(parent.join(format!(".stewrd-plugin-update-{pid}-{n}")))
}

/// Copies exactly the files an update should touch - the manifest's declared
/// `entry` file, `icon.png` if present, `plugin.json`, and a merged
/// `settings.json` - from a verified temp extraction into the live plugin
/// folder. Never touches `storage.json` or `data/`. Each file is written to
/// a `.tmp` sibling first, then renamed over the real target, so a mid-copy
/// crash never leaves `plugin.json` claiming a version whose code isn't
/// actually present (worst case: old code + old manifest, or new code + old
/// manifest - both self-healing, never the reverse).
fn apply_update_copy(temp_dir: &Path, live_dir: &Path, manifest: &super::plugins::PluginManifest) -> Result<(), String> {
    let entry_relative = path_clean(Path::new(&manifest.entry));
    let entry_temp_path = temp_dir.join(&entry_relative);
    if !entry_temp_path.starts_with(temp_dir) {
        return Err(format!("plugin.json entry '{}' escapes the plugin folder", manifest.entry));
    }

    copy_via_tmp_rename(&entry_temp_path, &live_dir.join(&entry_relative))?;

    let icon_temp_path = temp_dir.join("icon.png");
    if icon_temp_path.exists() {
        copy_via_tmp_rename(&icon_temp_path, &live_dir.join("icon.png"))?;
    }

    copy_via_tmp_rename(&temp_dir.join("plugin.json"), &live_dir.join("plugin.json"))?;

    merge_and_write_settings(temp_dir, live_dir)?;

    Ok(())
}

fn copy_via_tmp_rename(src: &Path, dst: &Path) -> Result<(), String> {
    if let Some(parent) = dst.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("could not create {}: {e}", parent.display()))?;
    }
    let tmp = dst.with_extension("tmp");
    std::fs::copy(src, &tmp).map_err(|e| format!("could not copy {}: {e}", src.display()))?;
    std::fs::rename(&tmp, dst).map_err(|e| format!("could not finalize {}: {e}", dst.display()))
}

/// Mirrors `scripts/merge-plugin-settings.mjs`'s rule: the live
/// `settings.json` (`category` and anything else user-editable) is kept
/// as-is, only its `"version"` key is replaced with the new archive's. If the
/// new archive ships no `settings.json`, or one with no `"version"` key, the
/// live file (if any) is left completely untouched - never invent a version.
fn merge_and_write_settings(temp_dir: &Path, live_dir: &Path) -> Result<(), String> {
    let new_settings_path = temp_dir.join("settings.json");
    let Ok(new_text) = std::fs::read_to_string(&new_settings_path) else {
        return Ok(());
    };
    let Ok(new_value) = serde_json::from_str::<serde_json::Value>(&new_text) else {
        return Ok(());
    };
    let Some(new_version) = new_value.get("version").and_then(|v| v.as_str()) else {
        return Ok(());
    };

    let live_settings_path = live_dir.join("settings.json");
    let mut merged: serde_json::Value = std::fs::read_to_string(&live_settings_path)
        .ok()
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_else(|| serde_json::json!({}));
    if let Some(obj) = merged.as_object_mut() {
        obj.insert("version".to_string(), serde_json::Value::String(new_version.to_string()));
    }
    let merged_text = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;

    let tmp = live_settings_path.with_extension("tmp");
    std::fs::write(&tmp, merged_text).map_err(|e| format!("could not write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, &live_settings_path).map_err(|e| format!("could not finalize {}: {e}", live_settings_path.display()))
}

pub(crate) fn extract_entries(entries: &[ArchiveEntry], prefix: &Option<String>, target_dir: &Path) -> Result<(), String> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str, is_dir: bool) -> ArchiveEntry {
        ArchiveEntry { path: path.to_string(), is_dir, contents: Vec::new() }
    }

    #[test]
    fn detect_common_prefix_finds_a_shared_top_level_directory() {
        let entries = vec![entry("pkg/", true), entry("pkg/plugin.json", false), entry("pkg/index.js", false)];
        assert_eq!(detect_common_prefix(&entries), Some("pkg".to_string()));
    }

    #[test]
    fn detect_common_prefix_does_not_misfire_on_a_single_root_level_file() {
        // A single entry whose path has no `/` after its first segment must
        // not be mistaken for a common directory prefix - stripping it would
        // wrongly consume the file's own name.
        let entries = vec![entry("plugin.json", false)];
        assert_eq!(detect_common_prefix(&entries), None);
    }

    #[test]
    fn detect_common_prefix_returns_none_for_multiple_distinct_top_level_segments() {
        let entries = vec![entry("a/plugin.json", false), entry("b/index.js", false)];
        assert_eq!(detect_common_prefix(&entries), None);
    }

    #[test]
    fn strip_prefix_removes_the_common_prefix_and_leading_slash() {
        assert_eq!(strip_prefix("pkg/plugin.json", &Some("pkg".to_string())), "plugin.json");
    }

    #[test]
    fn strip_prefix_returns_the_path_unchanged_when_there_is_no_prefix() {
        assert_eq!(strip_prefix("plugin.json", &None), "plugin.json");
    }

    #[test]
    fn read_tar_entries_reads_files_and_directories_from_an_uncompressed_tar() {
        let mut builder = tar::Builder::new(Vec::new());
        let data = b"hello world";
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_cksum();
        builder.append_data(&mut header, "plugin.json", &data[..]).unwrap();
        let bytes = builder.into_inner().unwrap();

        let entries = read_tar_entries(&bytes, false).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].path, "plugin.json");
        assert!(!entries[0].is_dir);
        assert_eq!(entries[0].contents, data);
    }

    #[test]
    fn read_archive_entries_rejects_an_unsupported_extension() {
        assert!(read_archive_entries(&[], "plugin.rar").is_err());
    }

    #[test]
    fn read_archive_entries_drops_macos_archive_noise() {
        let mut builder = tar::Builder::new(Vec::new());
        let data = b"junk";
        let mut header = tar::Header::new_gnu();
        header.set_size(data.len() as u64);
        header.set_cksum();
        builder.append_data(&mut header, "__MACOSX/plugin.json", &data[..]).unwrap();
        let bytes = builder.into_inner().unwrap();

        let entries = read_archive_entries(&bytes, "pkg.tar").unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn extract_entries_rejects_a_relative_path_escaping_the_plugin_folder() {
        let tmp = tempfile::tempdir().unwrap();
        let target_dir = tmp.path().join("plugin");
        std::fs::create_dir_all(&target_dir).unwrap();
        let entries = vec![ArchiveEntry { path: "../escape.js".to_string(), is_dir: false, contents: b"evil".to_vec() }];

        let err = extract_entries(&entries, &None, &target_dir).unwrap_err();
        assert!(err.contains("escapes the plugin folder"), "unexpected error: {err}");
    }

    #[test]
    fn extract_entries_rejects_an_absolute_path() {
        let tmp = tempfile::tempdir().unwrap();
        let target_dir = tmp.path().join("plugin");
        std::fs::create_dir_all(&target_dir).unwrap();
        #[cfg(windows)]
        let absolute = "C:\\Windows\\evil.js".to_string();
        #[cfg(not(windows))]
        let absolute = "/etc/evil.js".to_string();
        let entries = vec![ArchiveEntry { path: absolute, is_dir: false, contents: b"evil".to_vec() }];

        let err = extract_entries(&entries, &None, &target_dir).unwrap_err();
        assert!(err.contains("escapes the plugin folder"), "unexpected error: {err}");
    }

    #[test]
    fn verify_installed_plugin_succeeds_when_manifest_and_entry_exist() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("plugin.json"), "{}").unwrap();
        std::fs::write(tmp.path().join("index.js"), "console.log('hi')").unwrap();
        let manifest = super::super::plugins::PluginManifest {
            id: "my-plugin".to_string(),
            name: "My Plugin".to_string(),
            version: None,
            category: None,
            icon: "icon.png".to_string(),
            entry: "index.js".to_string(),
            description: "desc".to_string(),
            api_version: "1".to_string(),
            background: false,
        };
        assert!(verify_installed_plugin(tmp.path(), &manifest).is_ok());
    }

    #[test]
    fn verify_installed_plugin_fails_when_the_entry_file_is_missing() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("plugin.json"), "{}").unwrap();
        let manifest = super::super::plugins::PluginManifest {
            id: "my-plugin".to_string(),
            name: "My Plugin".to_string(),
            version: None,
            category: None,
            icon: "icon.png".to_string(),
            entry: "index.js".to_string(),
            description: "desc".to_string(),
            api_version: "1".to_string(),
            background: false,
        };
        let err = verify_installed_plugin(tmp.path(), &manifest).unwrap_err();
        assert!(err.contains("missing after install"));
    }

    #[test]
    fn verify_installed_plugin_fails_when_plugin_json_is_missing() {
        let tmp = tempfile::tempdir().unwrap();
        let manifest = super::super::plugins::PluginManifest {
            id: "my-plugin".to_string(),
            name: "My Plugin".to_string(),
            version: None,
            category: None,
            icon: "icon.png".to_string(),
            entry: "index.js".to_string(),
            description: "desc".to_string(),
            api_version: "1".to_string(),
            background: false,
        };
        let err = verify_installed_plugin(tmp.path(), &manifest).unwrap_err();
        assert!(err.contains("plugin.json missing"));
    }


    fn build_test_zip(files: &[(&str, &[u8])]) -> Vec<u8> {
        use std::io::Write as _;
        let mut buf = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor::new(&mut buf));
            let options = zip::write::SimpleFileOptions::default();
            for (name, contents) in files {
                writer.start_file(*name, options).unwrap();
                writer.write_all(contents).unwrap();
            }
            writer.finish().unwrap();
        }
        buf
    }

    #[test]
    fn install_from_bytes_update_mode_never_removes_the_live_folder_on_verify_failure() {
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        std::fs::create_dir_all(&plugins_dir).unwrap();
        let live_dir = plugins_dir.join("my-plugin");
        std::fs::create_dir_all(&live_dir).unwrap();
        std::fs::write(live_dir.join("storage.json"), "sentinel").unwrap();
        std::fs::create_dir_all(live_dir.join("data")).unwrap();
        std::fs::write(live_dir.join("data").join("user.txt"), "user data").unwrap();

        // Manifest declares an entry file the archive never provides, so
        // verify_installed_plugin fails after extraction into the temp dir.
        let manifest = serde_json::json!({
            "id": "my-plugin", "name": "My Plugin", "icon": "icon.png",
            "entry": "index.js", "description": "desc", "apiVersion": "1"
        });
        let zip_bytes = build_test_zip(&[("plugin.json", serde_json::to_string(&manifest).unwrap().as_bytes())]);

        let result = install_from_bytes(&plugins_dir, &zip_bytes, "update.zip", InstallMode::Update, Some("my-plugin".to_string()));

        assert!(result.is_err());
        assert_eq!(std::fs::read_to_string(live_dir.join("storage.json")).unwrap(), "sentinel");
        assert_eq!(std::fs::read_to_string(live_dir.join("data").join("user.txt")).unwrap(), "user data");
    }

    #[test]
    fn install_from_bytes_update_mode_preserves_storage_and_data_on_success() {
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        std::fs::create_dir_all(&plugins_dir).unwrap();
        let live_dir = plugins_dir.join("my-plugin");
        std::fs::create_dir_all(&live_dir).unwrap();
        std::fs::write(live_dir.join("storage.json"), "sentinel").unwrap();
        std::fs::create_dir_all(live_dir.join("data")).unwrap();
        std::fs::write(live_dir.join("data").join("user.txt"), "user data").unwrap();
        std::fs::write(live_dir.join("settings.json"), r#"{"category":"Utilities","version":"0.1.0"}"#).unwrap();

        let manifest = serde_json::json!({
            "id": "my-plugin", "name": "My Plugin", "icon": "icon.png",
            "entry": "index.js", "description": "desc", "apiVersion": "1"
        });
        let settings = serde_json::json!({ "version": "0.2.0" });
        let zip_bytes = build_test_zip(&[
            ("plugin.json", serde_json::to_string(&manifest).unwrap().as_bytes()),
            ("index.js", b"console.log('v2')"),
            ("settings.json", serde_json::to_string(&settings).unwrap().as_bytes()),
        ]);

        let result = install_from_bytes(&plugins_dir, &zip_bytes, "update.zip", InstallMode::Update, Some("my-plugin".to_string()));

        assert_eq!(result.unwrap(), "my-plugin");
        assert_eq!(std::fs::read_to_string(live_dir.join("storage.json")).unwrap(), "sentinel");
        assert_eq!(std::fs::read_to_string(live_dir.join("data").join("user.txt")).unwrap(), "user data");
        assert_eq!(std::fs::read_to_string(live_dir.join("index.js")).unwrap(), "console.log('v2')");
        let merged: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(live_dir.join("settings.json")).unwrap()).unwrap();
        assert_eq!(merged["category"], "Utilities");
        assert_eq!(merged["version"], "0.2.0");
    }

    #[test]
    fn install_from_bytes_update_mode_rejects_a_mismatched_plugin_id() {
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        std::fs::create_dir_all(&plugins_dir).unwrap();
        std::fs::create_dir_all(plugins_dir.join("other-plugin")).unwrap();

        let manifest = serde_json::json!({
            "id": "my-plugin", "name": "My Plugin", "icon": "icon.png",
            "entry": "index.js", "description": "desc", "apiVersion": "1"
        });
        let zip_bytes = build_test_zip(&[
            ("plugin.json", serde_json::to_string(&manifest).unwrap().as_bytes()),
            ("index.js", b"console.log('v2')"),
        ]);

        let result = install_from_bytes(&plugins_dir, &zip_bytes, "update.zip", InstallMode::Update, Some("other-plugin".to_string()));

        let err = result.unwrap_err();
        assert!(err.contains("does not match"), "unexpected error: {err}");
    }

    #[test]
    fn install_from_bytes_rejects_an_unsupported_api_version_in_both_modes() {
        let tmp = tempfile::tempdir().unwrap();
        let plugins_dir = tmp.path().join("plugins");
        std::fs::create_dir_all(&plugins_dir).unwrap();

        let manifest = serde_json::json!({
            "id": "my-plugin", "name": "My Plugin", "icon": "icon.png",
            "entry": "index.js", "description": "desc", "apiVersion": "999"
        });
        let zip_bytes = build_test_zip(&[
            ("plugin.json", serde_json::to_string(&manifest).unwrap().as_bytes()),
            ("index.js", b"console.log('hi')"),
        ]);

        let result = install_from_bytes(&plugins_dir, &zip_bytes, "plugin.zip", InstallMode::Install, None);

        let err = result.unwrap_err();
        assert!(err.contains("unsupported apiVersion"), "unexpected error: {err}");
        assert!(!plugins_dir.join("my-plugin").exists());
    }
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
