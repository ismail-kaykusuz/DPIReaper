//! Windows autostart: Task Scheduler (primary) + Run registry (Settings UI) + StartupApproved.

#[cfg(windows)]
mod imp {
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
    // Windows StartupApproved: byte0 LSB=0 enabled (0x02), LSB=1 disabled (0x03 + timestamp).
    const STARTUP_ENABLED: [u8; 12] = [0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
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

    fn run_command_for_exe(exe: &Path) -> String {
        format!("\"{}\" --autostart", exe.display())
    }

    fn run_value_points_to_us(val: &str, exe: &Path) -> bool {
        let val_norm = normalize_path(val);
        let exe_norm = normalize_path(&exe.to_string_lossy());
        val_norm.contains(&exe_norm) && val_norm.contains("--autostart")
    }

    fn run_registry_active() -> Result<bool, String> {
        let exe = exe_path()?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey(RUN_KEY)
            .map_err(|e| format!("Run key: {}", e))?;
        let val: String = match key.get_value(VALUE_NAME) {
            Ok(v) => v,
            Err(_) => return Ok(false),
        };
        Ok(run_value_points_to_us(&val, &exe))
    }

    fn write_run_registry(exe: &Path) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (run, _) = hkcu
            .create_subkey(RUN_KEY)
            .map_err(|e| format!("Run create: {}", e))?;
        run.set_value(VALUE_NAME, &run_command_for_exe(exe))
            .map_err(|e| format!("Run write: {}", e))?;
        Ok(())
    }

    fn startup_approved_is_enabled() -> Result<bool, String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = match hkcu.open_subkey(STARTUP_APPROVED_KEY) {
            Ok(k) => k,
            Err(_) => return Ok(true),
        };
        let raw = match key.get_raw_value(VALUE_NAME) {
            Ok(v) => v,
            Err(_) => return Ok(true),
        };
        if raw.bytes.is_empty() {
            return Ok(true);
        }
        Ok((raw.bytes[0] & 1) == 0)
    }

    fn write_startup_approved() -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (approved, _) = hkcu
            .create_subkey(STARTUP_APPROVED_KEY)
            .map_err(|e| format!("StartupApproved create: {}", e))?;
        approved
            .set_raw_value(
                VALUE_NAME,
                &winreg::RegValue {
                    bytes: STARTUP_ENABLED.to_vec(),
                    vtype: REG_BINARY,
                },
            )
            .map_err(|e| format!("StartupApproved write: {}", e))?;
        Ok(())
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

    /// "Run as administrator" uyumluluk bayragi startup'ta UAC istemeden calismayi engeller (0x800702E4).
    fn clear_run_as_admin_shims(_exe: &Path) {
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
                "[AUTOSTART] RUNASADMIN uyumluluk bayragi kaldirildi (startup engeli): {:?}",
                removed
            );
        }
    }

    fn task_exists() -> bool {
        Command::new("schtasks")
            .args(["/Query", "/TN", TASK_NAME])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
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
        delete_scheduled_task();

        let exe_str = xml_escape(&exe.display().to_string());
        let work_dir = exe
            .parent()
            .map(|p| xml_escape(&p.display().to_string()))
            .unwrap_or_else(|| xml_escape(&exe.display().to_string()));

        let xml = format!(
            r#"<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>DPIReaper autostart at user logon</Description>
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
      <RunLevel>LeastPrivilege</RunLevel>
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
            .args(["/Create", "/TN", TASK_NAME, "/XML", &xml_path.to_string_lossy(), "/F"])
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

    fn delete_scheduled_task() {
        let _ = Command::new("schtasks")
            .args(["/Delete", "/TN", TASK_NAME, "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
    }

    pub fn is_enabled() -> Result<bool, String> {
        let run_ok = run_registry_active()?;
        if !run_ok {
            return Ok(false);
        }
        startup_approved_is_enabled()
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        write_pref(enabled)?;

        if enabled {
            let exe = exe_path()?;
            clear_run_as_admin_shims(&exe);
            write_startup_approved()?;
            write_run_registry(&exe)?;
            write_startup_approved()?;
            if let Err(e) = create_scheduled_task(&exe) {
                eprintln!("[AUTOSTART] Task Scheduler uyarisi: {}", e);
            }
        } else {
            delete_run_registry();
            delete_scheduled_task();
        }
        Ok(())
    }

    pub fn heal_on_startup() {
        let exe = match exe_path() {
            Ok(p) => p,
            Err(_) => return,
        };
        clear_run_as_admin_shims(&exe);

        let want = match read_pref() {
            Some(v) => v,
            None => run_registry_active().unwrap_or(false) || task_exists(),
        };
        if want {
            let _ = set_enabled(true);
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
