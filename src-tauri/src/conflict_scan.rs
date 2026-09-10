//! Detect leftover SplitWire / GoodbyeDPI / zapret artifacts and run deep repair.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct ConflictFinding {
    pub id: String,
    pub severity: String,
    pub title: String,
    pub detail: String,
}

#[derive(Serialize, Clone)]
pub struct ConflictScanResult {
    pub findings: Vec<ConflictFinding>,
    pub has_critical: bool,
}

#[derive(Serialize, Clone)]
pub struct DeepRepairResult {
    pub action_keys: Vec<String>,
    pub partial: bool,
}

#[cfg(windows)]
mod imp {
    use super::{ConflictFinding, ConflictScanResult, DeepRepairResult};
    use std::collections::HashSet;
    use std::net::TcpListener;
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use winreg::enums::*;
    use winreg::RegKey;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const INTERNET_SETTINGS: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    const KNOWN_PROCESSES: &[(&str, &str, &str, &str)] = &[
        ("goodbyedpi.exe", "GoodbyeDPI", "proc_goodbyedpi", "stopped_goodbyedpi"),
        ("winws.exe", "zapret / winws", "proc_winws", "stopped_winws"),
        ("zapret.exe", "zapret", "proc_zapret", "stopped_zapret"),
        ("byedpi.exe", "byeDPI", "proc_byedpi", "stopped_byedpi"),
        ("ciadpi.exe", "ciadpi", "proc_ciadpi", "stopped_ciadpi"),
        ("splitwire.exe", "SplitWire", "proc_splitwire", "stopped_splitwire"),
        (
            "green-tunnel.exe",
            "green-tunnel",
            "proc_green_tunnel",
            "stopped_green_tunnel",
        ),
    ];

    const KNOWN_SERVICES: &[(&str, &str, &str, &str)] = &[
        (
            "GoodbyeDPI",
            "GoodbyeDPI service",
            "svc_goodbyedpi",
            "svc_stopped_goodbyedpi",
        ),
        (
            "WinDivert",
            "WinDivert driver service",
            "svc_windivert",
            "svc_stopped_windivert",
        ),
        ("zapret", "zapret service", "svc_zapret", "svc_stopped_zapret"),
    ];

    fn run_hidden(args: &[&str]) -> Option<String> {
        let output = Command::new(args[0])
            .args(&args[1..])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()?;
        if output.status.success() {
            Some(String::from_utf8_lossy(&output.stdout).into_owned())
        } else {
            None
        }
    }

    fn tasklist_has_exe(text: &str, exe: &str) -> bool {
        let exe_lower = exe.to_ascii_lowercase();
        for line in text.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            let first = line
                .split(',')
                .next()
                .unwrap_or("")
                .trim()
                .trim_matches('"')
                .to_ascii_lowercase();
            if first == exe_lower {
                return true;
            }
        }
        false
    }

    fn push_finding(
        findings: &mut Vec<ConflictFinding>,
        id: impl Into<String>,
        severity: impl Into<String>,
        title: impl Into<String>,
        detail: impl Into<String>,
    ) {
        findings.push(ConflictFinding {
            id: id.into(),
            severity: severity.into(),
            title: title.into(),
            detail: detail.into(),
        });
    }

    fn scan_processes(findings: &mut Vec<ConflictFinding>) {
        let text = match run_hidden(&["tasklist", "/FO", "CSV", "/NH"]) {
            Some(t) => t,
            None => return,
        };
        for (exe, label, finding_id, _) in KNOWN_PROCESSES {
            if tasklist_has_exe(&text, exe) {
                push_finding(
                    findings,
                    *finding_id,
                    "critical",
                    &format!("{} is running", label),
                    &format!(
                        "The {} process is still active and may conflict with DPIReaper.",
                        label
                    ),
                );
            }
        }
    }

    fn scan_services(findings: &mut Vec<ConflictFinding>) {
        let mut seen = HashSet::new();
        for (name, label, finding_id, _) in KNOWN_SERVICES {
            if !seen.insert(finding_id) {
                continue;
            }
            let query = format!("sc query {}", name);
            if let Some(out) = run_hidden(&["cmd", "/C", &query]) {
                if out.contains("RUNNING") || out.contains("ÇALIŞIYOR") {
                    push_finding(
                        findings,
                        *finding_id,
                        "critical",
                        &format!("{} active", label),
                        "Kernel-level filtering may conflict with the DPIReaper proxy.",
                    );
                }
            }
        }
    }

    fn scan_ports(findings: &mut Vec<ConflictFinding>) {
        if crate::proxy_guard::sidecar_process_running() {
            return;
        }
        for port in 8080..=8090u16 {
            if TcpListener::bind(("127.0.0.1", port)).is_err() {
                push_finding(
                    findings,
                    &format!("port_{}", port),
                    "warning",
                    &format!("Port {} in use", port),
                    "Another local proxy or legacy DPI tool may be using this port.",
                );
                break;
            }
        }
    }

    fn read_proxy_key(root: winreg::HKEY, label: &str, findings: &mut Vec<ConflictFinding>) {
        let key = RegKey::predef(root);
        let Ok(sub) = key.open_subkey(INTERNET_SETTINGS) else {
            return;
        };
        let enable: u32 = sub.get_value("ProxyEnable").unwrap_or(0);
        let server: String = sub.get_value("ProxyServer").unwrap_or_default();
        let pac: String = sub.get_value("AutoConfigURL").unwrap_or_default();
        if enable != 0 && !server.is_empty() && !server.starts_with("127.0.0.1:") {
            push_finding(
                findings,
                &format!("proxy_{}", label),
                "warning",
                &format!("{} proxy enabled", label.to_uppercase()),
                format!("ProxyServer = {}", server),
            );
        }
        if !pac.is_empty() {
            push_finding(
                findings,
                &format!("pac_{}", label),
                "warning",
                &format!("{} PAC (AutoConfigURL) set", label.to_uppercase()),
                format!("AutoConfigURL = {}", pac),
            );
        }
    }

    fn scan_registry_proxy(findings: &mut Vec<ConflictFinding>) {
        read_proxy_key(HKEY_CURRENT_USER, "hkcu", findings);
        read_proxy_key(HKEY_LOCAL_MACHINE, "hklm", findings);
    }

    fn scan_nic_dns(findings: &mut Vec<ConflictFinding>) {
        if let Some(out) = run_hidden(&["ipconfig", "/all"]) {
            let lower = out.to_ascii_lowercase();
            if lower.contains("127.0.0.1") && lower.contains("dns servers") {
                push_finding(
                    findings,
                    "nic_dns_loopback",
                    "critical",
                    "Adapter DNS may be 127.0.0.1",
                    "A legacy DPI tool may have pointed system DNS to localhost. Deep repair recommended.",
                );
            }
        }
    }

    fn scan_nrpt(findings: &mut Vec<ConflictFinding>) {
        let script = r#"
$rules = Get-DnsClientNrptRule -ErrorAction SilentlyContinue
if ($rules) { $rules | ForEach-Object { $_.Name } }
"#;
        if let Some(out) = run_hidden(&[
            "powershell",
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
            "-Command",
            script,
        ]) {
            let trimmed = out.trim();
            if !trimmed.is_empty() {
                push_finding(
                    findings,
                    "nrpt_rules",
                    "warning",
                    "NRPT DNS rules found",
                    "Name Resolution Policy rules may affect DNS resolution.",
                );
            }
        }
    }

    fn scan_windivert_driver(findings: &mut Vec<ConflictFinding>) {
        if let Some(out) = run_hidden(&["driverquery", "/FO", "CSV", "/NH"]) {
            let lower = out.to_ascii_lowercase();
            if lower.contains("windivert") {
                push_finding(
                    findings,
                    "windivert_driver",
                    "critical",
                    "WinDivert driver installed",
                    "Driver from GoodbyeDPI/zapret-like tools is still loaded. Uninstall the old tool and restart your PC.",
                );
            }
        }
    }

    pub fn scan_dpi_conflicts() -> ConflictScanResult {
        let mut findings = Vec::new();
        scan_processes(&mut findings);
        scan_services(&mut findings);
        scan_ports(&mut findings);
        scan_registry_proxy(&mut findings);
        scan_nic_dns(&mut findings);
        scan_nrpt(&mut findings);
        scan_windivert_driver(&mut findings);

        let has_critical = findings.iter().any(|f| f.severity == "critical");
        ConflictScanResult {
            findings,
            has_critical,
        }
    }

    fn stop_competing_processes_and_services(actions: &mut Vec<String>) {
        for (exe, _label, _finding_id, stop_key) in KNOWN_PROCESSES {
            let out = Command::new("taskkill")
                .args(["/F", "/IM", exe])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            if let Ok(o) = out {
                if o.status.success() {
                    actions.push(stop_key.to_string());
                }
            }
        }

        let mut seen = HashSet::new();
        for (name, _label, _finding_id, stop_key) in KNOWN_SERVICES {
            if !seen.insert(stop_key) {
                continue;
            }
            let query = format!("sc query {}", name);
            let running = run_hidden(&["cmd", "/C", &query])
                .map(|out| out.contains("RUNNING") || out.contains("ÇALIŞIYOR"))
                .unwrap_or(false);
            if !running {
                continue;
            }
            let stop_cmd = format!("sc stop {}", name);
            if run_hidden(&["cmd", "/C", &stop_cmd]).is_some() {
                actions.push(stop_key.to_string());
            }
        }
    }

    pub fn stop_dpi_conflicts() -> Result<DeepRepairResult, String> {
        let mut action_keys = Vec::new();
        stop_competing_processes_and_services(&mut action_keys);
        Ok(DeepRepairResult {
            action_keys,
            partial: false,
        })
    }

    pub fn deep_repair_network() -> Result<DeepRepairResult, String> {
        let elevated = crate::proxy_guard::is_process_elevated();
        let mut action_keys: Vec<String> = Vec::new();

        crate::repair_internet_extended_internal()?;
        action_keys.push("proxy_winhttp_reset".into());

        stop_competing_processes_and_services(&mut action_keys);

        let partial = !elevated;
        if elevated {
            let dns_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
Get-DnsClientServerAddress -AddressFamily IPv4 | ForEach-Object {
  Set-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -ResetServerAddresses
}
"#;
            let _ = Command::new("powershell")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", dns_script])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
            action_keys.push("dns_dhcp_reset".into());

            let nrpt_script = r#"
$ErrorActionPreference = 'SilentlyContinue'
Get-DnsClientNrptRule | Remove-DnsClientNrptRule -Force
"#;
            let _ = Command::new("powershell")
                .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", nrpt_script])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
            action_keys.push("nrpt_cleared".into());
        }

        Ok(DeepRepairResult {
            action_keys,
            partial,
        })
    }
}

#[cfg(windows)]
pub use imp::*;

#[cfg(not(windows))]
pub fn scan_dpi_conflicts() -> ConflictScanResult {
    ConflictScanResult {
        findings: vec![],
        has_critical: false,
    }
}

#[cfg(not(windows))]
pub fn stop_dpi_conflicts() -> Result<DeepRepairResult, String> {
    Err("Windows only.".to_string())
}

#[cfg(not(windows))]
pub fn deep_repair_network() -> Result<DeepRepairResult, String> {
    Err("Windows only.".to_string())
}

