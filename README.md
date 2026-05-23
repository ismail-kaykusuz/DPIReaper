# DPIReaper

Windows için yerel proxy ve DPI bypass masaüstü uygulaması (Tauri + React).
Modern, minimalist arayüz ile kurumsal bir kullanıcı deneyimi.

## Hızlı bakış

- **Tek karar noktası:** Hızlı / Önerilen / Maksimum profili
- **Sade ayarlar:** Bağlantı · Uygulama · Gelişmiş (3 sekme)
- **Yerel DNS:** Cloudflare, Google, AdGuard, Quad9, OpenDNS (DoH desteği)
- **LAN paylaşımı:** Diğer cihazlar için PAC / manuel proxy
- **Düşük CPU modu:** Windows Defender uyumlu çalışma
- **Telemetri yok:** Veriler cihazda kalır

## Gereksinimler

- Node.js 18+
- Rust (MSVC)
- Visual Studio Build Tools (C++)
- Yönetici (admin) yetkisi (sistem proxy ayarı için)

## Geliştirme

```powershell
cd .
npm install
npm run dev:app
```

`dev:app` script'i: gerekiyorsa Go proxy'sini derler, MSVC ortamını yükler ve `tauri dev` başlatır. İlk Rust derlemesi 5–15 dk sürebilir.

### Logo / ikon güncelleme

Logoyu değiştirmek için yeni PNG'yi `images/DPIReaper.png` olarak kaydedip:

```powershell
npm run icons
npm run dev:app
```

`npm run icons` kırpma + Tauri ikon seti + proxy exe ikonunu yeniden üretir.

### Proxy motoru eksikse

```powershell
npm run build-proxy
```

`src-tauri/binaries/dpireaper-proxy-x86_64-pc-windows-msvc.exe` üretir.

## Üretim derlemesi

```powershell
npm run build           # Vite + ikon güncellemesi
npm run tauri build     # NSIS / MSI kurulum paketleri
```

Çıktı: `src-tauri/target/release/bundle/`.

## Kullanım

### Bağlantı profili (önerilen başlangıç)

İlk açılışta sihirbaz çıkar. Üç seçenek:

| Profil | Ne zaman? | Örnek ISS |
|--------|-----------|-----------|
| **Hızlı** | Yumuşak DPI, en yüksek hız | Türknet, küçük yerel ISP'ler |
| **Önerilen** | Çoğu kullanıcı için en uygun denge | Çoğu fiber bağlantı |
| **Maksimum** | Agresif DPI, CPU artabilir | Kablonet, Superonline, Türk Telekom, Vodafone, Millenicom |

Varsayılan: **Önerilen**. Sonradan **Ayarlar → Bağlantı**'tan değiştirebilirsiniz.

### DNS

**Ayarlar → Bağlantı → DNS** altında sağlayıcı seçimi veya otomatik (en hızlıyı bul).
DoH desteği için "Sistem Varsayılanı" kapatılır, sağlayıcı seçilir.

## Gelişmiş ayarlar

`Ayarlar → Gelişmiş` (varsayılan değerler çoğu durumda yeterlidir):

| Bölüm | Ayar | Ne işe yarar? |
|-------|------|----------------|
| **Gelişmiş Bypass** | Npcap sürücüsü | Maksimum profilde sahte paket enjeksiyonu (Kurulu değilse buradan kurulur) |
| **Düşük CPU** | Düşük CPU modu | Windows Defender taramasını azaltır, chunk ≥ 8 bayt |
| **Düşük CPU** | Defender dışlamaları | Yönetici izniyle Defender'a uygulama dışlaması ekler |
| **Gelişmiş Ağ** | IPv4 Zorla | Sonsuz yükleme/timeout sorunlarını önler |
| **Gelişmiş Ağ** | Oyun Modu (WinHTTP) | Masaüstü oyunları/arka plan servisleri için proxy yönlendirme |
| **Gelişmiş Ağ** | LAN Paylaşımı | Diğer cihazlar bu makineyi proxy olarak kullanabilir |
| **Bildirim Türleri** | Bağlantı / kesim | Bildirimleri tür bazında aç/kapa |
| **Sorun Giderme** | İnterneti Onar | Sistem proxy'sini temizler (bağlantı kapalıyken) |

### Yüksek CPU kullanımı (Antimalware Service Executable)

Derleme veya proxy çalışırken Windows Defender taramasından kaynaklanır. **Yönetici PowerShell**'de:

```powershell
Add-MpPreference -ExclusionPath "C:\Users\<user>\Desktop\DPIReaper"
Add-MpPreference -ExclusionPath "$env:USERPROFILE\.cargo"
```

veya **Ayarlar → Gelişmiş → Düşük CPU → "Defender dışlamalarını ekle"** butonu.

## Proje yapısı

```
src/
  App.jsx                  Ana ekran, ilk açılış sihirbazı, log paneli
  Settings.jsx             Ayarlar (Bağlantı / Uygulama / Gelişmiş)
  profiles.js              Profil tanımları + engine argüman üretici
  constants.js, i18n.js    Sabitler, TR/EN çevirileri
src-tauri/
  src/lib.rs               Tauri komutları (proxy, Defender, tray, vb.)
  binaries/                dpireaper-proxy (SpoofDPI fork) sidecar
  icons/                   Uygulama ikonları (npm run icons üretir)
scripts/
  build-proxy.cjs          Go proxy motoru derleyici
  prepare-logo.mjs         Logo kırpma + ikon üretimi
  generate-app-icons.mjs   Tauri + proxy ikon orchestrator
plan.md                    Faz 1-4 ürün geliştirme planı
```

## Lisans

MIT — bkz. [`LICENSE`](LICENSE)

## Gizlilik

DPIReaper hiçbir telemetri veya kullanım verisi göndermez. Tüm yapılandırma yerel `localStorage` ve `src-tauri` config dosyalarında tutulur.
