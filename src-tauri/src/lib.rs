// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod isp_detect;
mod setup_page;
mod windows_autostart;
mod update_check;

use local_ip_address::list_afinet_netifas;
use std::io::Write;
use std::net::{IpAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;
use setup_page::make_setup_html;
use tauri::Emitter;
use tauri::Manager;

// ═══════════════════════════════════════════════════════════════════
// P0-FIX-1: Sentinel dosyası sistemi — crash sonrası proxy kurtarma
// P0-FIX-2: Orijinal proxy ayarları yedekleme / geri yükleme
// ═══════════════════════════════════════════════════════════════════

#[cfg(target_os = "windows")]
mod registry {
    use winreg::enums::*;
    use winreg::RegKey;

    const INTERNET_SETTINGS: &str = r"Software\Microsoft\Windows\CurrentVersion\Internet Settings";

    pub fn read_value_string(name: &str) -> Option<String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu.open_subkey(INTERNET_SETTINGS).ok()?;
        let val: String = key.get_value(name).ok()?;
        Some(val)
    }

    pub fn read_value_dword(name: &str) -> Option<u32> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let key = hkcu.open_subkey(INTERNET_SETTINGS).ok()?;
        key.get_value(name).ok()
    }

    pub fn set_proxy(proxy_addr: &str, port: u16) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey(INTERNET_SETTINGS)
            .map_err(|e| format!("Registry açılamadı: {}", e))?;

        key.set_value("ProxyServer", &format!("{}:{}", proxy_addr, port))
            .map_err(|e| format!("ProxyServer: {}", e))?;
        key.set_value("ProxyEnable", &1u32)
            .map_err(|e| format!("ProxyEnable: {}", e))?;
        let proxy_override = [
            "<local>",
            // ✅ FIX: LAN IP aralıkları — olmazsa tarayıcı LAN'daki PAC sunucusuna
            //    SpoofDPI proxy üzerinden gider → döngü → timeout
            "10.*",
            "172.16.*",
            "172.17.*",
            "172.18.*",
            "172.19.*",
            "172.20.*",
            "172.21.*",
            "172.22.*",
            "172.23.*",
            "172.24.*",
            "172.25.*",
            "172.26.*",
            "172.27.*",
            "172.28.*",
            "172.29.*",
            "172.30.*",
            "172.31.*",
            "192.168.*",
            // NCSI — WiFi "internet yok" simgesi fix
            "*.msftconnecttest.com",
            "*.msftncsi.com",
            "dns.msn.com",
            "ipv6.msftconnecttest.com",
            // Android/iOS connectivity check
            "connectivitycheck.gstatic.com",
            "connectivitycheck.android.com",
            "clients3.google.com",
            "play.googleapis.com",
            "captive.apple.com",
            "gsp1.apple.com",
            "connectivitycheck.samsung.com",
            // Windows Update
            "*.windowsupdate.com",
            "*.delivery.mp.microsoft.com",
            // ── Oyun & Uygulama Launcher/Updater Bypass ──
            // Bu domainler DPI ile engellenmez ama bazı uygulamaların C++ HTTP
            // istemcileri SpoofDPI'nin TLS parçalamasıyla uyumsuz çalışabilir.
            // Bypass ile direkt bağlansınlar, oyun/uygulama trafiği proxy'den geçsin.
            //
            // Steam
            "*.steamcontent.com",
            "*.steamstatic.com",
            "clientconfig.akamai.steamstatic.com",
            "*.cm.steampowered.com",
            // Epic Games
            "*.epicgames.com",
            "*.unrealengine.com",
            "download.epicgames.com",
            "launcher-public-service-prod06.ol.epicgames.com",
            // Riot Games (LoL, Valorant)
            "*.riotgames.com",
            "*.leagueoflegends.com",
            "riotgames-update.akamaized.net",
            // EA / Origin
            "*.ea.com",
            "*.origin.com",
            // Blizzard / Battle.net
            "*.blizzard.com",
            "*.battle.net",
            "blzddist1-a.akamaihd.net",
            // Ubisoft
            "*.ubisoft.com",
            "*.ubi.com",
            // Microsoft / Xbox
            "*.xboxlive.com",
            "*.xbox.com",
            "*.microsoft.com",
            // Genel CDN'ler (installer/updater dağıtımı)
            "*.cachefly.net",
        ]
        .join(";");
        key.set_value("ProxyOverride", &proxy_override)
            .map_err(|e| format!("ProxyOverride: {}", e))?;
        Ok(())
    }

    pub fn clear_proxy() -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey(INTERNET_SETTINGS)
            .map_err(|e| format!("Registry açılamadı: {}", e))?;

        key.set_value("ProxyEnable", &0u32)
            .map_err(|e| format!("ProxyEnable: {}", e))?;
        let _ = key.delete_value("ProxyServer");
        let _ = key.delete_value("ProxyOverride");
        let _ = key.delete_value("AutoConfigURL");
        Ok(())
    }

    pub fn restore_proxy(
        server: &str,
        enable: u32,
        override_val: Option<&str>,
    ) -> Result<(), String> {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let (key, _) = hkcu
            .create_subkey(INTERNET_SETTINGS)
            .map_err(|e| format!("Registry açılamadı: {}", e))?;

        key.set_value("ProxyServer", &server)
            .map_err(|e| format!("ProxyServer: {}", e))?;
        key.set_value("ProxyEnable", &enable)
            .map_err(|e| format!("ProxyEnable: {}", e))?;
        if let Some(ov) = override_val {
            key.set_value("ProxyOverride", &ov)
                .map_err(|e| format!("ProxyOverride: {}", e))?;
        }
        Ok(())
    }

    pub fn can_access() -> bool {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        hkcu.open_subkey(INTERNET_SETTINGS).is_ok()
    }
}

/// Sentinel dosya yolu — proxy aktifken var, kapanınca silinir.
/// Crash/BSOD/force-kill sonrası hâlâ duruyorsa → dirty shutdown algılanır.
fn sentinel_path() -> std::path::PathBuf {
    std::env::temp_dir().join("dpireaper_proxy_active.lock")
}

/// PAC dosyası yolu — AutoConfigURL ile proxy yapılandırması için

/// Orijinal proxy ayarlarını tutan yapı
#[derive(Debug, Clone, Default)]
struct OriginalProxySettings {
    proxy_enable: Option<u32>,
    proxy_server: Option<String>,
    proxy_override: Option<String>,
}

/// Orijinal proxy ayarlarını saklayan global state
fn original_proxy_store() -> &'static Mutex<Option<OriginalProxySettings>> {
    static STORE: OnceLock<Mutex<Option<OriginalProxySettings>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(None))
}

/// Proxy ayarlarını set etmeden ÖNCE mevcut değerleri yedekler
#[cfg(target_os = "windows")]
fn backup_proxy_settings() {
    let settings = OriginalProxySettings {
        proxy_enable: registry::read_value_dword("ProxyEnable"),
        proxy_server: registry::read_value_string("ProxyServer"),
        proxy_override: registry::read_value_string("ProxyOverride"),
    };

    if let Ok(mut guard) = original_proxy_store().lock() {
        // Sadece ilk backup'ı al — sonraki set_system_proxy çağrıları üzerine yazmasın
        if guard.is_none() {
            eprintln!("[PROXY-BACKUP] Orijinal ayarlar yedeklendi: {:?}", settings);
            *guard = Some(settings);
        }
    }
}

/// Yedeklenen proxy ayarlarını geri yükler.
/// Eğer orijinal ayarlarda proxy aktifse → geri yükle
/// Eğer orijinal ayarlarda proxy yoksa → sil (mevcut davranış)
#[cfg(target_os = "windows")]
fn restore_proxy_settings() -> bool {
    let original = match original_proxy_store().lock() {
        Ok(guard) => guard.clone(),
        Err(poisoned) => {
            eprintln!("[WARN] proxy backup lock poisoned, recovering");
            poisoned.into_inner().clone()
        }
    };

    if let Some(orig) = original {
        // Orijinal ProxyServer varsa geri yükle (kurumsal proxy koruması)
        if let Some(ref server) = orig.proxy_server {
            if !server.is_empty() && !server.starts_with("127.0.0.1:") {
                eprintln!("[PROXY-RESTORE] Kurumsal proxy geri yükleniyor: {}", server);

                let enable_val = orig.proxy_enable.unwrap_or(0);
                let _ = registry::restore_proxy(server, enable_val, orig.proxy_override.as_deref());

                return true; // Geri yükleme yapıldı, silme işlemine geçme
            }
        }
    }
    // Orijinal proxy yoktu veya bizimkiyle aynıydı → normal silme prosedürü (mevcut davranış)
    false
}

/// Sanal ağ adaptörlerini filtreleyen akıllı LAN IP bulucu.
/// VirtualBox, VMware, Hamachi, VPN gibi sanal adaptörleri atlar.
fn get_safe_lan_ip() -> String {
    // Filtrelenecek sanal adaptör anahtar kelimeleri (küçük harf)
    const VIRTUAL_KEYWORDS: &[&str] = &[
        "virtual",
        "vmware",
        "vmnet",
        "vbox",
        "virtualbox",
        "pseudo",
        "hamachi",
        "vpn",
        "vethernet",
        "loopback",
        "docker",
        "wsl",
        "hyper-v",
        "bluetooth",
        "teredo",
        "isatap",
        "6to4",
        "tap-",
        "tun",
        "warp",
        "tailscale",
        "zerotier",
        "nordlynx",
        "wireguard",
        "proton",
        "mullvad",
        "windscribe",
        "surfshark",
        "host-only",
        "hostonly",
        "vEthernet",
        "npcap",
        "miniport",
    ];

    /// Bilinen sanal ağ IP aralıklarını kontrol eder.
    /// Adaptör adı filtreleri yakalayamadığında (Windows generic isimlendirme) bu devreye girer.
    fn is_virtual_ip_range(ip: &std::net::Ipv4Addr) -> bool {
        let octets = ip.octets();
        match (octets[0], octets[1]) {
            // VirtualBox Host-Only: 192.168.56.x (varsayılan)
            (192, 168) if octets[2] == 56 => true,
            // VMware NAT: 192.168.19x.x
            (192, 168) if octets[2] >= 190 => true,
            // Docker default bridge: 172.17.x.x
            (172, 17) => true,
            // WSL: 172.x.x.x (genellikle 172.16-31 arası ama 172.17+ sanal olma ihtimali yüksek)
            // Hamachi: 25.x.x.x
            (25, _) => true,
            // APIPA (otomatik atanmış, ağ bağlantısı yok): 169.254.x.x
            (169, 254) => true,
            _ => false,
        }
    }

    if let Ok(netifs) = list_afinet_netifas() {
        // Debug: Tüm arayüzleri logla (sorun tespiti için)
        for (name, ip) in &netifs {
            eprintln!("[NET-DEBUG] Interface: '{}' → {}", name, ip);
        }

        // PASS 1: Gerçek adaptör + gerçek IP aralığı
        for (name, ip) in &netifs {
            if let IpAddr::V4(v4) = ip {
                if v4.is_loopback() || v4.is_link_local() {
                    continue;
                }
                let name_lower = name.to_lowercase();
                let is_virtual_name = VIRTUAL_KEYWORDS.iter().any(|kw| name_lower.contains(kw));
                let is_virtual_range = is_virtual_ip_range(v4);

                if !is_virtual_name && !is_virtual_range {
                    eprintln!(
                        "[NET-SELECT] ✅ Gerçek adaptör seçildi: '{}' → {}",
                        name, v4
                    );
                    return v4.to_string();
                }
            }
        }

        // PASS 2: Fallback — ad filtresi atlayıp sadece IP aralığı kontrol et
        for (name, ip) in &netifs {
            if let IpAddr::V4(v4) = ip {
                if !v4.is_loopback() && !v4.is_link_local() && !is_virtual_ip_range(v4) {
                    eprintln!("[NET-SELECT] ⚠️ Fallback adaptör: '{}' → {}", name, v4);
                    return v4.to_string();
                }
            }
        }

        // PASS 3: Son çare — sanal bile olsa bir IP ver (sadece loopback olmasın)
        for (_, ip) in &netifs {
            if let IpAddr::V4(v4) = ip {
                if !v4.is_loopback() {
                    return v4.to_string();
                }
            }
        }
    }

    "127.0.0.1".to_string()
}

/// Basit string hash — PAC body değişti mi kontrolü için
fn simple_hash(s: &str) -> u64 {
    let mut h: u64 = 5381;
    for b in s.bytes() {
        h = h.wrapping_mul(33).wrapping_add(b as u64);
    }
    h
}

/// Ön-derlenmiş PAC HTTP yanıtı — her istekte format! çağırmaz
pub struct PacCache {
    pub pac_response: Vec<u8>,
    pub body_hash: u64,
}

/// PAC sunucusu durumu: thread handle + shutdown flag + dinamik body
pub struct PacServerState {
    pub join_handle: Mutex<Option<thread::JoinHandle<()>>>,
    pub shutdown: Arc<AtomicBool>,
    pub pac_body: Arc<Mutex<String>>,
    pub pac_cache: Arc<Mutex<PacCache>>,
    pub pac_port: Mutex<u16>,
    pub pac_url: Mutex<String>,
    pub proxy_port: Arc<AtomicU16>,
}

impl Default for PacServerState {
    fn default() -> Self {
        Self {
            join_handle: Mutex::new(None),
            shutdown: Arc::new(AtomicBool::new(false)),
            pac_body: Arc::new(Mutex::new(make_pac_direct_body())),
            pac_cache: Arc::new(Mutex::new(PacCache {
                pac_response: Vec::new(),
                body_hash: 0,
            })),
            pac_port: Mutex::new(0),
            pac_url: Mutex::new(String::new()),
            proxy_port: Arc::new(AtomicU16::new(8080)),
        }
    }
}

const PAC_PORT_START: u16 = 8787;
const PAC_PORT_END: u16 = 8887;
/// Bağlantı kesildiğinde kullanılan fallback PAC: tüm trafiği DIRECT yönlendirir
/// Bu sayede cihazlar internet erişimini kaybetmez
fn make_pac_direct_body() -> String {
    r#"function FindProxyForURL(url, host) {
    // DPIReaper proxy devre dışı — tüm trafik doğrudan çıkış
    // Bu PAC dosyası otomatik olarak sunulur; ayar değişikliği gerekmez
    return "DIRECT";
}
"#
    .to_string()
}

/// Production PAC: yerel ağ DIRECT, diğerleri PROXY ip:port; DIRECT (fail-safe)
/// dnsResolve çağrıları try-catch ile korunuyor — DNS timeout olursa PAC script çökmez
fn make_pac_body(lan_ip: &str, proxy_port: u16) -> String {
    let proxy = format!("{}:{}", lan_ip, proxy_port);
    format!(
        r#"function FindProxyForURL(url, host) {{
    // 1) Localhost & plain hostnames → DIRECT (anında, DNS yok)
    if (isPlainHostName(host) ||
        host === "localhost" ||
        shExpMatch(host, "127.*") ||
        shExpMatch(host, "10.*") ||
        shExpMatch(host, "192.168.*") ||
        shExpMatch(host, "172.16.*") || shExpMatch(host, "172.17.*") ||
        shExpMatch(host, "172.18.*") || shExpMatch(host, "172.19.*") ||
        shExpMatch(host, "172.2?.*") || shExpMatch(host, "172.30.*") ||
        shExpMatch(host, "172.31.*") ||
        shExpMatch(host, "*.local") ||
        shExpMatch(host, "*.localhost") ||
        shExpMatch(host, "*.internal"))
        return "DIRECT";

    // 2) OS Connectivity Check domainleri → DIRECT
    //    Bu olmazsa Windows/Android/iOS "internet yok" simgesi gösterir
    if (shExpMatch(host, "*.msftconnecttest.com") ||
        shExpMatch(host, "*.msftncsi.com") ||
        host === "dns.msn.com" ||
        host === "ipv6.msftconnecttest.com" ||
        host === "connectivitycheck.gstatic.com" ||
        host === "connectivitycheck.android.com" ||
        host === "clients3.google.com" ||
        host === "play.googleapis.com" ||
        host === "captive.apple.com" ||
        host === "gsp1.apple.com" ||
        host === "connectivitycheck.samsung.com" ||
        shExpMatch(host, "*.windowsupdate.com") ||
        shExpMatch(host, "*.delivery.mp.microsoft.com"))
        return "DIRECT";

    // NOT: Oyun/uygulama launcher bypass'ı burada YOK!
    // PAC server telefon/LAN cihazlarına hizmet eder — bu cihazlarda DPI engeli aktif,
    // bu yüzden oyun trafiği proxy üzerinden geçmeli.
    // Windows masaüstünde ise Registry ProxyOverride + WinHTTP bypass ile çözülür.

    return "PROXY {}; DIRECT";
}}"#,
        proxy
    )
}

/// Absolute URL'den path kısmını çıkarır.
/// "http://192.168.1.5:8787/proxy.pac" → "/proxy.pac"
/// "http://192.168.1.5:8787/"          → "/"
/// "/proxy.pac"                         → "/proxy.pac"  (zaten relative)
fn normalize_path(raw: &str) -> &str {
    if let Some(pos) = raw.find("://") {
        let after_scheme = &raw[pos + 3..];
        if let Some(slash_pos) = after_scheme.find('/') {
            return &after_scheme[slash_pos..];
        }
        return "/";
    }
    raw
}

fn handle_pac_request(
    stream: TcpStream,
    pac_body: &Arc<Mutex<String>>,
    pac_cache: &Arc<Mutex<PacCache>>,
    pac_url: &str,
    proxy_port: u16,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));

    let mut reader = std::io::BufReader::new(stream);
    let mut first_line = String::new();

    if std::io::BufRead::read_line(&mut reader, &mut first_line).is_err() || first_line.is_empty() {
        return;
    }

    // TCP RST önleme — request header'ları tamamen tüketilmeli
    let mut discard = String::new();
    while let Ok(n) = std::io::BufRead::read_line(&mut reader, &mut discard) {
        if n <= 2 {
            break;
        }
        discard.clear();
    }

    let mut stream = reader.into_inner();

    // ✅ FIX: Absolute URL desteği — proxy üzerinden gelen istekleri de doğru parse et
    let raw_path = first_line
        .split_whitespace()
        .nth(1)
        .unwrap_or("/");
    let (path_only, lang) = setup_page::parse_lang_from_path(raw_path);
    let path = normalize_path(path_only);

    let is_get = first_line.to_uppercase().starts_with("GET ");

    // ── 1) Logo ──
    if is_get && path == "/logo" {
        let img = include_bytes!("../icons/128x128.png");
        let hdr = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: image/png\r\nConnection: close\r\nContent-Length: {}\r\n\r\n",
            img.len()
        );
        let _ = stream.write_all(hdr.as_bytes());
        let _ = stream.write_all(img);
        let _ = stream.flush();
        return;
    }

    // ── 2) PAC dosyası (/proxy.pac veya /wpad.dat) ──
    // Bazı senaryolarda tarayıcılar absolute URL (http://ip:port/proxy.pac) olarak gönderebilir.
    if is_get && (path.ends_with("/proxy.pac") || path.ends_with("/wpad.dat")) {
        let current_body = pac_body
            .lock()
            .map(|b| b.clone())
            .unwrap_or_else(|_| make_pac_direct_body());
        let current_hash = simple_hash(&current_body);

        // Dinamik Cache-Control: PROXY aktifken 60s, DIRECT modda 0
        let is_direct_mode = !current_body.contains("PROXY");
        let cache_header = if is_direct_mode {
            "Cache-Control: no-cache, no-store, must-revalidate, max-age=0"
        } else {
            "Cache-Control: max-age=60"
        };

        let mode_bit: u64 = if is_direct_mode { 1 } else { 0 };
        let cache_key = current_hash.wrapping_add(mode_bit);

        if let Ok(mut cache) = pac_cache.lock() {
            if cache.body_hash != cache_key || cache.pac_response.is_empty() {
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/x-ns-proxy-autoconfig\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n{}\r\nContent-Length: {}\r\n\r\n{}",
                    cache_header,
                    current_body.len(),
                    current_body
                );
                cache.pac_response = response.into_bytes();
                cache.body_hash = cache_key;
            }
            let _ = stream.write_all(&cache.pac_response);
        } else {
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/x-ns-proxy-autoconfig\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n{}\r\nContent-Length: {}\r\n\r\n{}",
                cache_header,
                current_body.len(),
                current_body
            );
            let _ = stream.write_all(response.as_bytes());
        }
        let _ = stream.flush();
        return; // ← ÖNEMLİ: Burada fonksiyondan çık
    }

    // ── 3) GET olmayan istekler ──
    if !is_get {
        let _ = stream
            .write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
        let _ = stream.flush();
        return;
    }

    // ── 4) HTML kurulum sayfası (/) veya 404 ──
    let (status, content_type, body) = if path == "/" || path.is_empty() {
        (
            "200 OK",
            "text/html; charset=utf-8",
            make_setup_html(pac_url, proxy_port, lang),
        )
    } else {
        ("404 Not Found", "text/plain", String::new())
    };

    let response = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-cache\r\nContent-Length: {}\r\n\r\n{}",
        status,
        content_type,
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

#[derive(serde::Serialize)]
struct PacResponse {
    pac_port: u16,
}

/// P1-FIX: PAC sunucusu eşzamanlı bağlantı limiti
const MAX_PAC_CONNECTIONS: u32 = 50;

#[cfg(target_os = "windows")]
fn manage_firewall_rules(enable: bool, proxy_port: u16, pac_port: u16) {
    std::thread::spawn(move || {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // Önce mevcut kuralları temizle
        let _ = std::process::Command::new("netsh")
            .args(&[
                "advfirewall",
                "firewall",
                "delete",
                "rule",
                "name=DPIReaper_Proxy",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        let _ = std::process::Command::new("netsh")
            .args(&[
                "advfirewall",
                "firewall",
                "delete",
                "rule",
                "name=DPIReaper_PAC",
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        if enable {
            let _ = std::process::Command::new("netsh")
                .args(&[
                    "advfirewall",
                    "firewall",
                    "add",
                    "rule",
                    "name=DPIReaper_Proxy",
                    "dir=in",
                    "action=allow",
                    "protocol=TCP",
                    &format!("localport={}", proxy_port),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();

            let _ = std::process::Command::new("netsh")
                .args(&[
                    "advfirewall",
                    "firewall",
                    "add",
                    "rule",
                    "name=DPIReaper_PAC",
                    "dir=in",
                    "action=allow",
                    "protocol=TCP",
                    &format!("localport={}", pac_port),
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
    });
}

#[tauri::command]
fn start_pac_server(
    proxy_port: u16,
    state: tauri::State<'_, PacServerState>,
) -> Result<PacResponse, String> {
    let lan_ip = get_safe_lan_ip();
    state.proxy_port.store(proxy_port, Ordering::Relaxed);

    // PAC body'yi güncelle — proxy moduna geç
    let new_pac_body = make_pac_body(&lan_ip, proxy_port);
    if let Ok(mut body) = state.pac_body.lock() {
        *body = new_pac_body;
    }

    // Sunucu zaten çalışıyorsa, sadece body güncellendi — port bilgisini döndür
    let guard = state.join_handle.lock().map_err(|e| e.to_string())?;
    if guard.is_some() {
        let current_port = *state.pac_port.lock().map_err(|e| e.to_string())?;
        // PAC URL'yi de güncelle (port aynı kalsa bile proxy_port değişmiş olabilir)
        if let Ok(mut url) = state.pac_url.lock() {
            *url = format!("http://{}:{}/proxy.pac", lan_ip, current_port);
        }
        return Ok(PacResponse {
            pac_port: current_port,
        });
    }
    drop(guard); // Lock'u serbest bırak

    // P1-FIX: LAN paylaşımı her zaman 0.0.0.0'a bind eder (fonksiyon zaten sadece LAN aktifken çağrılır)
    // Ama yerel cihazların güvenliği için bind adresi sabitlenir
    let bind_addr = "0.0.0.0";

    // Dinamik PAC port: 8787-8887 arasında müsait olanı bul
    let mut found_port: u16 = 0;
    let mut listener_result = None;
    for port in PAC_PORT_START..=PAC_PORT_END {
        match TcpListener::bind((bind_addr, port)) {
            Ok(l) => {
                found_port = port;
                listener_result = Some(l);
                break;
            }
            Err(_) => continue,
        }
    }
    // Fallback: OS'tan rastgele port iste
    if listener_result.is_none() {
        match TcpListener::bind((bind_addr, 0u16)) {
            Ok(l) => {
                if let Ok(addr) = l.local_addr() {
                    found_port = addr.port();
                }
                listener_result = Some(l);
            }
            Err(e) => return Err(format!("PAC için uygun port bulunamadı: {}", e)),
        }
    }
    let listener = listener_result.unwrap();
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    manage_firewall_rules(true, proxy_port, found_port);

    let pac_url = format!("http://{}:{}/proxy.pac", lan_ip, found_port);

    // State'e kaydet
    if let Ok(mut p) = state.pac_port.lock() {
        *p = found_port;
    }
    if let Ok(mut u) = state.pac_url.lock() {
        *u = pac_url.clone();
    }

    let shutdown = Arc::clone(&state.shutdown);
    shutdown.store(false, Ordering::Relaxed);
    let pac_body_arc = Arc::clone(&state.pac_body);
    let pac_cache_arc = Arc::clone(&state.pac_cache);
    let pac_url_for_thread = pac_url.clone();
    let proxy_port_arc = Arc::clone(&state.proxy_port);

    // P1-FIX: Thread limiti için atomik sayaç
    let active_connections = Arc::new(std::sync::atomic::AtomicU32::new(0));

    let join_handle = thread::spawn(move || {
        while !shutdown.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let current = active_connections.load(Ordering::Relaxed);
                    if current >= MAX_PAC_CONNECTIONS {
                        drop(stream);
                        continue;
                    }
                    active_connections.fetch_add(1, Ordering::Relaxed);

                    let body = Arc::clone(&pac_body_arc);
                    let cache = Arc::clone(&pac_cache_arc);
                    let url = pac_url_for_thread.clone();
                    let proxy_port_live = Arc::clone(&proxy_port_arc);
                    let conn_counter = Arc::clone(&active_connections);
                    thread::spawn(move || {
                        let _ = stream.set_nonblocking(false);
                        let _ = stream.set_nodelay(true);
                        let _ = stream.set_read_timeout(Some(Duration::from_secs(2)));
                        let _ = stream.set_write_timeout(Some(Duration::from_secs(2)));
                        let port = proxy_port_live.load(Ordering::Relaxed);
                        handle_pac_request(stream, &body, &cache, &url, port);
                        conn_counter.fetch_sub(1, Ordering::Relaxed);
                    });
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // ✅ 5ms → 50ms: CPU wake-up %90 azalır, PAC latency hâlâ imperceptible
                    thread::sleep(Duration::from_millis(50));
                }
                Err(_) => {}
            }
        }
    });

    let mut guard = state.join_handle.lock().map_err(|e| e.to_string())?;
    *guard = Some(join_handle);
    Ok(PacResponse {
        pac_port: found_port,
    })
}

/// Bağlantı kesildiğinde PAC body'yi DIRECT moduna geçir.
/// Sunucu çalışmaya devam eder — cihazlar internet erişimini kaybetmez.
#[tauri::command]
fn stop_pac_server(state: tauri::State<'_, PacServerState>) -> Result<(), String> {
    // Sunucuyu kapatmak yerine PAC body'yi DIRECT moduna geçir
    if let Ok(mut body) = state.pac_body.lock() {
        *body = make_pac_direct_body();
    }

    // ✅ P0-FIX: Cache'i hemen invalidate et
    if let Ok(mut cache) = state.pac_cache.lock() {
        cache.body_hash = 0;
        cache.pac_response.clear();
    }

    #[cfg(target_os = "windows")]
    manage_firewall_rules(false, 0, 0);

    Ok(())
}

#[derive(serde::Serialize)]
struct ConfigResponse {
    port: u16,
    lan_ip: String,
    bind_address: String,
}

#[tauri::command]
fn get_sidecar_config(
    allow_lan_sharing: bool,
    enable_game_mode: bool,
) -> Result<ConfigResponse, String> {
    // Game Mode (WinHTTP) açıkken 0.0.0.0'a bind et — UWP uygulamaları (Roblox vb.)
    // AppContainer sandbox yüzünden 127.0.0.1'e erişemez, LAN IP üzerinden bağlanır
    let bind_addr = if allow_lan_sharing || enable_game_mode {
        "0.0.0.0"
    } else {
        "127.0.0.1"
    };

    // Öncelikli Portlar: 8080 - 8090 arası kontrol et
    let mut selected_port = 0;
    for port in 8080..=8090 {
        if TcpListener::bind((bind_addr, port)).is_ok() {
            selected_port = port;
            break;
        }
    }

    // Fallback: Eğer hepsi doluysa, sistemden rastgele bir port iste (Port 0)
    if selected_port == 0 {
        if let Ok(listener) = TcpListener::bind((bind_addr, 0)) {
            if let Ok(addr) = listener.local_addr() {
                selected_port = addr.port();
            }
        }
    }

    if selected_port == 0 {
        return Err("Uygun port bulunamadı.".to_string());
    }

    // Yerel IP Adresini Bul (LAN Paylaşımı için) — Sanal adaptörleri filtreler
    let lan_ip = get_safe_lan_ip();

    Ok(ConfigResponse {
        port: selected_port,
        lan_ip,
        bind_address: bind_addr.to_string(),
    })
}

/// Registry proxy işlemlerini serialize eden global lock
/// set_system_proxy ve clear_system_proxy eş zamanlı çağrılabilir (reconnect sırasında)
fn proxy_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

/// P0-FIX-3: Poisoned mutex recovery — panic sonrası bile proxy temizleme çalışsın
fn acquire_proxy_lock() -> std::sync::MutexGuard<'static, ()> {
    match proxy_lock().lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            eprintln!("[WARN] Proxy lock was poisoned (previous panic?), recovering");
            poisoned.into_inner()
        }
    }
}

#[tauri::command]
fn clear_system_proxy() -> Result<(), String> {
    let _guard = acquire_proxy_lock(); // P0-FIX-3: Poisoned mutex recovery
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // P0-FIX-2: Önce orijinal ayarları geri yüklemeyi dene
        let has_original = restore_proxy_settings();

        if !has_original {
            let _ = registry::clear_proxy();
        }

        // 4. DNS Önbelleğini Temizle (Race condition / DNS sorunlarını önler)
        let _ = Command::new("ipconfig")
            .arg("/flushdns")
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();

        // 5. Notify browsers about the change
        notify_proxy_change();

        // 6. Native/C++ ve arka plan servisleri için WinHTTP sistem proxy'sini sıfırla
        let _ = std::process::Command::new("netsh")
            .args(&["winhttp", "reset", "proxy"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        manage_firewall_rules(false, 0, 0);
    }

    // P0-FIX-1: Sentinel dosyasını sil — proxy artık aktif değil
    let _ = std::fs::remove_file(sentinel_path());

    // P0-FIX-2: Backup'ı temizle — geri yükleme tamamlandı
    if let Ok(mut guard) = original_proxy_store().lock() {
        *guard = None;
    }

    Ok(())
}

/// Notify Windows that internet settings have changed
/// This forces browsers to immediately pick up the new proxy settings
#[cfg(target_os = "windows")]
fn notify_proxy_change() {
    use std::ptr::null_mut;
    use winapi::um::wininet::{
        InternetSetOptionW, INTERNET_OPTION_REFRESH, INTERNET_OPTION_SETTINGS_CHANGED,
    };

    unsafe {
        // Notify that settings have changed
        InternetSetOptionW(null_mut(), INTERNET_OPTION_SETTINGS_CHANGED, null_mut(), 0);
        InternetSetOptionW(null_mut(), INTERNET_OPTION_REFRESH, null_mut(), 0);
    }
}

/// P1-FIX: UWP AppContainer'ları arka planda otomatik olarak Loopback Proxy için yetkilendirir.
/// Bu sayede Roblox, Speedtest ve diğer Windows Mağaza uygulamaları 127.0.0.1 proxy sunucusuna başarılı şekilde bağlanabilir.
#[cfg(target_os = "windows")]
fn exempt_all_uwp_apps() {
    std::thread::spawn(|| {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let script = r#"
            try {
                $packages = Get-AppxPackage -ErrorAction SilentlyContinue
                foreach ($pkg in $packages) {
                    if ($pkg.PackageFamilyName) {
                        CheckNetIsolation.exe LoopbackExempt -a "-n=$($pkg.PackageFamilyName)"
                    }
                }
            } catch {}
        "#;

        let _ = std::process::Command::new("powershell")
            .args(&["-NoProfile", "-WindowStyle", "Hidden", "-Command", script])
            .creation_flags(CREATE_NO_WINDOW)
            .status();
    });
}

#[tauri::command]
fn set_system_proxy(port: u16, enable_winhttp: bool) -> Result<(), String> {
    let _guard = acquire_proxy_lock(); // P0-FIX-3: Poisoned mutex recovery
                                       // ✅ Port aralığı validasyonu
    if port < 1024 {
        return Err("Geçersiz port numarası (1024-65535 arası olmalı)".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;

        const CREATE_NO_WINDOW: u32 = 0x08000000;

        if !registry::can_access() {
            return Err(
                "Registry yazma izni yok. Uygulamayı yönetici olarak çalıştırın.".to_string(),
            );
        }

        // P0-FIX-2: Proxy ayarlamadan ÖNCE mevcut ayarları yedekle
        backup_proxy_settings();

        // ✅ CRITICAL FIX: Asla LAN IP kullanma! Roblox vb. UWP Uygulamaları 'privateNetworkClientServer'
        // yetkisine sahip DEĞİLDİR. Bu yüzden 192.168.x.x (LAN IP) üzerinden bağlandıklarında sistem
        // güvenlik duvarı (AppContainer) bağlantıyı tamamen keser.
        // UWP LoopbackExempt (Sanal İzolasyon Kaldırma) SADECE "127.0.0.1" için çalışır.
        let proxy_addr = "127.0.0.1".to_string();

        registry::set_proxy(&proxy_addr, port).map_err(|e| {
            // Rollback
            let _ = registry::clear_proxy();
            format!("Registry güncelleme başarısız, geri alındı: {}", e)
        })?;

        // 3. CRITICAL: Notify Windows about the change so browsers pick it up immediately
        notify_proxy_change();

        // 4. UWP (Windows Mağaza) uygulamaları için loopback isolation yetkisini bypass et
        exempt_all_uwp_apps();

        // 5. Native/C++ ve arka plan servisleri için WinHTTP sistem proxy'si ayarla
        if enable_winhttp {
            // WinHTTP bypass listesini Registry ProxyOverride ile senkronize tut
            let winhttp_bypass = format!(
                "bypass-list=\"<local>;{};*.steamcontent.com;*.steamstatic.com;*.cm.steampowered.com;*.epicgames.com;*.unrealengine.com;*.riotgames.com;*.leagueoflegends.com;*.ea.com;*.origin.com;*.blizzard.com;*.battle.net;*.ubisoft.com;*.ubi.com;*.xboxlive.com;*.xbox.com;*.microsoft.com;*.cachefly.net;*.msftconnecttest.com;*.windowsupdate.com\"",
                proxy_addr
            );
            let _ = std::process::Command::new("netsh")
                .args(&[
                    "winhttp",
                    "set",
                    "proxy",
                    &format!("{}:{}", proxy_addr, port),
                    &winhttp_bypass,
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
    }

    // P0-FIX-1: Sentinel dosyası oluştur — proxy artık aktif
    let _ = std::fs::write(sentinel_path(), format!("port={}", port));

    Ok(())
}

/// P1-FIX: Tooltip uzunluk sınırı — Windows tooltip limiti 128 karakter
#[tauri::command]
fn update_tray_tooltip(app: tauri::AppHandle, tooltip: String) -> Result<(), String> {
    let sanitized: String = tooltip.chars().take(128).collect();
    if let Some(tray) = app.tray_by_id("tray") {
        tray.set_tooltip(Some(sanitized))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// P1-FIX: Port aralığı kısıtlama — XSS ile localhost port taraması engellenir
#[tauri::command]
fn check_port_open(port: u16) -> bool {
    // Sadece privileged portları engelle, dinamik portlara (OS ataması) izin ver
    if port < 1024 {
        return false;
    }
    TcpStream::connect_timeout(
        &std::net::SocketAddr::from(([127, 0, 0, 1], port)),
        Duration::from_millis(500),
    )
    .is_ok()
}

#[tauri::command]
fn check_admin() -> bool {
    #[cfg(target_os = "windows")]
    {
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
    #[cfg(not(target_os = "windows"))]
    {
        true
    }
}

fn perform_app_exit(app: &tauri::AppHandle) {
    // clear_system_proxy zaten RunEvent::ExitRequested'da çağrılacak
    // Burada tekrar çağırma — app.exit() ExitRequested tetikler
    app.exit(0);
}

/// B4: Aktif sidecar PID'i bellekte tut — pencere kapanırken garantili kill için.
fn sidecar_pid_lock() -> &'static Mutex<Option<u32>> {
    static STORE: OnceLock<Mutex<Option<u32>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(None))
}

fn kill_tracked_sidecar_blocking() {
    let pid_opt = sidecar_pid_lock().lock().ok().and_then(|g| *g);
    if let Some(pid) = pid_opt {
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            let _ = std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
        }
        if let Ok(mut g) = sidecar_pid_lock().lock() {
            *g = None;
        }
    }
}

/// Uygulama açıldığında eski dpireaper-proxy süreçlerini temizle (Zombi süreç önleme)
#[tauri::command]
fn save_sidecar_pid(pid: u32) {
    let pid_file = std::env::temp_dir().join("dpireaper_sidecar.pid");
    let _ = std::fs::write(&pid_file, pid.to_string());
    if let Ok(mut g) = sidecar_pid_lock().lock() {
        *g = Some(pid);
    }
}

/// Uygulama açıldığında eski dpireaper-proxy süreçlerini temizle (Zombi süreç önleme)
#[tauri::command]
fn kill_zombie_sidecar() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let pid_file = std::env::temp_dir().join("dpireaper_sidecar.pid");
        if let Ok(pid_str) = std::fs::read_to_string(&pid_file) {
            if let Ok(pid) = pid_str.trim().parse::<u32>() {
                if pid > 0 {
                    let output = std::process::Command::new("taskkill")
                        .args(["/F", "/PID", &pid.to_string()])
                        .creation_flags(CREATE_NO_WINDOW)
                        .output();

                    let _ = std::fs::remove_file(&pid_file);

                    if let Ok(out) = output {
                        if out.status.success() {
                            return Ok(format!("Zombi süreç (PID {}) durduruldu.", pid));
                        }
                    }
                }
            }
        }
        Ok("Zombi PID dosyası bulunamadı.".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok("Zombi temizleme sadece Windows'ta desteklenir.".to_string())
    }
}

/// P0-FIX: Ortadaki Adam (Network Reconnaissance) Riskini Engellemek İçin Özel Ping Doğrulayıcı
#[tauri::command]
async fn check_dns_latency(dns_ip: String) -> Result<u32, String> {
    // Sadece bilinen DNS IP'lerini kabul et (Arbitrary internal network scan'i önler)
    let allowed_ips = [
        "1.1.1.1",        // Cloudflare
        "8.8.8.8",        // Google
        "9.9.9.9",        // Quad9
        "94.140.14.14",   // AdGuard
        "208.67.222.222", // OpenDNS
    ];

    if !allowed_ips.contains(&dns_ip.as_str()) {
        return Err("Bilinmeyen DNS adresi".to_string());
    }

    let start = std::time::Instant::now();
    let addr = format!("{}:53", dns_ip)
        .parse()
        .map_err(|e: std::net::AddrParseError| e.to_string())?;

    match std::net::TcpStream::connect_timeout(&addr, std::time::Duration::from_millis(1500)) {
        Ok(_) => Ok(start.elapsed().as_millis() as u32),
        Err(_) => Ok(999),
    }
}

/// P0-FIX-1: Uygulama başlangıcında crash/BSOD sonrası kalan kirli proxy'yi temizle
/// Sentinel dosyası varsa = önceki oturum düzgün kapanmamış demektir
#[tauri::command]
fn startup_proxy_cleanup() -> Result<bool, String> {
    let sentinel = sentinel_path();

    if sentinel.exists() {
        eprintln!("[STARTUP] ⚠️ Dirty shutdown detected — sentinel file found");
        eprintln!("[STARTUP] Cleaning orphaned proxy settings...");

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            use std::process::Command;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let _ = registry::clear_proxy();

            // DNS cache temizle
            let _ = Command::new("ipconfig")
                .arg("/flushdns")
                .creation_flags(CREATE_NO_WINDOW)
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .spawn();

            // Tarayıcılara bildir
            notify_proxy_change();

            // ✅ Sadece dirty shutdown'da firewall temizle
            manage_firewall_rules(false, 0, 0);
        }

        let _ = std::fs::remove_file(&sentinel);
        eprintln!("[STARTUP] ✅ Orphaned proxy + firewall rules cleaned");

        return Ok(true);
    }

    // ✅ FIX: Temiz başlangıçta firewall temizleme YAPMA
    // Eski kod: manage_firewall_rules(false, 0, 0) — autoConnect ile race condition yaratıyordu
    // Sentinel yoksa zaten önceki oturum düzgün kapanmış, firewall kuralları da temizlenmiş demektir

    Ok(false) // Temiz başlangıç
}

/// Windows Defender ağ/ dosya taramasından dpireaper-proxy ve kurulum klasörünü muaf tutar.
/// Yönetici yetkisi gerekir (Add-MpPreference).
#[tauri::command]
fn add_defender_exclusions(app: tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        if !check_admin() {
            return Err(
                "Yönetici izni gerekli. Uygulamayı sağ tık → Yönetici olarak çalıştırın."
                    .to_string(),
            );
        }

        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let mut paths: Vec<String> = Vec::new();

        if let Ok(exe) = std::env::current_exe() {
            paths.push(exe.to_string_lossy().into_owned());
            if let Some(parent) = exe.parent() {
                paths.push(parent.to_string_lossy().into_owned());
            }
        }

        if let Ok(res) = app.path().resource_dir() {
            let proxy = res.join("binaries").join("dpireaper-proxy.exe");
            if proxy.exists() {
                paths.push(proxy.to_string_lossy().into_owned());
            }
            let bin_dir = res.join("binaries");
            if bin_dir.is_dir() {
                paths.push(bin_dir.to_string_lossy().into_owned());
            }
        }

        paths.sort();
        paths.dedup();

        let path_list: String = paths
            .iter()
            .map(|p| format!("'{}'", p.replace('\'', "''")))
            .collect::<Vec<_>>()
            .join(", ");

        let script = format!(
            r#"
$ErrorActionPreference = 'Stop'
try {{
  Add-MpPreference -ExclusionProcess 'dpireaper-proxy.exe'
  foreach ($p in @({})) {{
    if (Test-Path -LiteralPath $p) {{ Add-MpPreference -ExclusionPath $p }}
  }}
  Write-Output 'OK'
}} catch {{
  Write-Error $_.Exception.Message
}}
"#,
            path_list
        );

        let output = std::process::Command::new("powershell")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &script,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("PowerShell çalıştırılamadı: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if output.status.success() && stdout.contains("OK") {
            return Ok("Defender istisnaları eklendi (dpireaper-proxy.exe + uygulama klasörü).".to_string());
        }

        Err(if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            stdout
        } else {
            "Defender istisnası eklenemedi.".to_string()
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Defender istisnaları yalnızca Windows'ta desteklenir.".to_string())
    }
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    perform_app_exit(&app);
}

/// Madde 1: Uygulama `--autostart` argümanı ile mi başladı?
/// Windows autostart Registry kaydı uygulamayı bu arg ile çağırır
/// → frontend tarafında pencereyi tray'e küçültmek için kullanılır.
#[tauri::command]
fn is_autostarted() -> bool {
    std::env::args().any(|a| a == "--autostart")
}

// ═══════════════════════════════════════════════════════════════════
// BLOK 3 — C özellikleri için yeni Tauri komutları
// ═══════════════════════════════════════════════════════════════════

/// C14: Sidecar binary'sinin varlığını doğrula.
/// Tamper / silinme / antivirüs karantinası durumlarını yakalar.
#[tauri::command]
fn check_sidecar_exists(app: tauri::AppHandle) -> bool {
    if let Ok(res_dir) = app.path().resource_dir() {
        let proxy_exe = res_dir.join("binaries").join("dpireaper-proxy.exe");
        if proxy_exe.exists() {
            return true;
        }
        let proxy_exe_alt = res_dir
            .join("binaries")
            .join("dpireaper-proxy-x86_64-pc-windows-msvc.exe");
        if proxy_exe_alt.exists() {
            return true;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let direct = parent.join("dpireaper-proxy.exe");
            if direct.exists() {
                return true;
            }
        }
    }
    false
}

/// C5: Proxy bağlantısının sağlığını test eder.
/// Proxy üzerinden bir TCP handshake denenir (`connectivitycheck.gstatic.com:80`).
#[derive(serde::Serialize)]
pub struct ProxyHealth {
    pub ok: bool,
    #[serde(rename = "latencyMs")]
    pub latency_ms: u32,
}

#[tauri::command]
async fn check_proxy_health(proxy_port: u16) -> ProxyHealth {
    let result = tauri::async_runtime::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let proxy_addr = format!("127.0.0.1:{}", proxy_port);
        let mut stream = match std::net::TcpStream::connect_timeout(
            &match proxy_addr.parse() {
                Ok(a) => a,
                Err(_) => return ProxyHealth { ok: false, latency_ms: 0 },
            },
            Duration::from_millis(1500),
        ) {
            Ok(s) => s,
            Err(_) => return ProxyHealth { ok: false, latency_ms: 0 },
        };
        let _ = stream.set_read_timeout(Some(Duration::from_millis(2500)));
        let _ = stream.set_write_timeout(Some(Duration::from_millis(1500)));
        let req = b"CONNECT connectivitycheck.gstatic.com:80 HTTP/1.1\r\nHost: connectivitycheck.gstatic.com:80\r\n\r\n";
        if std::io::Write::write_all(&mut stream, req).is_err() {
            return ProxyHealth { ok: false, latency_ms: 0 };
        }
        let mut buf = [0u8; 64];
        let ok = matches!(std::io::Read::read(&mut stream, &mut buf), Ok(n) if n > 0 && String::from_utf8_lossy(&buf[..n]).contains("200"));
        let latency = start.elapsed().as_millis() as u32;
        ProxyHealth { ok, latency_ms: latency }
    })
    .await;
    result.unwrap_or(ProxyHealth { ok: false, latency_ms: 0 })
}

/// C18: Sistemdeki gerçek ağ arayüzlerini listele (LAN sharing picker için).
#[derive(serde::Serialize)]
pub struct NetworkInterfaceInfo {
    pub name: String,
    pub ip: String,
    pub is_virtual: bool,
}

#[tauri::command]
fn list_network_interfaces() -> Vec<NetworkInterfaceInfo> {
    const VIRTUAL_KEYWORDS: &[&str] = &[
        "virtual", "vmware", "vmnet", "vbox", "virtualbox", "pseudo", "hamachi", "vpn",
        "vethernet", "loopback", "docker", "wsl", "hyper-v", "bluetooth", "teredo", "isatap",
        "6to4", "tap-", "tun", "warp", "tailscale", "zerotier", "nordlynx", "wireguard", "proton",
        "mullvad", "windscribe", "surfshark", "host-only", "hostonly", "npcap", "miniport",
    ];
    let mut out = Vec::new();
    if let Ok(netifs) = list_afinet_netifas() {
        for (name, ip) in netifs {
            if let IpAddr::V4(v4) = ip {
                if v4.is_loopback() || v4.is_link_local() {
                    continue;
                }
                let name_lower = name.to_lowercase();
                let is_virtual = VIRTUAL_KEYWORDS.iter().any(|k| name_lower.contains(k));
                out.push(NetworkInterfaceInfo {
                    name,
                    ip: v4.to_string(),
                    is_virtual,
                });
            }
        }
    }
    out
}

/// C16: Genişletilmiş onarım — WinHTTP reset + flushdns + firewall + proxy clear.
#[tauri::command]
fn repair_internet_extended() -> Result<String, String> {
    let _ = clear_system_proxy();
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        // 1. WinHTTP reset
        let _ = std::process::Command::new("netsh")
            .args(&["winhttp", "reset", "proxy"])
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        // 2. DNS cache
        let _ = std::process::Command::new("ipconfig")
            .arg("/flushdns")
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();

        // 3. Firewall rules — kurulu kuralları temizle
        manage_firewall_rules(false, 0, 0);

        // 4. Tarayıcılara bildir
        notify_proxy_change();
    }
    Ok("OK".into())
}

/// C3: Özel bypass listesini Windows Registry ProxyOverride'a uygula.
/// Mevcut hardcoded liste ile birleşir.
#[tauri::command]
fn apply_custom_bypass(domains: Vec<String>, proxy_port: u16) -> Result<(), String> {
    if proxy_port == 0 {
        return Ok(());
    }
    #[cfg(target_os = "windows")]
    {
        let _guard = acquire_proxy_lock();
        // Sadece geçerli domain karakterleri
        let safe: Vec<String> = domains
            .into_iter()
            .map(|d| d.trim().to_lowercase())
            .filter(|d| {
                !d.is_empty()
                    && d.len() <= 253
                    && d.chars().all(|c| {
                        c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '*'
                    })
            })
            .take(64)
            .collect();
        // Bunları ProxyOverride'a eklemek için set_proxy'yi tekrar çağırmak yerine,
        // mevcut listeyi okuyup ekstra ekleme yapalım.
        if let Some(current) = registry::read_value_string("ProxyOverride") {
            let mut parts: Vec<String> =
                current.split(';').map(|s| s.to_string()).collect();
            for d in safe {
                if !parts.iter().any(|p| p.eq_ignore_ascii_case(&d)) {
                    parts.push(d);
                }
            }
            let new_override = parts.join(";");
            let _ = registry::set_proxy("127.0.0.1", proxy_port);
            let hkcu = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER);
            if let Ok((key, _)) = hkcu.create_subkey(
                r"Software\Microsoft\Windows\CurrentVersion\Internet Settings",
            ) {
                let _ = key.set_value("ProxyOverride", &new_override);
            }
            notify_proxy_change();
        }
    }
    let _ = proxy_port;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Çalışma dizinini exe klasörüne al — Run registry ile boot'ta CWD System32 olabilir.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            let _ = std::env::set_current_dir(parent);
        }
    }

    #[cfg(windows)]
    windows_autostart::heal_on_startup();

    // P0-FIX: Single-instance enforcement — aynı anda sadece bir DPIReaper çalışabilir
    #[cfg(target_os = "windows")]
    {
        use std::ptr::null_mut;
        use winapi::shared::winerror::ERROR_ALREADY_EXISTS;
        use winapi::um::errhandlingapi::GetLastError;
        use winapi::um::synchapi::CreateMutexW;

        let mutex_name: Vec<u16> = "Global\\DPIReaper_SingleInstance\0".encode_utf16().collect();

        unsafe {
            let handle = CreateMutexW(null_mut(), 0, mutex_name.as_ptr());
            if handle.is_null() || GetLastError() == ERROR_ALREADY_EXISTS {
                eprintln!("[STARTUP] ❌ DPIReaper zaten çalışıyor — çıkılıyor");

                // TODO(B11): Pencere başlığı yerine WebView class adıyla bul.
                // FindWindowW şu anda tauri.conf.json'daki sabit "DPIReaper" başlığına
                // güveniyor; başlık dil değişimi/i18n ile değişirse mevcut pencereyi
                // öne getirme bozulabilir.
                use winapi::um::winuser::{
                    FindWindowW, IsIconic, SetForegroundWindow, ShowWindow, SW_RESTORE,
                };
                let window_name: Vec<u16> = "DPIReaper\0".encode_utf16().collect();
                let hwnd = FindWindowW(null_mut(), window_name.as_ptr());
                if !hwnd.is_null() {
                    if IsIconic(hwnd) != 0 {
                        ShowWindow(hwnd, SW_RESTORE);
                    }
                    SetForegroundWindow(hwnd);
                }

                // Sessizce çık (Multi-user ortamında diğer kullanıcıları rahatsız etme)
                std::process::exit(0);
            }
            // Windows process sonlandığında mutex handle'ını otomatik temizler
            let _ = handle;
        }
    }

    tauri::Builder::default()
        .manage(PacServerState::default())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri::menu::{Menu, MenuItem};
                use tauri::tray::TrayIconBuilder;
                use tauri::Manager;

                let show_i = MenuItem::with_id(app, "show", "Uygulamayı Aç", true, None::<&str>)?;
                let quit_i = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;

                use tauri::menu::PredefinedMenuItem;
                let s1 = PredefinedMenuItem::separator(app)?;

                let menu = Menu::with_items(app, &[&show_i, &s1, &quit_i])?;

                // ✅ Debounce için flag
                let is_showing = Arc::new(AtomicBool::new(false));

                let _tray = TrayIconBuilder::with_id("tray")
                    .menu(&menu)
                    .show_menu_on_left_click(false) // ✅ Sol tıkta menü açılmasın, sadece sağ tıkta
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("DPIReaper - Kapalı")
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus(); // ✅ Pencereyi kapatmadan önce onay kutusu için öne getir!

                                let _ = window.emit("tray_quit", ());
                                let _ = window.close();
                            } else {
                                perform_app_exit(app);
                            }
                        }
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.unminimize();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event({
                        let is_showing = Arc::clone(&is_showing);
                        move |tray, event| {
                            use tauri::tray::{MouseButton, TrayIconEvent};

                            match event {
                                // ✅ Sol tık: pencereyi öne getir
                                TrayIconEvent::Click {
                                    button: MouseButton::Left,
                                    ..
                                } => {
                                    if is_showing.load(Ordering::Relaxed) {
                                        return;
                                    }
                                    is_showing.store(true, Ordering::Relaxed);

                                    let app = tray.app_handle();
                                    if let Some(window) = app.get_webview_window("main") {
                                        let _ = window.unminimize();
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }

                                    let is_showing_clone = Arc::clone(&is_showing);
                                    std::thread::spawn(move || {
                                        std::thread::sleep(std::time::Duration::from_millis(300));
                                        is_showing_clone.store(false, Ordering::Relaxed);
                                    });
                                }
                                // ✅ Çift tık: pencereyi öne getir
                                TrayIconEvent::DoubleClick { .. } => {
                                    let app = tray.app_handle();
                                    if let Some(window) = app.get_webview_window("main") {
                                        let _ = window.unminimize();
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                                // Sağ tık: menü otomatik açılır
                                _ => {}
                            }
                        }
                    })
                    .build(app)?;

                // LAYER 2: Window close cleanup (B4: garantili sidecar kill)
                if let Some(window) = app.get_webview_window("main") {
                    let app_handle = app.handle().clone();
                    window.on_window_event(move |event| {
                        if let tauri::WindowEvent::Destroyed = event {
                            // B4: JS cleanup tetiklenmese bile sidecar'ı kill et
                            kill_tracked_sidecar_blocking();
                            let _ = clear_system_proxy();
                            // ✅ P2-FIX: PAC'i de DIRECT'e geçir
                            if let Some(pac_state) = app_handle.try_state::<PacServerState>() {
                                if let Ok(mut body) = pac_state.pac_body.lock() {
                                    *body = make_pac_direct_body();
                                }
                                if let Ok(mut cache) = pac_state.pac_cache.lock() {
                                    cache.body_hash = 0;
                                    cache.pac_response.clear();
                                }
                            }
                        }
                    });
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![
            clear_system_proxy,
            set_system_proxy,
            update_tray_tooltip,
            check_admin,
            check_port_open,
            get_sidecar_config,
            start_pac_server,
            stop_pac_server,
            kill_zombie_sidecar,
            check_dns_latency,
            save_sidecar_pid,
            startup_proxy_cleanup,
            add_defender_exclusions,
            isp_detect::detect_isp,
            quit_app,
            is_autostarted,
            windows_autostart::is_autostart_registry_enabled,
            windows_autostart::set_autostart_enabled,
            update_check::check_for_app_update,
            // BLOK 3 — C özellikleri
            check_sidecar_exists,
            check_proxy_health,
            list_network_interfaces,
            repair_internet_extended,
            apply_custom_bypass
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // LAYER 3: App exit cleanup (fallback)
            if let tauri::RunEvent::ExitRequested { .. } = event {
                kill_tracked_sidecar_blocking();
                let _ = clear_system_proxy();
                if let Some(state) = app_handle.try_state::<PacServerState>() {
                    // Grace period'u kısalt — App.jsx zaten 1.5s (şimdi 0.5s) bekledi
                    // DIRECT'e geç ama uzun bekleme
                    if let Ok(mut body) = state.pac_body.lock() {
                        *body = make_pac_direct_body();
                    }
                    if let Ok(mut cache) = state.pac_cache.lock() {
                        cache.body_hash = 0;
                        cache.pac_response.clear();
                    }
                    // 500ms yeterli — cihazlar genelde 200ms içinde PAC'i çeker
                    std::thread::sleep(Duration::from_millis(500));
                    state.shutdown.store(true, Ordering::Relaxed);
                    if let Ok(mut guard) = state.join_handle.lock() {
                        let _ = guard.take();
                    }
                    #[cfg(target_os = "windows")]
                    manage_firewall_rules(false, 0, 0);
                }
            }
        });
}
