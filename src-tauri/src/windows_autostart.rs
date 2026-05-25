//! Windows autostart: Run registry + StartupApproved (0x03) + logon scheduled task.

#[cfg(windows)]
mod imp {
    use std::fs;
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
    const VALUE_NAME: &str = "DPIReaper";
    const TASK_NAME: &str = "DPIReaperAutostart";
    const STARTUP_ENABLED: [u8; 12] = [0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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

    fn create_scheduled_task(exe: &Path) -> Result<(), String> {
        let tr = run_command_for_exe(exe);
        let output = Command::new("schtasks")
            .args([
                "/Create",
                "/TN",
                TASK_NAME,
                "/TR",
                &tr,
                "/SC",
                "ONLOGON",
                "/RL",
                "LIMITED",
                "/DELAY",
                "0000:30",
                "/F",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("schtasks create: {}", e))?;

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
        if let Some(pref) = read_pref() {
            return Ok(pref);
        }
        Ok(run_registry_active()? || task_exists())
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        write_pref(enabled)?;

        if enabled {
            let exe = exe_path()?;
            write_run_registry(&exe)?;
            write_startup_approved()?;
            if let Err(e) = create_scheduled_task(&exe) {
                // Run + StartupApproved yeterli olabilir; task hatasini logla ama basarisiz sayma
                eprintln!("[AUTOSTART] Task Scheduler uyarisi: {}", e);
            }
        } else {
            delete_run_registry();
            delete_scheduled_task();
        }
        Ok(())
    }

    pub fn heal_on_startup() {
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
