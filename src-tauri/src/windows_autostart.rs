//! Windows autostart: elevated Task Scheduler at logon (primary). Run registry is NOT used for
//! launch — it starts a non-elevated process that breaks DPI bypass (admin required).

#[cfg(windows)]
mod imp {
    use crate::proxy_guard::is_process_elevated;
    use std::fs::{self, File};
    use std::io::Write;
    use std::os::windows::process::CommandExt;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use winreg::enums::*;
    use winreg::RegKey;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const STARTUP_APPROVED_KEY: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const APP_COMPAT_LAYERS: &str =
        r"Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers";
    const VALUE_NAME: &str = "DPIReaper";
    const TASK_NAME: &str = "DPIReaperAutostart";
    pub const LAUNCH_TASK_NAME: &str = "DPIReaperLaunch";
    const LOGON_DELAY: &str = "PT45S";

    fn pref_path() -> Result<PathBuf, String> {
        let base = std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA bulunamadi")?;
        Ok(PathBuf::from(base).join("DPIReaper").join("autostart.pref"))
    }

    fn read_pref() -> Option<bool> {
        let path = pref_path().ok()?;
        let raw = fs::read_to_string(path).ok()?;
        match raw.trim() {
            "1" => Some(true),
            "0" => Some(false),
            _ => None,
        }
    }

    fn write_pref(enabled: bool) -> Result<(), String> {
        let path = pref_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut f = fs::File::create(path).map_err(|e| e.to_string())?;
        f.write_all(if enabled { b"1" } else { b"0" })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn normalize_path(p: &str) -> String {
        p.replace('/', "\\").to_ascii_lowercase()
    }

    fn exe_path() -> Result<PathBuf, String> {
        std::env::current_exe().map_err(|e| e.to_string())
    }

    fn delete_run_registry() {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        if let Ok(key) = hkcu.open_subkey(RUN_KEY) {
            let _ = key.delete_value(VALUE_NAME);
        }
        if let Ok(key) = hkcu.open_subkey(STARTUP_APPROVED_KEY) {
            let _ = key.delete_value(VALUE_NAME);
        }
    }

    /// RUNASADMIN shim: startup Run key ile birlikte kullanilinca sessiz basarisizlik (0x800702E4).
    fn clear_run_as_admin_shims() {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let Ok(key) = hkcu.open_subkey(APP_COMPAT_LAYERS) else {
            return;
        };

        let mut removed = Vec::new();
        for entry in key.enum_values().filter_map(|e| e.ok()) {
            let name = entry.0;
            if !normalize_path(&name).contains("dpireaper.exe") {
                continue;
            }
            let val: String = match key.get_value(&name) {
                Ok(v) => v,
                Err(_) => continue,
            };
            if val.to_uppercase().contains("RUNASADMIN") && key.delete_value(&name).is_ok() {
                removed.push(name);
            }
        }

        if !removed.is_empty() {
            eprintln!(
                "[AUTOSTART] RUNASADMIN uyumluluk bayragi kaldirildi: {:?}",
                removed
            );
        }
    }

    fn task_exists(task_name: &str) -> bool {
        Command::new("schtasks")
            .args(["/Query", "/TN", task_name])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    fn task_is_valid(task_name: &str, expected_exe: &Path, expected_args: &str) -> bool {
        let output = Command::new("schtasks")
            .args(["/Query", "/TN", task_name, "/XML"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        let Ok(out) = output else {
            return false;
        };
        if !out.status.success() {
            return false;
        }
        let xml = String::from_utf8_lossy(&out.stdout).to_ascii_lowercase();
        if !xml.contains("highestavailable") {
            return false;
        }
        let exe_norm = normalize_path(&expected_exe.display().to_string());
        if !xml.contains(&exe_norm) {
            return false;
        }
        if !expected_args.is_empty() && !xml.contains(&expected_args.to_ascii_lowercase()) {
            return false;
        }
        true
    }

    fn xml_escape(s: &str) -> String {
        s.replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    }

    fn write_utf16_xml(path: &Path, content: &str) -> Result<(), String> {
        let mut file = File::create(path).map_err(|e| e.to_string())?;
        file.write_all(&[0xFF, 0xFE]).map_err(|e| e.to_string())?;
        for unit in content.encode_utf16() {
            file.write_all(&unit.to_le_bytes())
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    fn create_scheduled_task(exe: &Path) -> Result<(), String> {
        let exe_str = xml_escape(&exe.display().to_string());
        let work_dir = exe
            .parent()
            .map(|p| xml_escape(&p.display().to_string()))
            .unwrap_or_else(|| exe_str.clone());

        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>DPIReaper autostart at user logon (elevated)</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Delay>{LOGON_DELAY}</Delay>
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
    <Hidden>false</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{exe_str}</Command>
      <Arguments>--autostart</Arguments>
      <WorkingDirectory>{work_dir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>"#
        );

        let xml_path = std::env::temp_dir().join("dpireaper_autostart_task.xml");
        write_utf16_xml(&xml_path, &xml)?;

        let output = Command::new("schtasks")
            .args([
                "/Create",
                "/TN",
                TASK_NAME,
                "/XML",
                &xml_path.to_string_lossy(),
                "/F",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("schtasks create: {}", e))?;

        let _ = fs::remove_file(&xml_path);

        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!(
            "Gorev Zamanlayici olusturulamadi: {}{}",
            stderr.trim(),
            if stdout.trim().is_empty() {
                String::new()
            } else {
                format!(" | {}", stdout.trim())
            }
        ))
    }

    fn delete_scheduled_task(task_name: &str) {
        let _ = Command::new("schtasks")
            .args(["/Delete", "/TN", task_name, "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }

    fn create_launch_task(exe: &Path) -> Result<(), String> {
        let exe_str = xml_escape(&exe.display().to_string());
        let work_dir = exe
            .parent()
            .map(|p| xml_escape(&p.display().to_string()))
            .unwrap_or_else(|| exe_str.clone());

        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>DPIReaper on-demand elevated launch (no UAC after first approval)</Description>
  </RegistrationInfo>
  <Triggers />
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
    <Enabled>true</Enabled>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>{exe_str}</Command>
      <WorkingDirectory>{work_dir}</WorkingDirectory>
    </Exec>
  </Actions>
</Task>"#
        );

        let xml_path = std::env::temp_dir().join("dpireaper_launch_task.xml");
        write_utf16_xml(&xml_path, &xml)?;

        let output = Command::new("schtasks")
            .args([
                "/Create",
                "/TN",
                LAUNCH_TASK_NAME,
                "/XML",
                &xml_path.to_string_lossy(),
                "/F",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("schtasks launch create: {}", e))?;

        let _ = fs::remove_file(&xml_path);

        if output.status.success() {
            return Ok(());
        }
        Err(format!(
            "Launch gorevi olusturulamadi: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    }

    pub fn ensure_launch_task() -> Result<(), String> {
        if !is_process_elevated() {
            return Ok(());
        }
        let exe = exe_path()?;
        if task_is_valid(LAUNCH_TASK_NAME, &exe, "") {
            return Ok(());
        }
        create_launch_task(&exe)
    }

    pub fn try_run_via_launch_task() -> bool {
        let Ok(exe) = exe_path() else {
            return false;
        };
        if !task_exists(LAUNCH_TASK_NAME) {
            return false;
        }
        // Stale dev-build or old install path — never launch the wrong binary.
        if !task_is_valid(LAUNCH_TASK_NAME, &exe, "") {
            return false;
        }
        Command::new("schtasks")
            .args(["/Run", "/TN", LAUNCH_TASK_NAME])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }

    pub fn is_enabled() -> Result<bool, String> {
        read_pref().map_or_else(
            || Ok(task_exists(TASK_NAME)),
            |pref| Ok(pref && task_exists(TASK_NAME)),
        )
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        write_pref(enabled)?;
        clear_run_as_admin_shims();

        if enabled {
            let exe = exe_path()?;
            delete_run_registry();

            if task_is_valid(TASK_NAME, &exe, "--autostart") {
                return Ok(());
            }

            if !is_process_elevated() {
                return Err(
                    "Açılışta başlat görevi oluşturmak için yönetici izni gerekli.".to_string(),
                );
            }

            create_scheduled_task(&exe)?;
        } else {
            delete_run_registry();
            delete_scheduled_task(TASK_NAME);
        }
        Ok(())
    }

    pub fn heal_on_startup() {
        clear_run_as_admin_shims();

        if is_process_elevated() {
            let _ = ensure_launch_task();
            let _ = crate::proxy_guard::ensure_proxy_guard_task();
        }

        let want = match read_pref() {
            Some(v) => v,
            None => task_exists(TASK_NAME),
        };

        if want {
            delete_run_registry();
            if let Ok(exe) = exe_path() {
                if !task_is_valid(TASK_NAME, &exe, "--autostart") && is_process_elevated() {
                    let _ = create_scheduled_task(&exe);
                }
            }
        } else {
            delete_run_registry();
        }
    }
}

#[cfg(windows)]
pub use imp::*;

#[cfg(not(windows))]
mod imp {
    pub fn is_enabled() -> Result<bool, String> {
        Ok(false)
    }
    pub fn set_enabled(_enabled: bool) -> Result<(), String> {
        Err("Autostart yalnizca Windows'ta desteklenir.".to_string())
    }
    pub fn heal_on_startup() {}
    pub fn ensure_launch_task() -> Result<(), String> {
        Ok(())
    }
    pub fn try_run_via_launch_task() -> bool {
        false
    }
}

#[cfg(not(windows))]
pub use imp::*;

#[tauri::command]
pub fn is_autostart_registry_enabled() -> Result<bool, String> {
    is_enabled()
}

#[tauri::command]
pub fn set_autostart_enabled(enabled: bool) -> Result<bool, String> {
    set_enabled(enabled)?;
    is_enabled()
}
