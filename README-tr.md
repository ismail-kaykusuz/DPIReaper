<p align="center">
  <img src="images/DPIReaper.png" width="140" alt="DPIReaper Logo">
</p>

<h1 align="center">DPIReaper</h1>

<p align="center">
  <b>Rust (Tauri 2) ve React 19 üzerine kurulu modern bir Windows yerel proxy ve DPI bypass aracı — kararlı, telemetri içermeyen, Fluent tarzı arayüzle.</b>
</p>

<p align="center">
  <a href="https://github.com/ismail-kaykusuz/DPIReaper/releases/latest">
    <img alt="İndir" src="https://img.shields.io/badge/%E2%AC%87%20%C4%B0ndir-DPIReaper-107C10?style=for-the-badge&logo=windows&logoColor=white">
  </a>
  <a href="https://github.com/ismail-kaykusuz/DPIReaper/releases">
    <img alt="Son Sürüm" src="https://img.shields.io/github/v/release/ismail-kaykusuz/DPIReaper?style=for-the-badge&label=S%C3%BCr%C3%BCm&logo=github&logoColor=white&color=0078D4">
  </a>
  <a href="LICENSE">
    <img alt="Lisans" src="https://img.shields.io/badge/Lisans-MIT-yellow?style=for-the-badge">
  </a>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-blue.svg">
  <img alt="Mimari" src="https://img.shields.io/badge/Mimari-x64-green.svg">
  <img alt="Stack" src="https://img.shields.io/badge/Stack-Rust%20%2B%20React%2019-orange.svg">
  <img alt="Telemetri" src="https://img.shields.io/badge/Telemetri-Yok-success.svg">
  <a href="README.md"><img alt="English README" src="https://img.shields.io/badge/lang-English-blue.svg"></a>
</p>

---

## Tanıtım Videosu

https://github.com/user-attachments/assets/b6003e7e-43ff-4f26-b6ae-1c5299916569

> Yedek (release CDN): [DPIReaper-intro.mp4](https://github.com/ismail-kaykusuz/DPIReaper/releases/download/v1.0.0/DPIReaper-intro.mp4)

<p align="center">
  <i>DPIReaper ücretsiz ve öyle kalacak. Faydasını gördüyseniz <b>Patreon</b>'da bir kahve geliştirmeyi yaşatır — detay için aşağıdaki <a href="#projeyi-destekle">Projeyi Destekle</a>.</i><br><br>
  <a href="https://www.patreon.com/16093117/join">
    <img alt="Patreon'da Destek Ol" src="https://img.shields.io/badge/Destek%20Ol-Patreon-F96854?style=for-the-badge&logo=patreon&logoColor=white">
  </a>
</p>

---

## İçindekiler

- [DPIReaper Nedir?](#dpireaper-nedir)
- [Neden DPIReaper?](#neden-dpireaper)
- [Özellikler](#özellikler)
- [3 Kademeli Bypass Motoru](#3-kademeli-bypass-motoru)
- [LAN Paylaşımı (PAC Sunucusu)](#lan-paylaşımı-pac-sunucusu)
- [Mimari ve Güvenlik](#mimari-ve-güvenlik)
- [Sistem Gereksinimleri](#sistem-gereksinimleri)
- [Kurulum](#kurulum)
- [Hızlı Başlangıç](#hızlı-başlangıç)
- [Projeyi Destekle](#projeyi-destekle)
- [Kaynak Koddan Derleme](#kaynak-koddan-derleme)
- [Gizlilik ve Telemetri](#gizlilik-ve-telemetri)
- [Yasal Bildirim](#yasal-bildirim)
- [Teşekkürler](#teşekkürler)
- [Lisans](#lisans)

---

## DPIReaper Nedir?

DPIReaper, **Windows 10 / 11** üzerinde `127.0.0.1` adresinde küçük bir yerel HTTPS proxy çalıştıran ve giden bağlantılara *TLS düzeyinde parçalama (fragmentation)* uygulayarak yoldaki Derin Paket İnceleme (DPI) sistemlerinin ClientHello SNI alanını engel listeleriyle eşleştirmesini önleyen bir masaüstü uygulamasıdır.

`GoodbyeDPI` veya `green-tunnel` gibi terminal tabanlı araçların ruhani halefidir, ama tamamen **Rust (Tauri 2)** üzerine yeniden inşa edilmiştir:

- Sistem-proxy ayarlarını kendi kendine onaran sentinel + yedekleme sistemi (çökme sonrası "internet gitti" sorununu çözer).
- LAN üzerinde canlı PAC sunucusu — telefon, tablet ve konsollar QR kod okutarak aynı tünelden geçer.
- 12 dilde yerelleştirilmiş Fluent arayüz, tek instance, sistem tepsisi entegrasyonu.
- Telemetri yok, uzak sunucu yok, hesap yok.

DPIReaper, Go tabanlı bir DPI motorunu (`dpireaper-proxy`, SpoofDPI projesi temelli) sidecar binary olarak paketler — bağlanılacak harici bir servis yoktur. **Tüm trafik sizinle hedefiniz arasında kalır.**

---

## Neden DPIReaper?

Hafif bypass araçlarının çoğunda iki tekrarlayan sorun vardır:

1. **Çökünce internetinizi kırarlar.** Yardımcı process anormal şekilde çıktığında (BSOD, elektrik kesintisi, görev sonlandırma) Windows sistem-proxy registry anahtarları ölü bir local porta işaret etmeye devam eder ve kullanıcı internetsiz kalır.
2. **Arkaplanda güvenle çalıştırılamazlar.** Konsol tabanlı araçlar her işlem için `cmd.exe` / `powershell.exe` çağırır; bu Defender sezgilerini tetikler ve gürültülü bir denetim izi bırakır.

DPIReaper ikisini de çözer:

| Sorun | DPIReaper çözümü |
|---|---|
| Çökme sonrası kayıp proxy | **Sentinel dosyası + atomik registry yedeği** — uygulama yeniden açılınca *kirli* kapanışı algılar ve sistem-proxy ayarlarını DPIReaper öncesi haline döndürür. |
| Konsol process gürültüsü | Tüm sistem çağrıları **native Rust `winapi` / `winreg`** crate'leri ile yapılır. PowerShell yok, `cmd /c` yok. |
| Çoklu instance | **Single-instance** zorlaması global Mutex ile; uygulama tepside açıkken çift-tıklamada yeni instance açılmaz. |
| LAN cihaz sıkıntısı | Asenkron PAC sunucusu (8787+) + **QR kod ile cihaz eşleme** ve yerelleştirilmiş kurulum sayfası. |
| Defender uyarıları | İsteğe bağlı, **kullanıcı onayıyla** Defender exclusion (sadece Network Inspection kapsamında). |

---

## Özellikler

- **Sistem geneli proxy yönetimi** — `Software\Microsoft\Windows\CurrentVersion\Internet Settings` otomatik ayarlanır; Chrome, Edge, Discord, Spotify, Steam, Roblox ve çoğu Win32/UWP uygulaması ek yapılandırma olmadan devralır.
- **3 kademeli DPI motoru** — *Hızlı* (SNI split), *Önerilen* (chunk split), *Maksimum* (chunk + disorder). Yeniden bağlanmadan canlı geçilebilir.
- **DNS over HTTPS (DoH)** — Cloudflare, Google, AdGuard, Quad9, OpenDNS ve *sistem DNS* fallback.
- **Yalnız IPv4 modu** — çift yığın ağlarında bir sınıf sızıntı vektörünü kapatır.
- **LAN paylaşımı** — bilgisayarınızı PAC URL veya QR ile telefon/tablet için DPI'siz bir geçit yapar.
- **Uygulama bazlı bypass listesi** — kullanıcının düzenleyebildiği domain listesi *direkt* gider (oyunlar gibi gecikme istemediğiniz yerler için).
- **Bağlantı sağlığı göstergesi** — ana ekranda canlı ping pulse.
- **Canlı log monitörü** — 100 satırlık halka tampon, kopyala / temizle / INFO·WARN·ERROR filtresi.
- **Windows ile otomatik başlat** (isteğe bağlı).
- **Tepside gizli başlat** (isteğe bağlı).
- **12 dil** — Türkçe, İngilizce, Almanca, Fransızca, İspanyolca, İtalyanca, Portekizce, Rusça, Arapça, Çince, Japonca, Korece.
- **Modern Fluent UI** — sabit 380×700 pencere, koyu tema, Inter font, framer-motion micro-animasyonlar.
- **Sıfır telemetri, sıfır hesap, tamamen offline çalışabilir.**

---

## 3 Kademeli Bypass Motoru

Go sidecar (`dpireaper-proxy`) üç çalışma modu sunar. UI bunları üç dosta düzeye eşler:

| Kademe | Mod | Motor argümanları | Ne zaman |
|:---:|:---:|---|---|
| **Hızlı** | `0` | `--https-split-mode sni` | Hafif filtreleme; minimum gecikme. Oyun ve sesli sohbet için. |
| **Önerilen** | `1` | `--https-split-mode chunk --https-chunk-size 2` | Türkiye ISS'leri ve şirket DPI'larının çoğu. Varsayılan. |
| **Maksimum** | `2` | `--https-split-mode chunk --https-chunk-size 1` | Katı middlebox ve sağlayıcı düzeyi engeller. |

İleri kullanıcılar **Ayarlar → Gelişmiş** menüsünden chunk boyutunu (1 / 2 / 4 bayt) elle değiştirebilir.

---

## LAN Paylaşımı (PAC Sunucusu)

DPIReaper, `8787–8887` aralığındaki ilk boş portta küçük bir HTTP sunucusu açar. Uç noktalar:

| Yol | Döndürür |
|---|---|
| `/` | Yerelleştirilmiş kurulum sayfası (PAC sekmesi + Manuel proxy sekmesi, adım adım). Dil `?lang=xx` ile zorlanabilir. |
| `/proxy.pac` · `/wpad.dat` | Otomatik yapılandırma scripti. DPIReaper kapalıyken Direct mod döner — cihaz internet kaybetmez. |
| `/logo` | 128×128 uygulama ikonu (kurulum sayfasının başlığı için). |

Sertleştirme:

- Yalnızca LAN paylaşımı ayardan etkinleştirildiyse `0.0.0.0` adresine bind olur.
- Eş zamanlı bağlantı semaforu **50** ile sınırlıdır (açık Wi-Fi'da DoS koruması).
- Her stream için 2 sn okuma/yazma timeout'u.

Telefon eşlemek tek dokunuş: *Diğer Cihazları Bağla* panelinden QR'ı tarat → kurulum sayfası cihazın dilinde açılır → PAC adresinin yanındaki kopyala ikonuna dokun → Wi-Fi proxy ayarlarına yapıştır.

---

## Mimari ve Güvenlik

DPIReaper dört iş birlikli bileşenden oluşur:

```
+---------------------------------------------------------+
| React 19 UI  (380x700, dark, 12 locale)                 |
|   <-- Tauri 2 IPC -->                                   |
| Rust core   (lib.rs)                                    |
|   - Sistem-proxy registry yönetimi (winreg)             |
|   - Sentinel + backup/restore                           |
|   - PAC HTTP server (std::net, 50 cxn semafor)          |
|   - Tray / single-instance / autostart                  |
|   - Defender exclusion komutu                           |
|   - ISS heuristikleri (isp_detect.rs)                   |
|   <-- stdio sidecar -->                                 |
| dpireaper-proxy  (Go binary, SpoofDPI fork)             |
|   - HTTPS chunk / SNI split, DoH, DNS modları           |
+---------------------------------------------------------+
```

Güvenlik vurguları:

- **CSP** sıkı: `default-src 'self'`, `eval` yok, uzak script yok, frame yok, prototype donmuş.
- Capability allow-list (`src-tauri/capabilities/default.json`) yalnızca DPIReaper'ın gerçekten kullandığı komutları açar.
- HTML'e yerleştirilen tüm kullanıcı stringleri **DOMPurify**'dan geçer.
- Release binary'ler `opt-level = "z"`, `lto = true`, `codegen-units = 1`, `strip = true` ile derlenir — küçük, debug sembolü yok.
- Defender exclusion komutu **asla** açık kullanıcı onayı olmadan çalışmaz (ilk açılışta modal).
- DPIReaper'ın kendi yaptığı tek ağ trafiği: (a) seçtiğiniz DoH resolver, (b) yerel proxy üzerinden sizin hedefiniz, (c) GitHub / Discord / Patreon linklerine **siz** tıkladığınızda varsayılan tarayıcıda açma.

---

## Sistem Gereksinimleri

- **İşletim sistemi**: Windows 10 (1809+) veya Windows 11, 64-bit
- **Mimari**: x86_64
- **RAM**: ~80 MB resident (WebView2)
- **Yetki**: Yönetici önerilir (sistem-proxy registry yazımı ve onay verilirse Defender exclusion için). Yönetici olmadan da kişisel hesap proxy'si için çalışır.

---

## Kurulum

1. [**Releases**](https://github.com/ismail-kaykusuz/DPIReaper/releases) sayfasına gidin.
2. İndirin:
   - `DPIReaper_1.0.0_x64-setup.exe` (NSIS — önerilen), veya
   - `DPIReaper_1.0.0_x64_en-US.msi` (Windows Installer).
3. Kurulumu çalıştırın. **Ek sürücüye gerek yok** (WinPcap / Npcap / WinDivert kullanılmaz).
4. DPIReaper'ı açın. İlk açılışta:
   - Tek seferlik dil seçici,
   - Defender exclusion onayı (reddedebilirsiniz; her şey yine çalışır).

---

## Hızlı Başlangıç

1. DPIReaper'ı açın.
2. **Ayarlar → Bağlantı** sekmesinde profil seçin (veya varsayılan *Önerilen* kalsın).
3. Ana ekrandaki büyük bağlan düğmesine tıklayın.
4. Durum etiketi yeşile döner ve **Güvenli Bağlantı** yazar — hazırsınız.
5. Telefon eşlemek için **Diğer Cihazları Bağla** ekranını açın ve QR kodu telefonunuzla okutun.

Normal bağlantınıza geri dönmek için aynı düğmeye tekrar tıklayın — DPIReaper proxy durumunu atomik olarak eski haline döndürür.

---

## Projeyi Destekle

DPIReaper boş zamanda geliştirilir; ücretsiz, açık kaynak ve reklamsız kalmıştır. Uygulamada hiçbir özellik ödeme duvarının arkasında değildir — bu kademeler tamamen birer teşekkürdür. DPIReaper sayenize bir ISS borç gecesi yaşamadıysanız bir sonraki sürüme destek olabilirsiniz:

### Patreon

<p>
  <a href="https://www.patreon.com/16093117/join">
    <img alt="Patreon" src="https://img.shields.io/badge/Patreon-DPIReaper-F96854?style=for-the-badge&logo=patreon&logoColor=white">
  </a>
</p>

### Kripto

<table>
<tr>
  <td align="center" width="50%">
    <b>BNB Smart Chain · BEP-20</b><br>
    <img src="images/qrcode-BNB%20Smart%20Chain%20(BEP20).png" width="200" alt="BNB BEP20 QR"><br>
    <code>0xc770595148f893cd9c29b810391c177d289819ae</code>
  </td>
  <td align="center" width="50%">
    <b>Tron · TRC-20 (yalnızca USDT)</b><br>
    <img src="images/qrcode-Tron%20(TRC20).png" width="200" alt="Tron TRC20 QR"><br>
    <code>TKCCjWyzUNzbUhcPBiNm3g8TkUYA8FfvMA</code>
  </td>
</tr>
</table>

> [!WARNING]
> Tron (TRC-20) adresine **yalnızca USDT** gönderin. Başka bir coin/token göndermek kalıcı kayba neden olur.

---

## Kaynak Koddan Derleme

Önkoşullar:

- Node.js 18+
- Rust toolchain (`stable-x86_64-pc-windows-msvc`)
- Visual Studio 2022 Build Tools + *Desktop development with C++* iş yükü (`msvcrt.lib`, `link.exe`)
- Go 1.22+ (yalnızca proxy sidecar'ı yeniden derlerseniz)

Komutlar:

```powershell
git clone https://github.com/ismail-kaykusuz/DPIReaper.git
cd DPIReaper
npm install

# Geliştirme (UI hot-reload, Rust debug)
npm run dev:app

# Üretim kurulum (.exe + .msi)
npm run build:app
```

Çıktılar:

```
src-tauri/target/release/bundle/nsis/DPIReaper_1.0.0_x64-setup.exe
src-tauri/target/release/bundle/msi/DPIReaper_1.0.0_x64_en-US.msi
```

---

## Gizlilik ve Telemetri

> [!IMPORTANT]
> **DPIReaper hiçbir şey toplamaz.** Analitik SDK yok, crash reporter yok, uzak log endpoint'i yok. Loglar 100 satırlık RAM tamponunda yaşar ve process çıkar çıkmaz silinir.
>
> DPIReaper'ın kendi başlattığı tek dış bağlantı:
>
> - Ayarlardan seçtiğiniz DoH resolver'ına yapılan sorgular,
> - PAC sunucusu (yalnızca LAN paylaşımı açıkken, LAN),
> - *Siz* tıkladığınızda GitHub / Discord / Patreon linkleri varsayılan tarayıcıda.
>
> Hedef trafiğiniz sizinle hedef arasında kalır — DPIReaper bir VPN değildir ve uzak tünel ucu yoktur.

---

## Yasal Bildirim

DPIReaper, MIT lisansı altında **"OLDUĞU GİBİ", hiçbir garanti verilmeksizin** sunulmaktadır (bkz. [`LICENSE`](LICENSE)).

1. **Amaç.** DPIReaper, TLS ClientHello fragmentation, PAC tabanlı proxy dağıtımı ve Windows sistem-proxy yaşam döngüsünü gösteren bir *ağ mühendisliği ve eğitim aracı* olarak yayımlanmıştır. Bir aşma servisi **değildir**, VPN **değildir** ve trafiği üçüncü taraf bir sunucu üzerinden taşımaz.
2. **Üçüncü taraf trafiği yakalanmaz.** Uygulama TLS için man-in-the-middle olmaz; yalnızca kullanıcının kendi makinesinde, kendi giden akışlarının **paket sınırlarını yeniden yazar**.
3. **Kullanım, yerel hukuka tabidir.** DPIReaper kullanımının size uygulanan kanunlara, mevzuata, hizmet şartlarına veya işyeri politikalarına aykırı olmamasını sağlamak **tamamen son kullanıcının sorumluluğundadır**. DPIReaper yazarları ve katkıda bulunanları, kötüye kullanımdan dolayı sorumluluk reddinde bulunur.
4. **Bankacılık / güvenlik garantisi yok.** DPIReaper uzak bir endpoint eklemediği için TLS zincirinize yeni bir güven tarafı katmaz. Ancak yazarlar **hiçbir güvenlik iddiasında bulunmaz**; hassas oturumlarınızın (bankacılık, sağlık, devlet) güvenliği için DPIReaper'a güvenmemelisiniz. Kullanım sorumluluğu kullanıcıya aittir.
5. **Ticari markalar.** "Discord", "Steam", "Roblox", "Windows", "Microsoft Defender" ve bu README'de geçen diğer ürün adları, ilgili sahiplerinin ticari markalarıdır. Burada anılmaları yalnızca açıklayıcıdır; DPIReaper tarafından veya DPIReaper'a yönelik herhangi bir onay **anlamına gelmez**.
6. **Uyumluluk.** DPIReaper'ı kendi kabul edilebilir kullanım veya proxy politikası olan bir kurum içinde çalıştırıyorsanız, önce ilgili izinleri almalısınız. Yazarlar, GitHub deposu üzerinden iletilen meşru takedown taleplerine yanıt verir.
7. **Açık kaynak.** Kaynak kodun tamamı bu depoda MIT lisansıyla erişilebilir; her release'i denetleyebilir, fork'layabilir ve kendiniz derleyebilirsiniz.

DPIReaper'ı indirerek, kurarak veya çalıştırarak **bu bildirimi tamamen okumuş ve kabul etmiş sayılırsınız**.

---

## Teşekkürler

- DPI motor sidecar'ı: açık kaynak [SpoofDPI](https://github.com/xvzc/SpoofDPI) projesinden türetilmiştir (Go).
- UI ikonları: [lucide-react](https://lucide.dev/).
- Çatı: [Tauri 2](https://tauri.app/), [React 19](https://react.dev/), [framer-motion](https://www.framer.com/motion/).

Hata bildiren ve UI çeviren herkese teşekkürler.

---

## Lisans

DPIReaper, **MIT Lisansı** altında yayımlanır. Tam metin için [`LICENSE`](LICENSE).

<br>
<p align="center"><sub>Açık, erişilebilir bir internet için özenle yapıldı.</sub></p>
