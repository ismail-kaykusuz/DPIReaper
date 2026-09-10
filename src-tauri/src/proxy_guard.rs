//! Boot-time stale proxy cleanup — runs headless via `--proxy-guard` and logon scheduled task.

#[cfg(windows)]
mod imp {
    use std::net::TcpStream;
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::Duration;
    use winreg::enums::*;
    use winreg::RegKey;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const INTERNET_SETTINGS: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";
    pub const PROXY_GUARD_TASK: &str = "DPIReaperProxyGuard";
    pub const PROXY_PORT_MIN: u16 = 8080;
    pub const PROXY_PORT_MAX: u16 = 8090;

    fn sentinel_path() -> PathBuf {
        std::env::temp_dir().join("dpireaper_proxy_active.lock")
    }

    pub fn is_dpireaper_proxy_port(port: u16) -> bool {
        (PROXY_PORT_MIN..=PROXY_PORT_MAX).contains(&port)
    }

    fn parse_localhost_proxy_port(server: &str) -> Option<u16> {
        let trimmed = server.trim();
        let host_port = trimmed.split(';').next()?.trim();
        let (_, port_str) = host_port.rsplit_once(':')?;
        if !host_port.starts_with("127.0.0.1:") && !host_port.starts_with("localhost:") {
            return None;
        }
        port_str.parse().ok()
    }

    fn read_hkcu_proxy() -> Option<(u32, String)> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu.open_subkey(INTERNET_SETTINGS).ok()?;
        let enable: u32 = key.get_value("ProxyEnable").ok()?;
        let server: String = key.get_value("ProxyServer").unwrap_or_default();
        Some((enable, server))
    }

    pub fn is_stale_local_proxy() -> bool {
        let Some((enable, server)) = read_hkcu_proxy() else {
            return false;
        };
        if enable == 0 || server.is_empty() {
            return false;
        }
        parse_localhost_proxy_port(&server)
            .map(is_dpireaper_proxy_port)
            .unwrap_or(false)
    }

    pub fn sidecar_process_running() -> bool {
        Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq dpireaper-proxy.exe", "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map(|out| {
                let text = String::from_utf8_lossy(&out.stdout);
                text.to_ascii_lowercase().contains("dpireaper-proxy.exe")
            })
            .unwrap_or(false)
    }

    fn local_proxy_port_alive() -> bool {
        let Some((enable, server)) = read_hkcu_proxy() else {
            return false;
        };
        if enable == 0 {
            return false;
        }
        let Some(port) = parse_localhost_proxy_port(&server) else {
            return false;
        };
        TcpStream::connect_timeout(
            &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
            Duration::from_millis(400),
        )
        .is_ok()
    }

    fn clear_stale_proxy_registry() {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok((key, _)) = hkcu.create_subkey(INTERNET_SETTINGS) {
            let _ = key.set_value("ProxyEnable", &0u32);
            let _ = key.delete_value("ProxyServer");
            let _ = key.delete_value("ProxyOverride");
            let _ = key.delete_value("AutoConfigURL");
        }

        let _ = Command::new("netsh")
            .args(["winhttp", "reset", "proxy"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        let _ = std::fs::remove_file(sentinel_path());
    }

    /// Headless cleanup entry — no Tauri UI.
    pub fn run_proxy_guard_mode() -> i32 {
        if sidecar_process_running() || local_proxy_port_alive() {
            return 0;
        }
        if is_stale_local_proxy() {
            eprintln!("[PROXY-GUARD] Stale 127.0.0.1 proxy detected — clearing");
            clear_stale_proxy_registry();
        }
        0
    }

    fn xml_escape(s: &str) -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    }

    fn write_utf16_xml(path: &Path, content: &str) -> Result<(), String> {
        use std::fs::File;
        use std::io::Write;

        let mut file = File::create(path).map_err(|e| e.to_string())?;
        file.write_all(&[0xFF, 0xFE]).map_err(|e| e.to_string())?;
        for unit in content.encode_utf16() {
            file.write_all(&unit.to_le_bytes())
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    fn normalize_path(p: &str) -> String {
        p.replace('/', "\\").to_ascii_lowercase()
    }

    fn proxy_guard_task_valid(exe: &Path) -> bool {
        let output = Command::new("schtasks")
            .args(["/Query", "/TN", PROXY_GUARD_TASK, "/XML"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let Ok(out) = output else {
            return false;
        };
        if !out.status.success() {
            return false;
        }
        let xml = String::from_utf8_lossy(&out.stdout).to_ascii_lowercase();
        xml.contains("highestavailable")
            && xml.contains("--proxy-guard")
            && xml.contains(&normalize_path(&exe.display().to_string()))
    }

    fn create_proxy_guard_task(exe: &Path) -> Result<(), String> {
        let exe_str = xml_escape(&exe.display().to_string());
        let work_dir = exe
            .parent()
            .map(|p| xml_escape(&p.display().to_string()))
            .unwrap_or_else(|| exe_str.clone());

        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>DPIReaper stale proxy guard at user logon</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT2M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{exe_str}</Command>
      <Arguments>--proxy-guard</Arguments>
      <WorkingDirectory>{work_dir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>"#
        );

        let xml_path = std::env::temp_dir().join("dpireaper_proxy_guard_task.xml");
        write_utf16_xml(&xml_path, &xml)?;

        let output = Command::new("schtasks")
            .args([
                "/Create",
                "/TN",
                PROXY_GUARD_TASK,
                "/XML",
                &xml_path.to_string_lossy(),
                "/F",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("schtasks create: {}", e))?;

        let _ = std::fs::remove_file(&xml_path);

        if output.status.success() {
            return Ok(());
        }
        Err(format!(
            "Proxy guard gorevi olusturulamadi: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }

    pub fn ensure_proxy_guard_task() -> Result<(), String> {
        if !super::is_process_elevated() {
            return Ok(());
        }
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        if proxy_guard_task_valid(&exe) {
            return Ok(());
        }
        create_proxy_guard_task(&exe)
    }
}

#[cfg(windows)]
pub use imp::*;

#[cfg(not(windows))]
pub fn run_proxy_guard_mode() -> i32 {
    0
}

#[cfg(not(windows))]
pub fn ensure_proxy_guard_task() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
pub fn is_process_elevated() -> bool {
    use std::mem;
    use std::ptr;
    use winapi::um::handleapi::CloseHandle;
    use winapi::um::processthreadsapi::{GetCurrentProcess, OpenProcessToken};
    use winapi::um::securitybaseapi::GetTokenInformation;
    use winapi::um::winnt::{TokenElevation, HANDLE, TOKEN_ELEVATION, TOKEN_QUERY};

    unsafe {
        let mut token: HANDLE = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }

        let mut elevation: TOKEN_ELEVATION = mem::zeroed();
        let mut size: u32 = 0;
        let result = GetTokenInformation(
            token,
            TokenElevation,
            &mut elevation as *mut _ as *mut _,
            mem::size_of::<TOKEN_ELEVATION>() as u32,
            &mut size,
        );

        CloseHandle(token);
        result != 0 && elevation.TokenIsElevated != 0
    }
}

#[cfg(not(windows))]
pub fn is_process_elevated() -> bool {
    true
}
