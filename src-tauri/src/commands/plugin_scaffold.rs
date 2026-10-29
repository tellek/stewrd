// Backs Settings > Plugins > Create New Plugin: the wizard makes a GitHub repo
// and clones it into the plugins folder with `gh`/`git` (run from the
// frontend through run_command_timeout), and these commands handle the parts
// that must touch the filesystem safely - which folder, what state it is in,
// and writing the Hello World template into it.
//
// The template (templates/hello/) is embedded in the binary with include_str!
// rather than shipped as a resource: Stewrd is portable and its in-app updater
// only applies the exe, assets/ and a few named files, so a resource dir would
// never reach users who update in place.
use std::path::Path;
use tauri::AppHandle;

use super::path_util::sanitize_dir_name;
use super::plugins::resolve_plugins_dir;

const MAX_NAME_LEN: usize = 60;

/// How a token's replacement text must be escaped for the file it lands in.
#[derive(Clone, Copy)]
enum Kind {
    /// Inside a JSON/JS double-quoted string: escape `"`, `\` and control chars.
    Quoted,
    /// Markdown / YAML / .gitignore: raw text.
    Plain,
}

const TEMPLATE_FILES: &[(&str, &str, Kind)] = &[
    ("plugin.json", include_str!("../../../templates/hello/plugin.json"), Kind::Quoted),
    ("settings.json", include_str!("../../../templates/hello/settings.json"), Kind::Quoted),
    ("index.tsx", include_str!("../../../templates/hello/index.tsx"), Kind::Quoted),
    ("dist/index.js", include_str!("../../../templates/hello/dist/index.js"), Kind::Quoted),
    ("README.md", include_str!("../../../templates/hello/README.md"), Kind::Plain),
    (".gitignore", include_str!("../../../templates/hello/.gitignore"), Kind::Plain),
    (".github/workflows/release.yml", include_str!("../../../templates/hello/.github/workflows/release.yml"), Kind::Plain),
];

fn validate_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("plugin name is empty".to_string());
    }
    if trimmed.chars().count() > MAX_NAME_LEN {
        return Err(format!("plugin name is longer than {MAX_NAME_LEN} characters"));
    }
    if trimmed.chars().any(|c| c == '"' || c == '\\' || c.is_control()) {
        return Err("plugin name can't contain quotes, backslashes or control characters".to_string());
    }
    Ok(())
}

fn escape_quoted(text: &str) -> String {
    let json = serde_json::to_string(text).unwrap_or_default();
    json[1..json.len() - 1].to_string()
}

fn render(content: &str, kind: Kind, id: &str, name: &str) -> String {
    let name = match kind {
        Kind::Quoted => escape_quoted(name),
        Kind::Plain => name.to_string(),
    };
    content.replace("__PLUGIN_ID__", id).replace("__PLUGIN_NAME__", &name)
}

fn write_template(plugin_dir: &Path, id: &str, name: &str) -> Result<(), String> {
    let manifest_path = plugin_dir.join("plugin.json");
    if let Ok(existing) = std::fs::read_to_string(&manifest_path) {
        let same_plugin = serde_json::from_str::<serde_json::Value>(&existing)
            .ok()
            .and_then(|v| v.get("id").and_then(|i| i.as_str()).map(|s| s == id))
            .unwrap_or(false);
        if !same_plugin {
            return Err(format!("{} already holds a different plugin, refusing to overwrite it", plugin_dir.display()));
        }
    }
    for (rel, content, kind) in TEMPLATE_FILES {
        let dest = plugin_dir.join(rel);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("could not create {}: {e}", parent.display()))?;
        }
        std::fs::write(&dest, render(content, *kind, id, name.trim()))
            .map_err(|e| format!("could not write {}: {e}", dest.display()))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_plugins_dir(app: AppHandle) -> Result<String, String> {
    Ok(resolve_plugins_dir(&app)?.to_string_lossy().to_string())
}

/// `missing`, `empty`, `git_repo` (has a .git) or `other` (anything else).
/// The wizard needs this because list_plugins silently skips folders without a
/// plugin.json, so a leftover clone is invisible to it.
fn dir_state(plugins_dir: &Path, dir: &str) -> Result<&'static str, String> {
    let Some(safe) = sanitize_dir_name(dir) else {
        return Err(format!("invalid plugin directory name '{dir}'"));
    };
    let target = plugins_dir.join(safe);
    if !target.exists() {
        return Ok("missing");
    }
    if target.join(".git").exists() {
        return Ok("git_repo");
    }
    let is_empty = std::fs::read_dir(&target).map(|mut rd| rd.next().is_none()).unwrap_or(false);
    Ok(if is_empty { "empty" } else { "other" })
}

#[tauri::command]
pub fn plugin_dir_state(app: AppHandle, dir: String) -> Result<String, String> {
    let plugins_dir = resolve_plugins_dir(&app)?;
    dir_state(&plugins_dir, &dir).map(|s| s.to_string())
}

/// Writes the Hello World template into an already-cloned `plugins/<dir>`.
/// `dir` must equal `id`: the host keys a plugin's storage and data by the
/// manifest id, so the folder name has to match it.
#[tauri::command]
pub fn scaffold_plugin(app: AppHandle, dir: String, id: String, name: String) -> Result<(), String> {
    let (Some(safe_dir), Some(safe_id)) = (sanitize_dir_name(&dir), sanitize_dir_name(&id)) else {
        return Err(format!("invalid plugin directory name '{dir}'"));
    };
    if safe_dir != safe_id {
        return Err("plugin folder name must match the plugin id".to_string());
    }
    validate_name(&name)?;
    let plugins_dir = resolve_plugins_dir(&app)?;
    let target = plugins_dir.join(&safe_dir);
    if target.parent() != Some(plugins_dir.as_path()) {
        return Err(format!("invalid plugin directory name '{dir}'"));
    }
    if !target.is_dir() {
        return Err(format!("plugin folder '{safe_dir}' does not exist"));
    }
    write_template(&target, &safe_id, &name)
}

/// Removes a leftover `<plugin>/.git/index.lock`. A git process killed by the
/// wizard's timeout can't clean up after itself, and the stale lock would make
/// every retry fail with "index.lock exists".
fn remove_index_lock(plugins_dir: &Path, dir: &str) -> Result<(), String> {
    let Some(safe) = sanitize_dir_name(dir) else {
        return Err(format!("invalid plugin directory name '{dir}'"));
    };
    let lock = plugins_dir.join(safe).join(".git").join("index.lock");
    match std::fs::remove_file(&lock) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("could not remove {}: {e}", lock.display())),
    }
}

#[tauri::command]
pub fn clear_git_index_lock(app: AppHandle, dir: String) -> Result<(), String> {
    remove_index_lock(&resolve_plugins_dir(&app)?, &dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remove_index_lock_deletes_a_stale_lock_and_tolerates_none() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(tmp.path().join("p/.git")).unwrap();
        std::fs::write(tmp.path().join("p/.git/index.lock"), "").unwrap();
        remove_index_lock(tmp.path(), "p").unwrap();
        assert!(!tmp.path().join("p/.git/index.lock").exists());
        remove_index_lock(tmp.path(), "p").unwrap();
        assert!(remove_index_lock(tmp.path(), "..").is_err());
    }

    #[test]
    fn writes_every_template_file_with_tokens_replaced() {
        let tmp = tempfile::tempdir().unwrap();
        write_template(tmp.path(), "my-plugin", "My Plugin").unwrap();
        let manifest: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(tmp.path().join("plugin.json")).unwrap()).unwrap();
        assert_eq!(manifest["id"], "my-plugin");
        assert_eq!(manifest["name"], "My Plugin");
        for (rel, _, _) in TEMPLATE_FILES {
            let text = std::fs::read_to_string(tmp.path().join(rel)).unwrap();
            assert!(!text.contains("__PLUGIN_"), "{rel} still has an unreplaced token");
        }
        assert!(std::fs::read_to_string(tmp.path().join("dist/index.js")).unwrap().contains("My Plugin"));
    }

    #[test]
    fn escapes_the_name_in_json_and_js_but_validate_name_rejects_quotes_anyway() {
        assert_eq!(escape_quoted("a\"b\\c"), "a\\\"b\\\\c");
        assert!(validate_name("Bad \"Name\"").is_err());
        assert!(validate_name("Bad\\Name").is_err());
        assert!(validate_name("   ").is_err());
        assert!(validate_name(&"x".repeat(MAX_NAME_LEN + 1)).is_err());
        assert!(validate_name("Good Name 2").is_ok());
    }

    #[test]
    fn tokens_only_appear_inside_plain_quoted_strings_in_source_files() {
        // A name containing { } < > or backticks would break JSX text or a
        // template literal, so source tokens must only sit in "..." literals.
        let index = include_str!("../../../templates/hello/index.tsx");
        for line in index.lines().filter(|l| l.contains("__PLUGIN_NAME__")) {
            assert!(line.contains("\"__PLUGIN_NAME__\""), "token outside a plain string literal: {line}");
        }
        let dist = include_str!("../../../templates/hello/dist/index.js");
        for line in dist.lines().filter(|l| l.contains("__PLUGIN_NAME__")) {
            assert!(line.contains("\"__PLUGIN_NAME__\""), "token outside a plain string literal: {line}");
        }
    }

    #[test]
    fn refuses_to_overwrite_a_different_plugin() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("plugin.json"), r#"{"id":"someone-elses","name":"X"}"#).unwrap();
        assert!(write_template(tmp.path(), "my-plugin", "My Plugin").is_err());
        assert_eq!(std::fs::read_to_string(tmp.path().join("plugin.json")).unwrap(), r#"{"id":"someone-elses","name":"X"}"#);
    }

    #[test]
    fn rerunning_for_the_same_plugin_is_allowed() {
        let tmp = tempfile::tempdir().unwrap();
        write_template(tmp.path(), "my-plugin", "My Plugin").unwrap();
        write_template(tmp.path(), "my-plugin", "My Plugin").unwrap();
    }

    #[test]
    fn dir_state_reports_missing_empty_git_repo_and_other() {
        let tmp = tempfile::tempdir().unwrap();
        assert_eq!(dir_state(tmp.path(), "nope").unwrap(), "missing");
        std::fs::create_dir(tmp.path().join("empty")).unwrap();
        assert_eq!(dir_state(tmp.path(), "empty").unwrap(), "empty");
        std::fs::create_dir_all(tmp.path().join("cloned/.git")).unwrap();
        assert_eq!(dir_state(tmp.path(), "cloned").unwrap(), "git_repo");
        std::fs::create_dir(tmp.path().join("busy")).unwrap();
        std::fs::write(tmp.path().join("busy/file.txt"), "x").unwrap();
        assert_eq!(dir_state(tmp.path(), "busy").unwrap(), "other");
    }

    #[test]
    fn dir_state_rejects_unsafe_and_reserved_names() {
        let tmp = tempfile::tempdir().unwrap();
        assert!(dir_state(tmp.path(), "..").is_err());
        assert!(dir_state(tmp.path(), "a/b").is_err());
        assert!(dir_state(tmp.path(), "con").is_err());
    }
}
