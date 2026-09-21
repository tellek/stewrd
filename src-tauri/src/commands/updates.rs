// Self-built auto-update: checks GitHub Releases on launch, downloads and
// verifies a newer build in the background, and applies it (self-replacing
// the running exe) at the very start of the *next* launch. See
// docs/auto-update-options.md and the plan this was built from for the full
// rationale - short version: no NSIS installer, no tauri-plugin-updater,
// because build-release.bat deploys loose files, not an installed app.
//
// Version source of truth is tauri.conf.json's `version` field, exposed at
// compile time as STEWRD_APP_VERSION by build.rs - not Cargo.toml's, which
// is easy to forget bumping and would otherwise cause a same-version-forever
// update loop (or a silent downgrade) if the two ever drifted.
use crate::commands::logging::{append_log_line_internal, build_log_line, log_line_to_disk_and_ui};
use crate::commands::path_util::exe_dir;
use crate::commands::plugin_install::{detect_common_prefix, extract_entries, ArchiveEntry};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const REPO: &str = "tellek/stewrd";
const USER_AGENT: &str = "stewrd-updater";

/// Tauri's `signer generate`/`signer sign` output is itself base64-encoded
/// text wrapping the standard two-line minisign format
/// (`untrusted comment: ...` then the key/signature line) - this is that
/// public key file's contents verbatim, generated once via
/// `npx tauri signer generate` and never checked in as anything but this
/// embedded constant. The matching private key lives outside the repo
/// (`C:\Users\chris\.stewrd-signing\update-signing-key`) and must be kept
/// secret; losing it means no future update can ever be verified again.
const MINISIGN_PUBLIC_KEY_B64: &str =
    "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDcxQUY3RERFNjg2NEVENTMKUldSVDdXUm8zbjJ2Y1d2RUVGSnhsVjNqOHUwRHRSN3Nod2NSZnhjeTBtZktCZ2EwSk1ic3Vkbm0K";

fn current_version() -> semver::Version {
    // Always a valid semver at compile time - build.rs already asserts
    // tauri.conf.json has a `version` field, and that field is documented as
    // semver by Tauri itself. A parse failure here would mean the config is
    // broken in a way the rest of the app can't run with either.
    semver::Version::parse(env!("STEWRD_APP_VERSION")).expect("STEWRD_APP_VERSION is not valid semver")
}

/// The one directory both the pre-Builder apply step (no AppHandle yet) and
/// the post-setup check task (has one) stage updates under. Deliberately not
/// `app.path().app_local_data_dir()` (resolves to `%LOCALAPPDATA%\com.topher.stewrd`,
/// the Tauri `identifier`) so both call sites agree without one of them
/// needing an AppHandle it doesn't have.
pub(crate) fn update_state_dir() -> Result<PathBuf, String> {
    let base = std::env::var("LOCALAPPDATA").map_err(|_| "LOCALAPPDATA is not set".to_string())?;
    Ok(PathBuf::from(base).join("stewrd"))
}

/// Holds an exclusive Windows lock for as long as the returned guard is
/// alive - `std::fs::OpenOptions`'s Windows default share mode is
/// `FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE`, which does NOT
/// deny a second open, so `share_mode(0)` must be set explicitly or two
/// instances would both believe they hold the lock.
#[allow(dead_code)] // held only for its RAII drop - releases the lock when it goes out of scope
struct UpdateLock(std::fs::File);

fn acquire_lock(state_dir: &Path) -> Result<UpdateLock, String> {
    std::fs::create_dir_all(state_dir).map_err(|e| format!("could not create {}: {e}", state_dir.display()))?;
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        let file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .share_mode(0)
            .open(state_dir.join("update.lock"))
            .map_err(|e| format!("update lock held by another instance: {e}"))?;
        Ok(UpdateLock(file))
    }
    #[cfg(not(windows))]
    {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .write(true)
            .open(state_dir.join("update.lock"))
            .map_err(|e| format!("could not open update lock: {e}"))?;
        Ok(UpdateLock(file))
    }
}

#[derive(Debug, Deserialize)]
struct GhAsset {
    name: String,
    size: u64,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    published_at: Option<String>,
    html_url: String,
    assets: Vec<GhAsset>,
}

/// Release summary sent to the frontend's Release Notes tab - a trimmed
/// projection of `GhRelease`, no asset/download plumbing exposed to the UI.
#[derive(Debug, Serialize)]
pub struct ReleaseInfo {
    pub tag: String,
    pub name: String,
    pub body: String,
    #[serde(rename = "publishedAt")]
    pub published_at: Option<String>,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct UpdateMeta {
    version: String,
    #[serde(default, rename = "failCount")]
    fail_count: u32,
}

/// The version currently staged in `pending-update\` and ready to apply on
/// the next launch, if any - backs the Settings > Version tab's "restart to
/// apply" messaging. `None` covers both "nothing staged" and "staged but
/// unreadable/corrupt" alike; either way there's nothing to tell the user to
/// restart for.
#[tauri::command]
pub fn pending_update_version() -> Option<String> {
    let state_dir = update_state_dir().ok()?;
    let meta_text = std::fs::read_to_string(state_dir.join("pending-update").join("meta.json")).ok()?;
    let meta: UpdateMeta = serde_json::from_str(&meta_text).ok()?;
    Some(meta.version)
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("could not build http client: {e}"))
}

#[tauri::command]
pub async fn list_releases() -> Result<Vec<ReleaseInfo>, String> {
    let client = http_client()?;
    let url = format!("https://api.github.com/repos/{REPO}/releases?per_page=10");
    let resp = client.get(&url).send().await.map_err(|e| format!("request failed: {e}"))?;
    if resp.status() == reqwest::StatusCode::FORBIDDEN {
        return Err("rate limited by GitHub - try again later".to_string());
    }
    if !resp.status().is_success() {
        return Err(format!("GitHub returned {}", resp.status()));
    }
    let releases: Vec<GhRelease> = resp.json().await.map_err(|e| format!("could not parse response: {e}"))?;
    Ok(releases
        .into_iter()
        .map(|r| ReleaseInfo {
            name: r.name.clone().unwrap_or_else(|| r.tag_name.clone()),
            tag: r.tag_name,
            body: r.body.unwrap_or_default(),
            published_at: r.published_at,
            url: r.html_url,
        })
        .collect())
}

/// Decodes one of Tauri's base64-wrapped minisign text blobs (the embedded
/// public key, or a downloaded `.sig` file's contents) back to the plain
/// multi-line minisign text `PublicKey::decode`/`Signature::decode` expect -
/// the *whole* block (comment line(s) included), not just one line: a
/// `.sig` file is four lines (untrusted comment, per-file signature, trusted
/// comment, global signature over the trusted comment) and the trusted
/// comment/global signature are part of what gets verified, not decoration.
fn decode_minisign_field(b64: &str) -> Result<String, String> {
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| format!("invalid base64: {e}"))?;
    String::from_utf8(decoded).map_err(|e| format!("not valid utf8: {e}"))
}

fn verify_signature(zip_bytes: &[u8], sig_b64: &str) -> Result<(), String> {
    let pubkey_text = decode_minisign_field(MINISIGN_PUBLIC_KEY_B64)?;
    let sig_text = decode_minisign_field(sig_b64)?;
    let public_key = minisign_verify::PublicKey::decode(&pubkey_text).map_err(|e| format!("bad embedded public key: {e}"))?;
    let signature = minisign_verify::Signature::decode(&sig_text).map_err(|e| format!("bad signature: {e}"))?;
    public_key.verify(zip_bytes, &signature, false).map_err(|e| format!("signature verification failed: {e}"))
}

async fn download(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let resp = client.get(url).send().await.map_err(|e| format!("download failed: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("download returned {}", resp.status()));
    }
    resp.bytes().await.map(|b| b.to_vec()).map_err(|e| format!("download body failed: {e}"))
}

/// Extracts a zip's contents (reusing plugin_install.rs's prefix-stripping so
/// the release archive's internal layout doesn't matter) into `target_dir`,
/// clearing it first.
fn extract_zip_flat(bytes: &[u8], target_dir: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).map_err(|e| format!("invalid zip: {e}"))?;
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
    let prefix = detect_common_prefix(&entries);
    std::fs::create_dir_all(target_dir).map_err(|e| format!("could not create {}: {e}", target_dir.display()))?;
    extract_entries(&entries, &prefix, target_dir)
}

fn log_warning(app: &AppHandle, message: &str) {
    log_line_to_disk_and_ui(app, "warning", None, message);
}

/// Background task spawned from `.setup()`. Never blocks startup and never
/// panics past this function boundary - every failure is a logged warning,
/// not a propagated error.
pub async fn check_for_update(app: AppHandle) {
    let state_dir = match update_state_dir() {
        Ok(d) => d,
        Err(e) => return log_warning(&app, &format!("Update check failed: {e}")),
    };

    let client = match http_client() {
        Ok(c) => c,
        Err(e) => return log_warning(&app, &format!("Update check failed: {e}")),
    };
    let url = format!("https://api.github.com/repos/{REPO}/releases/latest");
    let resp = match client.get(&url).send().await {
        Ok(r) => r,
        Err(e) => return log_warning(&app, &format!("Update check failed: {e}")),
    };
    if !resp.status().is_success() {
        return log_warning(&app, &format!("Update check failed: GitHub returned {}", resp.status()));
    }
    let release: GhRelease = match resp.json().await {
        Ok(r) => r,
        Err(e) => return log_warning(&app, &format!("Update check failed: {e}")),
    };

    let latest_version = match semver::Version::parse(release.tag_name.trim_start_matches('v')) {
        Ok(v) => v,
        Err(e) => return log_warning(&app, &format!("Update check failed: bad version tag: {e}")),
    };
    if latest_version <= current_version() {
        return;
    }

    let pending_dir = state_dir.join("pending-update");
    if let Ok(existing) = std::fs::read_to_string(pending_dir.join("meta.json")) {
        if let Ok(meta) = serde_json::from_str::<UpdateMeta>(&existing) {
            if meta.version == latest_version.to_string() {
                return; // already staged, waiting on a restart
            }
        }
    }

    let _lock = match acquire_lock(&state_dir) {
        Ok(l) => l,
        Err(_) => return, // another instance is mid-update; skip silently this launch
    };

    let Some(zip_asset) = release.assets.iter().find(|a| a.name.ends_with(".zip")) else {
        return log_warning(&app, "Update check failed: release has no .zip asset");
    };
    let Some(sig_asset) = release.assets.iter().find(|a| a.name.ends_with(".sig")) else {
        return log_warning(&app, "Update check failed: release has no .sig asset");
    };

    let _ = std::fs::remove_dir_all(&pending_dir);
    let tmp_dir = state_dir.join("pending-update.tmp");
    let _ = std::fs::remove_dir_all(&tmp_dir);
    if let Err(e) = std::fs::create_dir_all(&tmp_dir) {
        return log_warning(&app, &format!("Update check failed: {e}"));
    }

    let zip_bytes = match download(&client, &zip_asset.browser_download_url).await {
        Ok(b) => b,
        Err(e) => return log_warning(&app, &format!("Update check failed: {e}")),
    };
    if zip_bytes.len() as u64 != zip_asset.size {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return log_warning(&app, "Update check failed: downloaded file size mismatch");
    }
    let sig_text = match download(&client, &sig_asset.browser_download_url).await {
        Ok(b) => String::from_utf8_lossy(&b).to_string(),
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return log_warning(&app, &format!("Update check failed: {e}"));
        }
    };

    if let Err(e) = verify_signature(&zip_bytes, &sig_text) {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return log_warning(&app, &format!("Update check failed: {e}"));
    }

    if let Err(e) = extract_zip_flat(&zip_bytes, &tmp_dir) {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return log_warning(&app, &format!("Update check failed: {e}"));
    }
    if !tmp_dir.join("stewrd.exe").exists() {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return log_warning(&app, "Update check failed: release archive missing stewrd.exe");
    }

    let meta = UpdateMeta { version: latest_version.to_string(), fail_count: 0 };
    let meta_json = match serde_json::to_string(&meta) {
        Ok(j) => j,
        Err(e) => {
            let _ = std::fs::remove_dir_all(&tmp_dir);
            return log_warning(&app, &format!("Update check failed: {e}"));
        }
    };
    if let Err(e) = std::fs::write(tmp_dir.join("meta.json"), meta_json) {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return log_warning(&app, &format!("Update check failed: {e}"));
    }

    if let Err(e) = std::fs::rename(&tmp_dir, &pending_dir) {
        let _ = std::fs::remove_dir_all(&tmp_dir);
        return log_warning(&app, &format!("Update check failed: {e}"));
    }

    log_line_to_disk_and_ui(&app, "success", None, &format!("Update v{latest_version} downloaded — restart to apply."));
}

fn log_apply_warning(exe_dir_hint: Option<&Path>, message: &str) {
    let resolved = match exe_dir_hint {
        Some(p) => Ok(p.to_path_buf()),
        None => exe_dir(),
    };
    match resolved {
        Ok(dir) => {
            let line = build_log_line("warning", None, message);
            let _ = append_log_line_internal(&dir, &line);
        }
        Err(_) => eprintln!("[stewrd] {message}"),
    }
}

/// Called at the very top of `run()`, before `tauri::Builder::default()` -
/// no AppHandle exists yet, so failures can only be logged to disk (picked
/// up by the frontend once it hydrates) or as a last resort to stderr. Must
/// never panic: release builds are `panic = "abort"` and the panic hook
/// isn't installed until `.setup()`, so a panic here is a silent,
/// unrecoverable, permanent launch failure.
pub fn apply_pending_update_if_present() {
    let state_dir = match update_state_dir() {
        Ok(d) => d,
        Err(_) => return,
    };
    let _lock = match acquire_lock(&state_dir) {
        Ok(l) => l,
        Err(_) => return, // another instance holds it; retry next launch
    };

    let pending_dir = state_dir.join("pending-update");
    let meta_path = pending_dir.join("meta.json");
    let meta_text = match std::fs::read_to_string(&meta_path) {
        Ok(t) => t,
        Err(_) => return, // nothing staged - the common case
    };
    let mut meta: UpdateMeta = match serde_json::from_str(&meta_text) {
        Ok(m) => m,
        Err(_) => {
            let _ = std::fs::remove_dir_all(&pending_dir); // malformed stage can't be trusted
            return;
        }
    };

    let staged_version = match semver::Version::parse(&meta.version) {
        Ok(v) => v,
        Err(_) => {
            let _ = std::fs::remove_dir_all(&pending_dir);
            return;
        }
    };
    if staged_version <= current_version() {
        // Stale stage (e.g. a newer build was hand-deployed since staging) -
        // applying it now would be a silent downgrade.
        let _ = std::fs::remove_dir_all(&pending_dir);
        return;
    }

    let staged_exe = pending_dir.join("stewrd.exe");
    if !staged_exe.exists() {
        let _ = std::fs::remove_dir_all(&pending_dir);
        return;
    }

    let exe_dir_result = exe_dir();
    let Ok(deploy_dir) = exe_dir_result else {
        log_apply_warning(None, "Update apply failed: could not resolve exe directory");
        return;
    };

    // One backup generation, kept (not deleted) after a successful update -
    // its entire purpose is surviving the update that just happened.
    if let Ok(current_exe) = std::env::current_exe() {
        let _ = std::fs::copy(&current_exe, deploy_dir.join("stewrd.exe.bak"));
    }

    if let Err(e) = self_replace::self_replace(&staged_exe) {
        meta.fail_count += 1;
        log_apply_warning(Some(&deploy_dir), &format!("Update apply failed: {e}"));
        if meta.fail_count >= 3 {
            let _ = std::fs::remove_dir_all(&pending_dir);
        } else if let Ok(json) = serde_json::to_string(&meta) {
            let _ = std::fs::write(&meta_path, json);
        }
        return;
    }

    // assets/ ships as part of a release (build.rs / tauri.conf.json's
    // bundle.resources) and is copied add-only, same as build-release.bat's
    // own deploy step, so a user's customized icons survive.
    copy_add_only(&pending_dir.join("assets"), &deploy_dir.join("assets"));

    let _ = std::fs::remove_dir_all(&pending_dir);

    let marker = serde_json::json!({ "version": meta.version }).to_string();
    let _ = std::fs::write(state_dir.join("just-updated.json"), marker);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn current_version_matches_the_compiled_in_crate_version() {
        // STEWRD_APP_VERSION comes from build.rs / tauri.conf.json, not
        // Cargo.toml - just assert it parses to a valid, non-zero semver.
        let v = current_version();
        assert!(v.major > 0 || v.minor > 0 || v.patch > 0);
    }

    #[test]
    fn decode_minisign_field_errors_on_bad_base64() {
        assert!(decode_minisign_field("not valid base64 !!!").is_err());
    }

    #[test]
    fn decode_minisign_field_errors_on_non_utf8_decoded_bytes() {
        use base64::Engine;
        let non_utf8_bytes = [0xff, 0xfe, 0xfd];
        let b64 = base64::engine::general_purpose::STANDARD.encode(non_utf8_bytes);
        assert!(decode_minisign_field(&b64).is_err());
    }

    #[test]
    fn verify_signature_fails_on_a_garbage_signature_string() {
        use base64::Engine;
        let sig_b64 = base64::engine::general_purpose::STANDARD.encode(b"not a minisign signature");
        let result = verify_signature(b"some zip bytes", &sig_b64);
        assert!(result.is_err());
    }

    #[test]
    fn verify_signature_fails_on_a_well_formed_but_wrong_signature() {
        use base64::Engine;
        // Well-formed minisign signature shape but not one that could ever
        // verify against the embedded public key or these bytes.
        let fake_sig_text = "untrusted comment: signature from minisign secret key\n\
            RWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==\n\
            trusted comment: timestamp:0\tfile:none\n\
            RWQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==\n";
        let sig_b64 = base64::engine::general_purpose::STANDARD.encode(fake_sig_text);
        let result = verify_signature(b"some zip bytes", &sig_b64);
        assert!(result.is_err());
    }

    fn build_test_zip(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut buf = Vec::new();
        {
            let mut writer = zip::ZipWriter::new(Cursor2::new(&mut buf));
            let options = zip::write::SimpleFileOptions::default();
            for (name, contents) in files {
                writer.start_file(*name, options).unwrap();
                writer.write_all(contents).unwrap();
            }
            writer.finish().unwrap();
        }
        buf
    }

    // zip::ZipWriter needs Write + Seek; Cursor<&mut Vec<u8>> covers both.
    type Cursor2<'a> = std::io::Cursor<&'a mut Vec<u8>>;

    #[test]
    fn extract_zip_flat_extracts_files_into_the_target_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let target = tmp.path().join("out");
        let zip_bytes = build_test_zip(&[("stewrd.exe", b"binary"), ("assets/icon.png", b"icon")]);

        extract_zip_flat(&zip_bytes, &target).unwrap();

        assert_eq!(std::fs::read(target.join("stewrd.exe")).unwrap(), b"binary");
        assert_eq!(std::fs::read(target.join("assets").join("icon.png")).unwrap(), b"icon");
    }

    #[test]
    fn copy_add_only_copies_files_that_do_not_exist_at_dest() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        let dst = tmp.path().join("dst");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::write(src.join("new.txt"), "new content").unwrap();

        copy_add_only(&src, &dst);

        assert_eq!(std::fs::read_to_string(dst.join("new.txt")).unwrap(), "new content");
    }

    #[test]
    fn copy_add_only_does_not_overwrite_files_that_already_exist_at_dest() {
        let tmp = tempfile::tempdir().unwrap();
        let src = tmp.path().join("src");
        let dst = tmp.path().join("dst");
        std::fs::create_dir_all(&src).unwrap();
        std::fs::create_dir_all(&dst).unwrap();
        std::fs::write(src.join("existing.txt"), "new content").unwrap();
        std::fs::write(dst.join("existing.txt"), "user's customized content").unwrap();

        copy_add_only(&src, &dst);

        assert_eq!(std::fs::read_to_string(dst.join("existing.txt")).unwrap(), "user's customized content");
    }

    #[test]
    fn update_meta_deserializes_old_json_missing_fail_count_with_a_default_of_zero() {
        let meta: UpdateMeta = serde_json::from_str(r#"{"version":"1.2.3"}"#).unwrap();
        assert_eq!(meta.version, "1.2.3");
        assert_eq!(meta.fail_count, 0);
    }
}

fn copy_add_only(src: &Path, dst: &Path) {
    let Ok(entries) = std::fs::read_dir(src) else { return };
    let _ = std::fs::create_dir_all(dst);
    for entry in entries.flatten() {
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_add_only(&path, &target);
        } else if !target.exists() {
            let _ = std::fs::copy(&path, &target);
        }
    }
}

/// Called from `.setup()` on every launch - logs the one-time "Updated to
/// vX.Y.Z" confirmation if `apply_pending_update_if_present` just ran, and
/// reports whether the check task should be skipped this launch (skipping
/// avoids immediately re-downloading the release that was just applied,
/// since this process still has the pre-update version compiled in until
/// its own next restart).
pub fn consume_just_updated_marker(app: &AppHandle) -> bool {
    let Ok(state_dir) = update_state_dir() else { return false };
    let marker_path = state_dir.join("just-updated.json");
    let Ok(text) = std::fs::read_to_string(&marker_path) else { return false };
    let _ = std::fs::remove_file(&marker_path);
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) {
        if let Some(version) = value.get("version").and_then(|v| v.as_str()) {
            log_line_to_disk_and_ui(app, "success", None, &format!("Updated to v{version}."));
        }
    }
    true
}
