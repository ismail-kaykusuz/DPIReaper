<p align="center">
  <img src="images/DPIReaper.png" width="140" alt="DPIReaper Logo">
</p>

<h1 align="center">DPIReaper</h1>

<p align="center">
  <b>A modern Windows local-proxy &amp; DPI bypass utility built on Rust (Tauri 2) and React 19 — engineered for resilience, zero telemetry, and a clean Fluent-style UI.</b>
</p>

<p align="center">
  <a href="https://github.com/ismail-kaykusuz/DPIReaper/releases/latest">
    <img alt="Download" src="https://img.shields.io/badge/%E2%AC%87%20Download-DPIReaper-107C10?style=for-the-badge&logo=windows&logoColor=white">
  </a>
  <a href="https://github.com/ismail-kaykusuz/DPIReaper/releases">
    <img alt="Latest Release" src="https://img.shields.io/github/v/release/ismail-kaykusuz/DPIReaper?style=for-the-badge&label=Latest&logo=github&logoColor=white&color=0078D4">
  </a>
  <a href="LICENSE">
    <img alt="License" src="https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge">
  </a>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-blue.svg">
  <img alt="Architecture" src="https://img.shields.io/badge/Architecture-x64-green.svg">
  <img alt="Stack" src="https://img.shields.io/badge/Stack-Rust%20%2B%20React%2019-orange.svg">
  <img alt="Telemetry" src="https://img.shields.io/badge/Telemetry-None-success.svg">
  <a href="README-tr.md"><img alt="Türkçe README" src="https://img.shields.io/badge/lang-Türkçe-red.svg"></a>
</p>

---

## Demo

<p align="center">
  <video src="https://github.com/ismail-kaykusuz/DPIReaper/raw/main/images/DPIReaperSetup-app-introduction.mp4" controls width="640"></video>
</p>

> If the embedded player does not load, watch it here:
> [`images/DPIReaperSetup-app-introduction.mp4`](images/DPIReaperSetup-app-introduction.mp4)

---

## Table of Contents

- [What is DPIReaper?](#what-is-dpireaper)
- [Why DPIReaper?](#why-dpireaper)
- [Features](#features)
- [The 3-Tier Bypass Engine](#the-3-tier-bypass-engine)
- [LAN Sharing (PAC Server)](#lan-sharing-pac-server)
- [Architecture &amp; Security](#architecture--security)
- [System Requirements](#system-requirements)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Build From Source](#build-from-source)
- [Privacy &amp; Telemetry](#privacy--telemetry)
- [Legal Notice &amp; Disclaimer](#legal-notice--disclaimer)
- [Support the Project](#support-the-project)
- [Credits](#credits)
- [License](#license)

---

## What is DPIReaper?

DPIReaper is a **desktop application for Windows 10 / 11** that runs a small local HTTPS proxy on `127.0.0.1` and applies *TLS-level fragmentation techniques* on outgoing connections so that Deep Packet Inspection (DPI) systems on the path cannot match the ClientHello SNI against their block lists.

It is the spiritual successor to terminal-only utilities such as `GoodbyeDPI` and `green-tunnel`, but rebuilt **entirely in Rust (Tauri 2)** with:

- A self-healing system-proxy manager (the famous *“lost the internet after a crash”* problem is solved by a sentinel + backup system).
- A live PAC server on the LAN so phones, tablets and consoles can ride the same tunnel by scanning a QR code.
- 12-language localized Fluent UI, single-instance, system-tray integration.
- No telemetry, no remote server, no account.

DPIReaper bundles a Go-based DPI engine (`dpireaper-proxy`, derived from the SpoofDPI project) as a sidecar binary — there is no external service to connect to. **All traffic stays between you and your destination.**

---

## Why DPIReaper?

Most lightweight bypass tools have two recurring problems:

1. **They break your internet when they crash.** When the helper process exits abnormally (BSOD, power loss, task-kill), the Windows system-proxy registry keys remain pointed at a now-dead local port, and the user is left with no working connectivity.
2. **They are not safe to leave running in the background.** Console-based tools spawn elevated `cmd.exe` / `powershell.exe` for every operation, which trips Defender heuristics and leaves a noisy audit trail.

DPIReaper addresses both:

| Problem | DPIReaper solution |
|---|---|
| Stale proxy on crash | **Sentinel file + atomic registry backup** — on next launch, the app detects a *dirty* shutdown and rolls system-proxy settings back to the user's pre-DPIReaper state. |
| Console spawn overhead | All system calls use **native Rust `winapi` / `winreg`** crates. No PowerShell, no `cmd /c`. |
| Multi-instance lock-up | **Single-instance enforcement** via a global Mutex; double-click is a no-op when the app is already in the tray. |
| LAN device hassle | Built-in async PAC server (port 8787+) with **QR-code device pairing** and a localized setup page. |
| Defender false-positives | Optional, **user-consented** Defender exclusion (Network Inspection scope only). |

---

## Features

- **System-wide proxy management** — `Software\Microsoft\Windows\CurrentVersion\Internet Settings` is set automatically; Chrome, Edge, Discord, Spotify, Steam, Roblox and most other Win32/UWP apps inherit it without configuration.
- **3-tier DPI engine** — *Fast* (SNI split), *Recommended* (chunk split), *Maximum* (chunk + disorder). Switchable live without reconnecting.
- **DNS over HTTPS (DoH)** — Cloudflare, Google, AdGuard, Quad9, OpenDNS, plus a *system DNS* fallback.
- **IPv4-only mode** — eliminates a class of leak vectors on dual-stack networks.
- **LAN sharing** — turns your PC into a DPI-free gateway for phones/tablets via PAC URL or QR.
- **Per-app bypass list** — domains in a user-editable list go *direct* (e.g., for games where you do not want to add latency).
- **Connection health indicator** — live ping pulse on the home screen.
- **Live log monitor** — ring buffer (100 lines), copy / clear / filter by INFO·WARN·ERROR.
- **Auto-start with Windows** (optional).
- **Start hidden in tray** (optional).
- **12 languages** — Turkish, English, German, French, Spanish, Italian, Portuguese, Russian, Arabic, Chinese, Japanese, Korean.
- **Modern Fluent UI** — fixed 380×700 window, dark theme, Inter typeface, framer-motion micro-animations.
- **Zero telemetry, zero account, fully offline-capable.**

---

## The 3-Tier Bypass Engine

The Go sidecar (`dpireaper-proxy`) exposes three operational modes. The UI maps them to three friendly tiers:

| Tier | Mode | Engine flags | When to use |
|:---:|:---:|---|---|
| **Fast** | `0` | `--https-split-mode sni` | Light filtering; minimal latency. Best for games and voice. |
| **Recommended** | `1` | `--https-split-mode chunk --https-chunk-size 2` | Most Turkish ISP / corporate DPI deployments. Default. |
| **Maximum** | `2` | `--https-split-mode chunk --https-chunk-size 1` | Strict middleboxes and provider-level blocks. |

Advanced users can override the chunk size (1 / 2 / 4 bytes) in **Settings → Advanced**.

---

## LAN Sharing (PAC Server)

DPIReaper hosts a tiny HTTP server on the first free port in the `8787–8887` range. Endpoints:

| Path | Returns |
|---|---|
| `/` | A localized setup page (PAC tab + Manual proxy tab, step-by-step). Language can be forced with `?lang=xx`. |
| `/proxy.pac` · `/wpad.dat` | The auto-config script. Direct mode is served when DPIReaper is off, so devices never lose internet. |
| `/logo` | The 128×128 app icon (for the setup page header). |

Hardening:

- Bound to `0.0.0.0` only while LAN sharing is enabled in settings.
- A semaphore caps concurrent connections at **50** to defend against trivial DoS on open Wi-Fi.
- Per-stream read / write timeout of 2 s.

Pairing a phone is then a one-tap flow: scan the QR shown in the *Connect Other Devices* panel → the setup page opens in the device's own language → tap the copy icon next to the PAC URL → paste it into Wi-Fi proxy settings.

---

## Architecture &amp; Security

DPIReaper is structured as four cooperating components:

```
+---------------------------------------------------------+
| React 19 UI  (380x700, dark, 12 locales)                |
|   <-- IPC via Tauri 2 -->                               |
| Rust core   (lib.rs)                                    |
|   - System-proxy registry mgmt (winreg)                 |
|   - Sentinel + backup/restore                           |
|   - PAC HTTP server (std::net, single thread, 50 cxn)   |
|   - Tray / single-instance / autostart                  |
|   - Defender exclusion command                          |
|   - ISP heuristics (isp_detect.rs)                      |
|   <-- stdio sidecar -->                                 |
| dpireaper-proxy  (Go binary, SpoofDPI fork)             |
|   - HTTPS chunk / SNI split, DoH, DNS modes             |
+---------------------------------------------------------+
```

Hardening highlights:

- **CSP** (`tauri.conf.json`) is strict: `default-src 'self'`, no `eval`, no remote scripts, no frames, prototype frozen.
- The capability allow-list (`src-tauri/capabilities/default.json`) exposes only the commands DPIReaper actually uses.
- All user-supplied strings shown in HTML pass through **DOMPurify** before insertion.
- Release binaries are built with `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true` — small, no debug symbols.
- The Defender exclusion command **never** runs without explicit user consent (modal on first launch).
- No code in DPIReaper makes any network request other than (a) the chosen DoH resolver, (b) the user's own destination through the local proxy, and (c) the in-app GitHub / Discord / Patreon links — which are opened in the user's default browser via `tauri-plugin-shell`.

---

## System Requirements

- **OS**: Windows 10 (1809+) or Windows 11, 64-bit
- **Architecture**: x86_64
- **RAM**: ~80 MB resident (WebView2)
- **Permissions**: Administrator is recommended (so the app can write the system-proxy registry keys and add a Defender exclusion if the user accepts). The app still runs un-elevated for personal-account proxy use only.

---

## Installation

1. Go to the [**Releases**](https://github.com/ismail-kaykusuz/DPIReaper/releases) page.
2. Download either:
   - `DPIReaper_1.0.0_x64-setup.exe` (NSIS installer — recommended), or
   - `DPIReaper_1.0.0_x64_en-US.msi` (Windows Installer).
3. Run the installer. **No additional drivers** are required (no WinPcap / Npcap / WinDivert).
4. Launch DPIReaper. On first run it will:
   - Show a one-time language picker, and
   - Ask whether to add a Defender exclusion (you can decline; everything else still works).

---

## Quick Start

1. Open DPIReaper.
2. Pick a profile in **Settings → Connection** (or just leave the default *Recommended*).
3. Click the large connect button on the home screen.
4. The status pill turns green and reads **Protected Connection** — you're done.
5. To pair a phone, open **Connect Other Devices** and scan the QR code with the phone's camera.

To temporarily revert to your normal connection, click the same button again — DPIReaper atomically restores the previous proxy state.

---

## Build From Source

Prerequisites:

- Node.js 18+
- Rust toolchain (`stable-x86_64-pc-windows-msvc`)
- Visual Studio 2022 Build Tools with the *Desktop development with C++* workload (provides `msvcrt.lib`, `link.exe`)
- Go 1.22+ (only required if you rebuild the proxy sidecar)

Commands:

```powershell
git clone https://github.com/ismail-kaykusuz/DPIReaper.git
cd DPIReaper
npm install

# Dev (hot-reload UI, debug Rust)
npm run dev:app

# Production installer (.exe + .msi)
npm run build:app
```

The artefacts land in:

```
src-tauri/target/release/bundle/nsis/DPIReaper_1.0.0_x64-setup.exe
src-tauri/target/release/bundle/msi/DPIReaper_1.0.0_x64_en-US.msi
```

---

## Privacy &amp; Telemetry

> [!IMPORTANT]
> **DPIReaper collects nothing.** No analytics SDK, no crash reporter, no remote logging endpoint. Logs live in a 100-entry in-memory ring buffer and are wiped the moment the process exits.
>
> The only outbound connections initiated by DPIReaper itself are:
>
> - DoH queries to the resolver you choose in Settings,
> - The PAC server (LAN, only when you enable LAN sharing),
> - Opening the GitHub / Discord / Patreon links in your default browser when *you* click them.
>
> Your destination traffic stays between you and the destination — DPIReaper is not a VPN and does not have a remote tunnel endpoint.

---

## Legal Notice &amp; Disclaimer

DPIReaper is provided **“AS IS”, without warranty of any kind**, as permitted by the MIT License (see [`LICENSE`](LICENSE)).

1. **Purpose.** DPIReaper is published as a *network-engineering and educational tool* that demonstrates TLS ClientHello fragmentation, PAC-based proxy distribution, and Windows system-proxy lifecycle management. It is **not** a circumvention service, not a VPN, and does not transport traffic through any third-party server.
2. **No third-party traffic interception.** The application does not act as a man-in-the-middle for TLS; it only **rewrites packet boundaries** of the user's own outgoing flows on the user's own machine.
3. **Your jurisdiction may restrict use.** It is the **end user's sole responsibility** to ensure that using DPIReaper does not violate the laws, regulations, terms of service, or workplace policies that apply to them. The authors and contributors of DPIReaper expressly disclaim any responsibility for misuse.
4. **No banking / safety guarantees.** Because DPIReaper does not introduce a remote endpoint, it does not add a new trust party to your TLS chain. However, the authors make **no security claim of any kind**, and you must not rely on DPIReaper for the security of sensitive sessions (banking, healthcare, government). Use at your own risk.
5. **Trademarks.** “Discord”, “Steam”, “Roblox”, “Windows”, “Microsoft Defender” and any other product names referenced in this README are trademarks of their respective owners. Their mention here is purely descriptive and does **not** imply any endorsement of or by DPIReaper.
6. **Compliance.** If you operate DPIReaper inside an organization that has its own acceptable-use or proxy policy, you must obtain the appropriate authorization first. The authors will cooperate with legitimate take-down requests filed via the GitHub repository.
7. **Open source.** The full source code is available in this repository under the MIT License. You are free to audit, fork, and self-build any release.

By downloading, installing, or running DPIReaper, **you acknowledge that you have read and accepted this disclaimer in full**.

---

## Support the Project

DPIReaper is developed in spare time and stays free, open-source, and ad-free. If it helps you, please consider supporting development:

### Patreon

<p>
  <a href="https://www.patreon.com/cw/DPIReaper">
    <img alt="Patreon" src="https://img.shields.io/badge/Patreon-DPIReaper-F96854?style=for-the-badge&logo=patreon&logoColor=white">
  </a>
</p>

### Crypto

<table>
<tr>
  <td align="center" width="50%">
    <b>BNB Smart Chain · BEP-20</b><br>
    <img src="images/qrcode-BNB%20Smart%20Chain%20(BEP20).png" width="200" alt="BNB BEP20 QR"><br>
    <code>0xc770595148f893cd9c29b810391c177d289819ae</code>
  </td>
  <td align="center" width="50%">
    <b>Tron · TRC-20 (USDT only)</b><br>
    <img src="images/qrcode-Tron%20(TRC20).png" width="200" alt="Tron TRC20 QR"><br>
    <code>TKCCjWyzUNzbUhcPBiNm3g8TkUYA8FfvMA</code>
  </td>
</tr>
</table>

> [!WARNING]
> On the Tron (TRC-20) address above, **send USDT only**. Sending any other coin or token will result in permanent loss.

---

## Credits

- DPI engine sidecar: derived from the open-source [SpoofDPI](https://github.com/xvzc/SpoofDPI) project (Go).
- UI icons: [lucide-react](https://lucide.dev/).
- Framework: [Tauri 2](https://tauri.app/), [React 19](https://react.dev/), [framer-motion](https://www.framer.com/motion/).

Thanks to everyone who has reported issues and translated the UI.

---

## License

DPIReaper is released under the **MIT License**. See [`LICENSE`](LICENSE) for full text.

<br>
<p align="center"><sub>Crafted with care for an open, accessible internet.</sub></p>
