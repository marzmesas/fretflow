//! Local session persistence for either the preview dev login or the current server-backed auth flow.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Manager;

const SESSION_FILE: &str = "session.json";
const HTTP_TIMEOUT_SECS: u64 = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredSession {
    #[serde(default = "schema_v1")]
    schema_version: u32,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    account_id: Option<String>,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    display_name: Option<String>,
    #[serde(default)]
    signed_in_at_unix_ms: Option<u64>,
    #[serde(default)]
    entitlements: Vec<String>,
    #[serde(default)]
    session_token: Option<String>,
}

fn schema_v1() -> u32 {
    1
}

impl Default for StoredSession {
    fn default() -> Self {
        Self {
            schema_version: 1,
            kind: None,
            account_id: None,
            email: None,
            display_name: None,
            signed_in_at_unix_ms: None,
            entitlements: Vec::new(),
            session_token: None,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteSignInPayload {
    pub api_base_url: String,
    pub email: String,
    #[serde(default)]
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RemoteAuthSessionResponse {
    #[serde(default = "schema_v1")]
    schema_version: u32,
    auth_kind: String,
    account_id: String,
    email: String,
    #[serde(default)]
    display_name: Option<String>,
    signed_in_at_unix_ms: u64,
    #[serde(default)]
    entitlements: Vec<String>,
    session_token: String,
}

/// Session state exposed to the UI (versioned).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSession {
    pub schema_version: u32,
    pub signed_in: bool,
    /// `Some("dev")` for local preview; `Some("email")` for the current server-backed auth flow.
    pub auth_kind: Option<String>,
    pub account_id: Option<String>,
    pub email: Option<String>,
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

fn normalize_api_base(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}

fn dev_entitlements() -> Vec<String> {
    vec![
        "local:library".into(),
        "local:practice".into(),
        "local:settings".into(),
    ]
}

fn to_app_session(s: &StoredSession) -> AppSession {
    let signed_in = s
        .kind
        .as_ref()
        .map(|kind| !kind.trim().is_empty())
        .unwrap_or(false);
    let entitlements = if !signed_in {
        Vec::new()
    } else if s.kind.as_deref() == Some("dev") && s.entitlements.is_empty() {
        dev_entitlements()
    } else {
        s.entitlements.clone()
    };
    AppSession {
        schema_version: 1,
        signed_in,
        auth_kind: if signed_in { s.kind.clone() } else { None },
        account_id: if signed_in {
            s.account_id.clone()
        } else {
            None
        },
        email: if signed_in { s.email.clone() } else { None },
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
        entitlements,
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
        account_id: None,
        email: None,
        display_name: name,
        signed_in_at_unix_ms: Some(now_unix_ms()),
        entitlements: dev_entitlements(),
        session_token: None,
    };
    save_stored(&app, &stored)?;
    get_session(app)
}

#[tauri::command]
pub fn remote_sign_in(app: AppHandle, payload: RemoteSignInPayload) -> Result<AppSession, String> {
    let api_base = normalize_api_base(payload.api_base_url.trim());
    if api_base.is_empty() {
        return Err("Service URL is empty".into());
    }
    if !(api_base.starts_with("http://") || api_base.starts_with("https://")) {
        return Err("Service URL must start with http:// or https://".into());
    }
    let email = payload.email.trim().to_lowercase();
    if email.is_empty() {
        return Err("Email is empty".into());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{api_base}/api/v1/auth/sign-in");
    let response = client
        .post(url)
        .json(&serde_json::json!({
            "schemaVersion": 1,
            "email": email,
            "displayName": payload.display_name,
        }))
        .send()
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("Auth sign-in failed: HTTP {}", response.status()));
    }

    let remote = response
        .json::<RemoteAuthSessionResponse>()
        .map_err(|e| format!("Invalid auth response: {e}"))?;
    if remote.auth_kind.trim().is_empty() || remote.auth_kind == "dev" {
        return Err("Auth response did not return a non-dev auth provider".into());
    }

    let stored = StoredSession {
        schema_version: remote.schema_version,
        kind: Some(remote.auth_kind),
        account_id: Some(remote.account_id),
        email: Some(remote.email),
        display_name: remote.display_name,
        signed_in_at_unix_ms: Some(remote.signed_in_at_unix_ms),
        entitlements: remote.entitlements,
        session_token: Some(remote.session_token),
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
            account_id: None,
            email: None,
            display_name: Some("Test".into()),
            signed_in_at_unix_ms: Some(42),
            entitlements: dev_entitlements(),
            session_token: None,
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
            account_id: None,
            email: None,
            display_name: None,
            signed_in_at_unix_ms: Some(1),
            entitlements: dev_entitlements(),
            session_token: None,
        };
        let a = to_app_session(&s);
        assert!(a.signed_in);
        assert_eq!(a.auth_kind, Some("dev".into()));
        assert_eq!(a.entitlements.len(), 3);
    }

    #[test]
    fn app_session_remote_auth_preserves_account_identity() {
        let s = StoredSession {
            schema_version: 1,
            kind: Some("email".into()),
            account_id: Some("acct_123".into()),
            email: Some("player@example.com".into()),
            display_name: Some("Player".into()),
            signed_in_at_unix_ms: Some(10),
            entitlements: vec!["remote:auth".into()],
            session_token: Some("sess_123".into()),
        };
        let a = to_app_session(&s);
        assert!(a.signed_in);
        assert_eq!(a.auth_kind, Some("email".into()));
        assert_eq!(a.account_id, Some("acct_123".into()));
        assert_eq!(a.email, Some("player@example.com".into()));
        assert_eq!(a.entitlements, vec!["remote:auth".to_string()]);
    }
}
