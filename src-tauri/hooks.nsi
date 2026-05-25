; ═══════════════════════════════════════════════════════════
; DPIReaper NSIS Installer Hooks
; ═══════════════════════════════════════════════════════════

LangString dpireaperAutostartLabel ${LANG_ENGLISH} "Start DPIReaper when Windows starts"

; ─── KURULUM ÖNCESİ ───
!macro NSIS_HOOK_PREINSTALL
    nsExec::ExecToStack 'taskkill /F /IM DPIReaper.exe'
    Pop $0
    nsExec::ExecToStack 'taskkill /F /IM dpireaper-proxy.exe'
    Pop $0
    Sleep 500

    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Internet Settings" "ProxyEnable" 0
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Internet Settings" "ProxyServer"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Internet Settings" "ProxyOverride"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Internet Settings" "AutoConfigURL"

    nsExec::ExecToStack 'netsh winhttp reset proxy'
    Pop $0

    Delete "$TEMP\dpireaper_proxy_active.lock"
    Delete "$TEMP\dpireaper_sidecar.pid"
!macroend

; ─── KALDIRMA ÖNCESİ ───
!macro NSIS_HOOK_PREUNINSTALL
    nsExec::ExecToStack 'taskkill /F /IM DPIReaper.exe'
    Pop $0
    Sleep 1000

    WriteRegDWORD HKCU "Software\Microsoft\Windows\CurrentVersion\Internet Settings" "ProxyEnable" 0
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Internet Settings" "ProxyServer"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Internet Settings" "ProxyOverride"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Internet Settings" "AutoConfigURL"

    nsExec::ExecToStack 'netsh winhttp reset proxy'
    Pop $0

    Delete "$TEMP\dpireaper_proxy_active.lock"
    Delete "$TEMP\dpireaper_sidecar.pid"

    nsExec::ExecToStack 'taskkill /F /IM dpireaper-proxy.exe'
    Pop $0

    nsExec::ExecToStack 'netsh advfirewall firewall delete rule name=DPIReaper_Proxy'
    Pop $0
    nsExec::ExecToStack 'netsh advfirewall firewall delete rule name=DPIReaper_PAC'
    Pop $0

    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DPIReaper"

    nsExec::ExecToStack 'ipconfig /flushdns'
    Pop $0
!macroend
