mod commands;
mod model;
mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::document::save_grokedoc,
      commands::document::load_grokedoc,
      commands::document::export_document_markdown,
      commands::versioning::create_version,
      commands::versioning::list_versions,
      commands::versioning::get_version,
      commands::versioning::diff_versions,
      commands::versioning::restore_version,
      commands::versioning::delete_version
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
