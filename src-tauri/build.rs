use std::{env, fs, path::PathBuf};

fn main() {
    // tauri-build compiles icons/icon.ico into the exe's Win32 icon resource but
    // never emits a rerun-if-changed for it, so replacing the icon alone leaves
    // the cached resource.lib (and the old Explorer/shortcut icon) in place.
    println!("cargo:rerun-if-changed=icons/icon.ico");

    tauri_build::build();

    // Auto-update (commands/updates.rs) needs a single version source of truth
    // that's shared between the running app's self-comparison and the value
    // used to tag/publish a release - tauri.conf.json's `version` field, not
    // Cargo.toml's (which is easy to forget bumping and would otherwise cause
    // a same-version-forever update loop or a silent downgrade). Expose it as
    // a compile-time env var so both the pre-Builder apply step (no AppHandle
    // yet) and the post-setup check task can read the same constant.
    let manifest_dir_for_conf = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let conf_path = manifest_dir_for_conf.join("tauri.conf.json");
    println!("cargo:rerun-if-changed={}", conf_path.display());
    let conf_text = fs::read_to_string(&conf_path).expect("could not read tauri.conf.json");
    let conf: serde_json::Value = serde_json::from_str(&conf_text).expect("tauri.conf.json is not valid JSON");
    let app_version = conf["version"].as_str().expect("tauri.conf.json is missing a string `version` field");
    println!("cargo:rustc-env=STEWRD_APP_VERSION={app_version}");

    // `bundle.resources` in tauri.conf.json only copies files during
    // `tauri build`. For `cargo run`/`tauri dev`, mirror the same
    // src/assets/category-icons/ -> <exe-dir>/assets/category-icons/ layout
    // by hand so category icons resolve identically in dev and release
    // (see commands/category_icons.rs, which reads relative to the running
    // exe either way).
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let profile = env::var("PROFILE").unwrap_or_else(|_| "debug".to_string());
    let src = manifest_dir.join("..").join("src").join("assets").join("category-icons");
    let dest = manifest_dir.join("target").join(&profile).join("assets").join("category-icons");

    println!("cargo:rerun-if-changed={}", src.display());

    if let Ok(entries) = fs::read_dir(&src) {
        let _ = fs::create_dir_all(&dest);
        for entry in entries.flatten() {
            let path = entry.path();
            let is_icon = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("png"))
                .unwrap_or(false);
            if path.is_file() && is_icon {
                if let Some(name) = path.file_name() {
                    let _ = fs::copy(&path, dest.join(name));
                }
            }
        }
    }
}
