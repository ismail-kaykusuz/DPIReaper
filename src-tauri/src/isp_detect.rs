use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct IspDetectionResult {
    pub detected: bool,
    pub isp_id: String,
    pub isp_label: String,
    pub suggested_tier: String,
    pub confidence: f32,
    pub source: String,
}

struct IspRule {
    id: &'static str,
    label: &'static str,
    tier: &'static str,
    patterns: &'static [&'static str],
}

const ISP_RULES: &[IspRule] = &[
    IspRule {
        id: "turknet",
        label: "TurkNet",
        tier: "fast",
        patterns: &["turknet", "tn.net", "turk net"],
    },
    IspRule {
        id: "superonline",
        label: "Superonline",
        tier: "max",
        patterns: &["superonline", "tellcom", "solnet"],
    },
    IspRule {
        id: "turktelekom",
        label: "Türk Telekom",
        tier: "max",
        patterns: &[
            "turk telekom",
            "turktelekom",
            "ttnet",
            "tt net",
            ".ttnet",
            "türk telekom",
        ],
    },
    IspRule {
        id: "vodafone",
        label: "Vodafone",
        tier: "max",
        patterns: &["vodafone", "vfnet"],
    },
    IspRule {
        id: "kablonet",
        label: "Kablonet",
        tier: "max",
        patterns: &["kablonet", "kablo net"],
    },
    IspRule {
        id: "millenicom",
        label: "Millenicom",
        tier: "max",
        patterns: &["millenicom", "milleni"],
    },
    IspRule {
        id: "netspeed",
        label: "Netspeed",
        tier: "recommended",
        patterns: &["netspeed", "net speed"],
    },
    IspRule {
        id: "turkcell",
        label: "Turkcell",
        tier: "recommended",
        patterns: &["turkcell", "superbox"],
    },
    IspRule {
        id: "dsmart",
        label: "D-Smart",
        tier: "recommended",
        patterns: &["d-smart", "dsmart"],
    },
];

fn default_result() -> IspDetectionResult {
    IspDetectionResult {
        detected: false,
        isp_id: "unknown".into(),
        isp_label: String::new(),
        suggested_tier: "recommended".into(),
        confidence: 0.0,
        source: "none".into(),
    }
}

fn match_from_text(text: &str) -> Option<IspDetectionResult> {
    let haystack = text.to_lowercase();
    for rule in ISP_RULES {
        for pat in rule.patterns {
            if haystack.contains(pat) {
                return Some(IspDetectionResult {
                    detected: true,
                    isp_id: rule.id.to_string(),
                    isp_label: rule.label.to_string(),
                    suggested_tier: rule.tier.to_string(),
                    confidence: 0.88,
                    source: "network_hint".into(),
                });
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn collect_windows_hints() -> String {
    use std::process::Command;

    let mut combined = String::new();

    if let Ok(out) = Command::new("ipconfig").arg("/all").output() {
        combined.push_str(&String::from_utf8_lossy(&out.stdout));
    }

    if let Ok(out) = Command::new("netsh").args(["interface", "show", "interface"]).output() {
        combined.push('\n');
        combined.push_str(&String::from_utf8_lossy(&out.stdout));
    }

    combined
}

#[cfg(not(target_os = "windows"))]
fn collect_windows_hints() -> String {
    String::new()
}

/// B3: blocking I/O'yu Tauri async runtime'ının blocking pool'una taşı.
/// `ipconfig` + `netsh` çağrıları 200-700ms sürebilir; ana thread'i kilitlememeli.
#[tauri::command]
pub async fn detect_isp() -> IspDetectionResult {
    tauri::async_runtime::spawn_blocking(|| {
        let hints = collect_windows_hints();
        if hints.is_empty() {
            return default_result();
        }
        match_from_text(&hints).unwrap_or_else(default_result)
    })
    .await
    .unwrap_or_else(|_| default_result())
}
