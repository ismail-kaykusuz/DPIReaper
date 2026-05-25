# Contributing to DPIReaper

Thanks for your interest in DPIReaper. This document explains how to file issues, propose changes, and submit pull requests.

> **Scope reminder.** DPIReaper is a **network-engineering and educational tool**. Contributions that broaden its scope into circumvention-as-a-service, third-party traffic interception, or anything that would violate the [Legal Notice & Disclaimer](README.md#legal-notice--disclaimer) will not be accepted.

---

## Table of Contents

- [Ground rules](#ground-rules)
- [Asking a question](#asking-a-question)
- [Reporting a bug](#reporting-a-bug)
- [Proposing a feature](#proposing-a-feature)
- [Development setup](#development-setup)
- [Project layout](#project-layout)
- [Coding conventions](#coding-conventions)
- [Commit & PR conventions](#commit--pr-conventions)
- [Localization](#localization)
- [Security issues](#security-issues)

---

## Ground rules

- Be respectful. The [Code of Conduct](CODE_OF_CONDUCT.md) is enforced in every channel of the project.
- Use English in issues, PR titles, and code comments. Discussions and Discord may be multilingual.
- One concern per issue / PR. Small, focused changes are merged faster.
- Don't open a PR for a large refactor without first opening a Discussion to align on direction.

---

## Asking a question

- For **usage / setup** questions, use [GitHub Discussions](https://github.com/ismail-kaykusuz/DPIReaper/discussions) or our [Discord](https://discord.gg/s8nqMqecXY).
- Don't open Issues for questions — they will be converted to Discussions.

---

## Reporting a bug

Open a [Bug report](https://github.com/ismail-kaykusuz/DPIReaper/issues/new?template=bug_report.yml) and fill in **all** fields. A good report includes:

- Windows build (e.g. *Windows 11 23H2 22631.4317*) and architecture.
- DPIReaper version (from **Settings → About**).
- Active profile and any **Advanced** overrides (chunk size, DoH resolver, IPv6, sentinel).
- Exact reproduction steps and the expected vs. actual behavior.
- Relevant log lines from **Settings → Diagnostics → Open log folder** (redact anything sensitive).
- A short screen recording or screenshot when the bug is visual.

Bugs without a clear repro path are usually closed as `needs-info` after 14 days.

---

## Proposing a feature

Open a [Feature request](https://github.com/ismail-kaykusuz/DPIReaper/issues/new?template=feature_request.yml) and explain:

- The user-facing problem (not the implementation).
- Who is affected and how often.
- Alternatives you already considered.
- Any backwards-compatibility implications.

We deliberately keep the surface area small. Most "make it configurable" requests are rejected — sane defaults are a feature.

---

## Development setup

Requirements:

- **Windows 10 1809+ / Windows 11 (x64)**
- **Node.js 20 LTS** (`node --version` ≥ 20)
- **Rust stable toolchain** (`rustup default stable`)
- **Visual Studio 2022 Build Tools** with the *Desktop development with C++* workload (for MSVC linker + Windows SDK)
- **Npcap** with WinPcap-API-compatible mode (only required at runtime; not needed for `cargo check`)

Clone & install:

```powershell
git clone https://github.com/ismail-kaykusuz/DPIReaper.git
cd DPIReaper
npm install
```

Development run (hot-reload):

```powershell
npm run dev
```

Production build (NSIS + MSI):

```powershell
npm run build:app
```

The build script handles MSVC environment setup. If you hit `LNK1104 cannot open file 'msvcrt.lib'`, your Build Tools install is incomplete — re-run the Visual Studio Installer and make sure both **MSVC v143** and the **Windows 10/11 SDK** components are checked.

---

## Project layout

```
DPIReaper/
├─ src/                      # React 19 UI (Vite)
│  ├─ App.jsx                # Root view + IPC plumbing
│  ├─ settings/              # Settings tabs
│  ├─ overlays/              # Modals (Defender consent, language picker, ...)
│  ├─ locales/               # 12 locale files (en, tr, de, fr, ...)
│  ├─ profiles.js            # Bypass profile definitions
│  └─ constants.js           # External URLs (GitHub, Patreon, Discord)
├─ src-tauri/                # Tauri 2 + Rust core
│  ├─ src/lib.rs             # IPC commands, PAC server, system-proxy mgmt
│  ├─ src/isp_detect.rs      # ISP heuristics
│  ├─ src/setup_page.rs      # Localized PAC setup page renderer
│  ├─ assets/setup_page.html # Setup-page template
│  ├─ assets/setup_i18n.json # Setup-page translations
│  └─ capabilities/          # Tauri capability allow-list (security)
├─ images/                   # README assets only
└─ scripts/                  # Build helpers (PowerShell + Node)
```

---

## Coding conventions

**React / JavaScript**

- Functional components only. No class components.
- Use `useMemo` / `useCallback` for anything that participates in IPC or a fast-changing render path.
- All user-facing strings live in `src/locales/*.js`, keyed in `t.<key>`. Never hard-code English in JSX.
- Run `npm run lint` before pushing.

**Rust**

- Run `cargo fmt --all` and `cargo clippy --all-targets -- -D warnings` before pushing.
- Public functions exposed via `#[tauri::command]` must validate every argument; the UI is trusted only as a *suggestion*.
- Never call `unsafe` without a `// SAFETY:` comment that explains the invariant.

**Security & privacy**

- No new network calls without explicit user consent. The only egress points are: the chosen DoH resolver, the user's own destinations through the local proxy, and the in-app external links opened via `tauri-plugin-shell`.
- No telemetry. Period.
- Never widen the CSP in `src-tauri/tauri.conf.json` without justifying it in the PR description.
- Never widen the capability allow-list (`src-tauri/capabilities/default.json`) without justifying it in the PR description.

---

## Commit & PR conventions

We follow **Conventional Commits**:

```
<type>(<scope>): <short summary>

<body, optional>
```

Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `chore`, `build`, `ci`, `test`.

Examples:

- `feat(proxy): expose configurable chunk size in Advanced`
- `fix(pac): bind to 0.0.0.0 only while LAN sharing is on`
- `docs(readme): add screenshot of localized LAN setup page`

PR rules:

- Title is a Conventional Commit line.
- Description explains *why*, not *what* — the diff already shows *what*.
- Link the issue with `Closes #123` when applicable.
- Don't include `Co-authored-by` trailers for AI tools; sole human authorship only.

---

## Localization

DPIReaper ships in 12 languages. When adding a UI string:

1. Add the English key in `src/locales/en.js`.
2. Mirror it in **all** other `src/locales/*.js` files. Machine translation is acceptable as a starting point but **must** be marked with a `// TODO: native review` comment.
3. Keep keys short and self-describing. Use `connectionTitle` rather than `t1`.
4. The PAC setup page has a separate translation file at `src-tauri/assets/setup_i18n.json` — mirror new keys there too if the string appears on the LAN setup page.

---

## Security issues

**Do not** open public issues for security vulnerabilities. See [SECURITY.md](SECURITY.md) for the disclosure process.
