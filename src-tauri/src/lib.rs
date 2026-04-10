mod audio_io;
mod commands;
mod input_event;
mod ipc;
mod meter_mock;
mod midi;
mod session;

use commands::{
    get_app_info, get_input_connection_status, start_mock_audio_meter, stop_mock_audio_meter,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_app_info,
            get_input_connection_status,
            start_mock_audio_meter,
            stop_mock_audio_meter,
            audio_io::list_audio_input_devices,
            audio_io::get_default_audio_input_device,
            audio_io::get_audio_preferences,
            audio_io::set_audio_preferences,
            audio_io::start_input_monitor,
            audio_io::stop_input_monitor,
            audio_io::get_input_device_stream_info,
            midi::list_midi_input_ports,
            midi::start_midi_input_listen,
            midi::stop_midi_input_listen,
            session::get_session,
            session::dev_sign_in,
            session::sign_out,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
