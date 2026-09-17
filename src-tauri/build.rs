use std::{env, fs, path::PathBuf};

fn main() {
    tauri_build::build();

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
