//! Faz 5 — Offline lisanslama (Ed25519 imzalı).
//!
//! Token formatı: `dpir-<base64url(payload)>.<base64url(signature)>`
//! Payload JSON: `{ id, name, issuedAt, expiresAt }`
//! Doğrulama: Ed25519 imza + son geçerlilik tarihi.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Utc};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Üretim zamanında gömülen Ed25519 public key (base64 — `license_pubkey.txt`).
const PUBLIC_KEY_B64: &str = include_str!("license_pubkey.txt");

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicensePayload {
    pub id: String,
    pub name: String,
    #[serde(rename = "issuedAt")]
    pub issued_at: DateTime<Utc>,
    #[serde(rename = "expiresAt")]
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct LicenseStatus {
    pub valid: bool,
    pub reason: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<DateTime<Utc>>,
    #[serde(rename = "secondsLeft")]
    pub seconds_left: Option<i64>,
}

fn err(reason: &str) -> LicenseStatus {
    LicenseStatus {
        valid: false,
        reason: Some(reason.to_string()),
        name: None,
        expires_at: None,
        seconds_left: None,
    }
}

/// Saat geri alma koruması için son geçerli açılış zamanını tutan dosya.
/// `%APPDATA%\DPIReaper\last_seen.lic` (Windows) — basit metin: UTC ISO8601.
/// Kullanıcı silebilir (sıfırlama), ama tipik kullanıcı bilmez.
fn last_seen_path() -> Option<PathBuf> {
    let base = std::env::var_os("APPDATA").or_else(|| std::env::var_os("HOME"))?;
    let dir: PathBuf = PathBuf::from(base).join("DPIReaper");
    let _ = fs::create_dir_all(&dir);
    Some(dir.join("last_seen.lic"))
}

fn read_last_seen() -> Option<DateTime<Utc>> {
    let p = last_seen_path()?;
    let txt = fs::read_to_string(p).ok()?;
    DateTime::parse_from_rfc3339(txt.trim()).ok().map(|d| d.with_timezone(&Utc))
}

fn write_last_seen(now: DateTime<Utc>) {
    if let Some(p) = last_seen_path() {
        let _ = fs::write(p, now.to_rfc3339());
    }
}

fn b64url_decode(s: &str) -> Result<Vec<u8>, String> {
    URL_SAFE_NO_PAD.decode(s.as_bytes()).map_err(|e| format!("base64: {}", e))
}

fn load_pubkey() -> Result<VerifyingKey, String> {
    let pk_bytes = base64::engine::general_purpose::STANDARD
        .decode(PUBLIC_KEY_B64.trim())
        .map_err(|e| format!("pubkey decode: {}", e))?;
    if pk_bytes.len() != 32 {
        return Err(format!("pubkey length {} (32 beklendi)", pk_bytes.len()));
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&pk_bytes);
    VerifyingKey::from_bytes(&arr).map_err(|e| format!("pubkey parse: {}", e))
}

/// Token'ı imza ve süre olarak doğrular.
pub fn verify(token: &str) -> LicenseStatus {
    let token = token.trim();
    let Some(rest) = token.strip_prefix("dpir-") else {
        return err("Geçersiz format (dpir- öneki yok)");
    };
    let Some((payload_b64, sig_b64)) = rest.split_once('.') else {
        return err("Geçersiz format (nokta ayırıcı yok)");
    };

    let payload_bytes = match b64url_decode(payload_b64) {
        Ok(b) => b,
        Err(e) => return err(&format!("Payload bozuk: {}", e)),
    };
    let sig_bytes = match b64url_decode(sig_b64) {
        Ok(b) => b,
        Err(e) => return err(&format!("İmza bozuk: {}", e)),
    };

    let pubkey = match load_pubkey() {
        Ok(p) => p,
        Err(e) => return err(&format!("Public key okunamadı: {}", e)),
    };

    if sig_bytes.len() != 64 {
        return err("İmza uzunluğu hatalı");
    }
    let mut sig_arr = [0u8; 64];
    sig_arr.copy_from_slice(&sig_bytes);
    let signature = Signature::from_bytes(&sig_arr);

    if pubkey.verify(&payload_bytes, &signature).is_err() {
        return err("İmza geçersiz (anahtar üzerinde oynanmış veya farklı keychain)");
    }

    let payload: LicensePayload = match serde_json::from_slice(&payload_bytes) {
        Ok(p) => p,
        Err(e) => return err(&format!("Payload JSON: {}", e)),
    };

    let now = Utc::now();

    // Saat geri alma koruması: son geçerli açılış zamanından daha eski bir
    // sistem saati varsa kullanıcı saati geriye almıştır → kabul etme.
    // 60 saniyelik tolerans NTP düzeltmeleri için.
    if let Some(last) = read_last_seen() {
        if now + chrono::Duration::seconds(60) < last {
            return err("Sistem saatinde anomali tespit edildi (saat geriye alınmış)");
        }
    }

    if payload.expires_at < now {
        return LicenseStatus {
            valid: false,
            reason: Some("Lisans süresi dolmuş".to_string()),
            name: Some(payload.name),
            expires_at: Some(payload.expires_at),
            seconds_left: Some((payload.expires_at - now).num_seconds()),
        };
    }

    // Geçerli — son görülme zamanını güncelle (saat geri alma koruması için).
    write_last_seen(now);

    LicenseStatus {
        valid: true,
        reason: None,
        name: Some(payload.name),
        expires_at: Some(payload.expires_at),
        seconds_left: Some((payload.expires_at - now).num_seconds()),
    }
}

#[tauri::command]
pub fn verify_license(token: String) -> LicenseStatus {
    verify(&token)
}
