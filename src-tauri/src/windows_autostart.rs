//! Windows HKCU Run + StartupApproved autostart (Tauri plugin yerine — StartupApproved 0x02 bug fix).

#[cfg(windows)]
mod imp {
    use winreg::enums::*;
    use winreg::RegKey;

    const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const STARTUP_APPROVED_KEY: &str =
        r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const VALUE_NAME: &str = "DPIReaper";
    /// Windows Task Manager "Enabled" — ilk byte 0x03
    const STARTUP_ENABLED: [u8; 12] = [0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    fn run_command_for_exe(exe: &std::path::Path) -> String {
        format!("\"{}\" --autostart", exe.display())
    }

    fn normalize_path(p: &str) -> String {
        p.replace('/', "\\").to_ascii_lowercase()
    }

    pub fn is_enabled() -> Result<bool, String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_norm = normalize_path(&exe.to_string_lossy());
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu
            .open_subkey(RUN_KEY)
            .map_err(|e| format!("Run key: {}", e))?;
        let val: String = match key.get_value(VALUE_NAME) {
            Ok(v) => v,
            Err(_) => return Ok(false),
        };
        Ok(normalize_path(&val).contains(&exe_norm))
    }

    pub fn set_enabled(enabled: bool) -> Result<(), String> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        if enabled {
            let cmd = run_command_for_exe(&exe);
            let (run, _) = hkcu
                .create_subkey(RUN_KEY)
                .map_err(|e| format!("Run create: {}", e))?;
            run.set_value(VALUE_NAME, &cmd)
                .map_err(|e| format!("Run write: {}", e))?;

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
        } else {
            if let Ok(key) = hkcu.open_subkey(RUN_KEY) {
                let _ = key.delete_value(VALUE_NAME);
            }
            if let Ok(key) = hkcu.open_subkey(STARTUP_APPROVED_KEY) {
                let _ = key.delete_value(VALUE_NAME);
            }
        }
        Ok(())
    }

    /// Boot sonrası registry kaydını tazele (Run + StartupApproved).
    pub fn heal_if_enabled() {
        if let Ok(true) = is_enabled() {
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
        Err("Autostart is only supported on Windows.".to_string())
    }
    pub fn heal_if_enabled() {}
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
