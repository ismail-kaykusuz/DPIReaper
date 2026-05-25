# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| Latest release on [GitHub Releases](https://github.com/ismail-kaykusuz/DPIReaper/releases) | Yes |
| Older releases | No |

Please upgrade to the latest release before reporting a vulnerability.

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, email **kaykusuz.ismail34@gmail.com** with:

- A clear description of the issue and its potential impact.
- Steps to reproduce, including DPIReaper version and Windows build.
- Any proof-of-concept, logs, or screenshots (redact personal data).
- Your preferred contact method for follow-up.

You should receive an initial response within **72 hours**. If the report is
accepted, we will:

1. Confirm the issue and agree on a disclosure timeline.
2. Prepare and ship a fix in a patch release when possible.
3. Credit you in the release notes (unless you prefer to stay anonymous).

## Scope

In scope:

- Remote code execution, privilege escalation, or sandbox escape in DPIReaper.
- Unauthorized network egress beyond the documented behavior (DoH resolver,
  local proxy path, user-initiated external links).
- PAC server abuse that allows access outside the intended LAN-sharing model.
- Registry / system-proxy changes without user consent.
- CSP, capability, or IPC boundary bypasses in the Tauri shell.

Out of scope:

- ISP-level blocking or DPI techniques outside the application.
- Issues requiring physical access to an unlocked machine.
- Social engineering of the maintainer or users.
- Reports about missing code signing (known limitation).

## Safe Harbor

Good-faith security research that follows this policy will not be pursued
legally by the project maintainer. Do not access data that is not yours, do not
disrupt other users, and do not publicly disclose before a fix is available
unless we agree otherwise.
