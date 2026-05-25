; ═══════════════════════════════════════════════════════════
; DPIReaper NSIS Installer Hooks
; ═══════════════════════════════════════════════════════════

LangString dpireaperAutostartLabel ${LANG_ENGLISH} "Start DPIReaper when Windows starts"

; Kurulum bitiş sayfası — "Açılışta başlat" checkbox
Function InstallFinishShow
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    Return
  ${EndIf}

  FindWindow $1 "#32770" "" $HWNDPARENT
  System::Call "user32::GetDpiForWindow(p r1) i .r2"
  ${If} $(^RTL) = 1
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE} | ${WS_EX_LAYOUTRTL}"
    IntOp $4 50 * $2
  ${Else}
    StrCpy $3 "${__NSD_CheckBox_EXSTYLE}"
    IntOp $4 0 * $2
  ${EndIf}
  IntOp $5 130 * $2
  IntOp $6 400 * $2
  IntOp $7 25 * $2
  IntOp $4 $4 / 96
  IntOp $5 $5 / 96
  IntOp $6 $6 / 96
  IntOp $7 $7 / 96
  System::Call 'user32::CreateWindowEx(i r3, w "${__NSD_CheckBox_CLASS}", w "$(dpireaperAutostartLabel)", i ${__NSD_CheckBox_STYLE}, i r4, i r5, i r6, i r7, p r1, i0, i0, i0) i .s'
  Pop $AutostartCheckbox
  SendMessage $HWNDPARENT ${WM_GETFONT} 0 0 $1
  SendMessage $AutostartCheckbox ${WM_SETFONT} $1 1
  ; Varsayılan: işaretli
  SendMessage $AutostartCheckbox ${BM_SETCHECK} ${BST_CHECKED} 0
FunctionEnd

Function InstallFinishLeave
  ${If} $PassiveMode = 1
  ${OrIf} ${Silent}
    Return
  ${EndIf}

  SendMessage $AutostartCheckbox ${BM_GETCHECK} 0 0 $AutostartCheckboxState
  ${If} $AutostartCheckboxState = ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DPIReaper" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" --autostart"
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "DPIReaper"
  ${EndIf}
FunctionEnd

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
