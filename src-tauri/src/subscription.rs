//! Subscription sync against the Phase 5 API + offline grace using a local cache file.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tauri::Manager;

const CACHE_FILE: &str = "subscription_cache.json";
pub const DEFAULT_API_BASE: &str = "http://127.0.0.1:8787";
const DEFAULT_GRACE_DAYS: u32 = 7;
const HTTP_TIMEOUT_SECS: u64 = 10;

fn schema_v1() -> u32 {
    1
}

fn default_grace_days() -> u32 {
    DEFAULT_GRACE_DAYS
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubscriptionPayload {
    #[serde(default = "schema_v1")]
    schema_version: u32,
    status: String,
    #[serde(default)]
    tier: Option<String>,
    #[serde(default)]
    valid_until_unix_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubscriptionCache {
    #[serde(default = "schema_v1")]
    schema_version: u32,
    #[serde(default)]
    api_base_url: Option<String>,
    #[serde(default = "default_grace_days")]
    grace_days: u32,
    /// Last time the server returned HTTP success for subscription sync.
    #[serde(default)]
    last_sync_ok_unix_ms: u64,
    #[serde(default)]
    last_subscription: Option<SubscriptionPayload>,
    #[serde(default)]
    last_sync_error: Option<String>,
    /// Whether the most recent sync attempt completed with HTTP 2xx and valid JSON.
    #[serde(default)]
    last_sync_succeeded: bool,
}

impl Default for SubscriptionCache {
    fn default() -> Self {
        Self {
            schema_version: 1,
            api_base_url: None,
            grace_days: DEFAULT_GRACE_DAYS,
            last_sync_ok_unix_ms: 0,
            last_subscription: None,
            last_sync_error: None,
            last_sync_succeeded: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionState {
    pub schema_version: u32,
    pub api_base_url: String,
    pub grace_days: u32,
    pub subscription_status: String,
    pub tier: Option<String>,
    pub valid_until_unix_ms: Option<u64>,
    pub last_sync_ok_unix_ms: u64,
    pub last_sync_error: Option<String>,
    /// The last sync attempt returned HTTP 2xx with a parseable body (may be stale until you sync again).
    pub last_sync_succeeded: bool,
    /// Using cached paid state because the network failed but grace window has not expired.
    pub offline_grace_active: bool,
    /// Active or trialing from API, or still inside grace after a prior active sync.
    pub entitled: bool,
}

fn cache_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|d| d.join(CACHE_FILE))
        .map_err(|e| e.to_string())
}

fn load_cache(app: &AppHandle) -> Result<SubscriptionCache, String> {
    let path = cache_path(app)?;
    if !path.exists() {
        return Ok(SubscriptionCache::default());
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_cache(app: &AppHandle, c: &SubscriptionCache) -> Result<(), String> {
    let path = cache_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(c).map_err(|e| e.to_string())?;
    fs::write(&path, raw).map_err(|e| e.to_string())
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn api_base(cache: &SubscriptionCache) -> String {
    cache
        .api_base_url
        .clone()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_API_BASE.to_string())
}

fn normalize_base(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}

fn was_paid_status(status: &str) -> bool {
    status == "active" || status == "trialing"
}

fn compute_state(cache: &SubscriptionCache, last_sync_succeeded: bool) -> SubscriptionState {
    let sub = cache.last_subscription.clone();
    let (subscription_status, tier, valid_until) = match &sub {
        Some(s) => (s.status.clone(), s.tier.clone(), s.valid_until_unix_ms),
        None => ("unknown".into(), None, None),
    };

    let grace_ms = (cache.grace_days as u64).saturating_mul(86_400_000);
    let grace_deadline = cache.last_sync_ok_unix_ms.saturating_add(grace_ms);
    let now = now_unix_ms();

    let paid_from_cache = sub
        .as_ref()
        .map(|s| was_paid_status(&s.status))
        .unwrap_or(false);

    let offline_grace_active = !last_sync_succeeded
        && paid_from_cache
        && cache.last_sync_ok_unix_ms > 0
        && now <= grace_deadline;

    let entitled = if last_sync_succeeded {
        sub.as_ref()
            .map(|s| was_paid_status(&s.status))
            .unwrap_or(false)
    } else {
        offline_grace_active
    };

    SubscriptionState {
        schema_version: 1,
        api_base_url: api_base(cache),
        grace_days: cache.grace_days,
        subscription_status,
        tier,
        valid_until_unix_ms: valid_until,
        last_sync_ok_unix_ms: cache.last_sync_ok_unix_ms,
        last_sync_error: cache.last_sync_error.clone(),
        last_sync_succeeded,
        offline_grace_active,
        entitled,
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetApiBasePayload {
    pub url: String,
}

#[tauri::command]
pub fn get_subscription_state(app: AppHandle) -> Result<SubscriptionState, String> {
    let cache = load_cache(&app)?;
    Ok(compute_state(&cache, cache.last_sync_succeeded))
}

#[tauri::command]
pub fn set_subscription_api_base(
    app: AppHandle,
    payload: SetApiBasePayload,
) -> Result<SubscriptionState, String> {
    let u = payload.url.trim();
    if u.is_empty() {
        return Err("URL is empty".into());
    }
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err("URL must start with http:// or https://".into());
    }
    let mut cache = load_cache(&app)?;
    cache.api_base_url = Some(u.to_string());
    save_cache(&app, &cache)?;
    get_subscription_state(app)
}

#[tauri::command]
pub fn sync_subscription_now(app: AppHandle) -> Result<SubscriptionState, String> {
    let mut cache = load_cache(&app)?;
    let base = normalize_base(&api_base(&cache));
    let url = format!("{base}/api/v1/subscription");

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;

    let result = client.get(&url).send();

    match result {
        Ok(resp) => {
            if resp.status().is_success() {
                match resp.json::<SubscriptionPayload>() {
                    Ok(body) => {
                        cache.last_subscription = Some(body);
                        cache.last_sync_ok_unix_ms = now_unix_ms();
                        cache.last_sync_error = None;
                        cache.last_sync_succeeded = true;
                    }
                    Err(e) => {
                        cache.last_sync_succeeded = false;
                        cache.last_sync_error = Some(format!("Invalid JSON: {e}"));
                    }
                }
                save_cache(&app, &cache)?;
                Ok(compute_state(&cache, cache.last_sync_succeeded))
            } else {
                let status = resp.status();
                let err = format!("HTTP {status}");
                cache.last_sync_error = Some(err);
                cache.last_sync_succeeded = false;
                save_cache(&app, &cache)?;
                Ok(compute_state(&cache, false))
            }
        }
        Err(e) => {
            cache.last_sync_error = Some(e.to_string());
            cache.last_sync_succeeded = false;
            save_cache(&app, &cache)?;
            Ok(compute_state(&cache, false))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grace_extends_entitlement_offline() {
        let now = now_unix_ms();
        let cache = SubscriptionCache {
            last_sync_ok_unix_ms: now.saturating_sub(86_400_000),
            last_subscription: Some(SubscriptionPayload {
                schema_version: 1,
                status: "active".into(),
                tier: Some("pro".into()),
                valid_until_unix_ms: None,
            }),
            grace_days: 7,
            ..Default::default()
        };
        let s = compute_state(&cache, false);
        assert!(s.offline_grace_active);
        assert!(s.entitled);
    }

    #[test]
    fn no_grace_when_never_synced() {
        let cache = SubscriptionCache::default();
        let s = compute_state(&cache, false);
        assert!(!s.offline_grace_active);
        assert!(!s.entitled);
    }

    #[test]
    fn entitled_when_last_sync_succeeded_and_active() {
        let cache = SubscriptionCache {
            last_sync_ok_unix_ms: 1,
            last_subscription: Some(SubscriptionPayload {
                schema_version: 1,
                status: "active".into(),
                tier: None,
                valid_until_unix_ms: None,
            }),
            last_sync_succeeded: true,
            ..Default::default()
        };
        let s = compute_state(&cache, true);
        assert!(s.entitled);
        assert!(!s.offline_grace_active);
    }
}
