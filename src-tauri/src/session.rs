//! Local session stub (Phase 5): dev sign-in persisted under the app config dir until real auth exists.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Manager;

const SESSION_FILE: &str = "session.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    #[serde(default = "schema_v1")]
    schema_version: u32,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    signed_in_at_unix_ms: Option<u64>,
}

fn schema_v1() -> u32 {
    1
}

impl Default for StoredSession {
    fn default() -> Self {
        Self {
            schema_version: 1,
            kind: None,
            display_name: None,
            signed_in_at_unix_ms: None,
        }
    }
}

/// Payload for [`dev_sign_in`]; mirrors frontend camelCase.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DevSignInPayload {
    #[serde(default)]
    pub display_name: Option<String>,
}

/// Session state exposed to the UI (versioned).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSession {
    pub schema_version: u32,
    pub signed_in: bool,
    /// `Some("dev")` for local stub; future: oauth provider ids.
    pub auth_kind: Option<String>,
    pub display_name: Option<String>,
    pub signed_in_at_unix_ms: Option<u64>,
    /// Placeholder entitlements until backend; dev login grants all local surfaces.
    pub entitlements: Vec<String>,
}

fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join(SESSION_FILE))
        .map_err(|e| e.to_string())
}

fn load_stored(app: &AppHandle) -> Result<StoredSession, String> {
    let path = session_path(app)?;
    if !path.exists() {
        return Ok(StoredSession::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_stored(app: &AppHandle, s: &StoredSession) -> Result<(), String> {
    let path = session_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| e.to_string())
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn dev_entitlements() -> Vec<String> {
    vec![
        "local:library".into(),
        "local:practice".into(),
        "local:settings".into(),
    ]
}

fn to_app_session(s: &StoredSession) -> AppSession {
    let signed_in = s.kind.as_deref() == Some("dev");
    AppSession {
        schema_version: 1,
        signed_in,
        auth_kind: if signed_in { s.kind.clone() } else { None },
        display_name: if signed_in {
            s.display_name.clone()
        } else {
            None
        },
        signed_in_at_unix_ms: if signed_in {
            s.signed_in_at_unix_ms
        } else {
            None
        },
        entitlements: if signed_in {
            dev_entitlements()
        } else {
            Vec::new()
        },
    }
}

#[tauri::command]
pub fn get_session(app: AppHandle) -> Result<AppSession, String> {
    let s = load_stored(&app)?;
    Ok(to_app_session(&s))
}

#[tauri::command]
pub fn dev_sign_in(app: AppHandle, payload: DevSignInPayload) -> Result<AppSession, String> {
    let name = payload
        .display_name
        .map(|n| n.trim().to_string())
        .filter(|n| !n.is_empty());
    let stored = StoredSession {
        schema_version: 1,
        kind: Some("dev".into()),
        display_name: name,
        signed_in_at_unix_ms: Some(now_unix_ms()),
    };
    save_stored(&app, &stored)?;
    get_session(app)
}

#[tauri::command]
pub fn sign_out(app: AppHandle) -> Result<AppSession, String> {
    let path = session_path(&app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    get_session(app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stored_session_json_roundtrip() {
        let s = StoredSession {
            schema_version: 1,
            kind: Some("dev".into()),
            display_name: Some("Test".into()),
            signed_in_at_unix_ms: Some(42),
        };
        let v = serde_json::to_value(&s).unwrap();
        let back: StoredSession = serde_json::from_value(v).unwrap();
        assert_eq!(back.kind, Some("dev".into()));
        assert_eq!(back.display_name, Some("Test".into()));
    }

    #[test]
    fn app_session_signed_out() {
        let s = StoredSession::default();
        let a = to_app_session(&s);
        assert!(!a.signed_in);
        assert!(a.entitlements.is_empty());
    }

    #[test]
    fn app_session_dev_has_entitlements() {
        let s = StoredSession {
            schema_version: 1,
            kind: Some("dev".into()),
            display_name: None,
            signed_in_at_unix_ms: Some(1),
        };
        let a = to_app_session(&s);
        assert!(a.signed_in);
        assert_eq!(a.auth_kind, Some("dev".into()));
        assert_eq!(a.entitlements.len(), 3);
    }
}
