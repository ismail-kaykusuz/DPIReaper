# DPIReaper — Kullanım Kılavuzu

Modern, minimalist bir DPI bypass ve yerel proxy uygulaması (Windows · Tauri + React).
Tek karar noktalı arayüz, kurumsal görünüm, yerel veri, telemetri yok.

> Gerekli yetki: Uygulama sistem proxy ayarlarını değiştirdiği için **Yönetici (Administrator)** olarak çalıştırılmalıdır. Yönetici değilse açılışta uyarı ekranı gösterilir.

---

## 1. İlk açılış sihirbazı

Uygulamayı ilk açtığınızda (veya `localStorage` temizlendiğinde) tam ekran karşılama ekranı gelir.

| Öğe | Ne yapar |
|------|----------|
| **DR logosu + "Hoş geldiniz"** | Marka karşılaması |
| **Profil seçici (3 satır)** | Hızlı / Önerilen / Maksimum — varsayılan: **Önerilen** |
| **BAĞLAN** (kırmızı buton) | Seçilen profili kaydeder, sihirbazı kapatır, motoru başlatır |
| **Sonra karar ver** | Sihirbazı kapatır, bağlanmaz; ayarları manuel yapabilirsiniz |

Sihirbaz **bir kez** çıkar; `dpireaper_first_run_done` flag'i `localStorage`'a yazılır.

---

## 2. Ana ekran

### 2.1 Üst başlık (header)

| Öğe | Ne yapar |
|------|----------|
| **Logo (sol)** | DR markası |
| **DPIReaper** yazısı | Uygulama adı |
| **Durum rozeti (sağ)** | Üç durum: |
| └ **HAZIR** | Nötr — bağlı değil, hazır |
| └ **BAĞLANIYOR / KESİLİYOR** | İşlem sürüyor |
| └ **GÜVENLİ / AKTİF** | Kırmızı — bağlı |

### 2.2 Orta gövde

| Öğe | Ne yapar |
|------|----------|
| **Shield (kalkan) halkası** | Durum görseli: nötr (hazır), nötr breathe (işleniyor), kırmızı + kırmızı glow (bağlı) |
| **Durum başlığı (büyük yazı)** | "HAZIR" / "BAĞLANIYOR..." / "GÜVENLİ" — renk durumla uyumlu |
| **Durum açıklaması (küçük yazı)** | "DPI Bypass için bağlanın" / "İşlem yapılıyor..." / "Bağlantınız şifrelendi..." |
| **Özet pill (bağlıyken)** | `PROFİL: Önerilen · DNS: Cloudflare` — anlık ayar bilgisi |

> Bilgi: Özel ayar yaparsanız (Gelişmiş'ten chunk vb. değiştirme) profil "Özel" görünür, picker'da uyarı şeridi çıkar.

### 2.3 Aksiyon alanı

| Öğe | Ne yapar |
|------|----------|
| **LAN pill butonu** (sadece LAN paylaşımı açıkken ve bağlıyken) | Telefon/diğer cihazlar için PAC/manuel bağlantı modalını açar |
| **BAĞLAN** (büyük kırmızı buton) | Bağlanmaya başlar; bağlıyken **BAĞLANTIYI KES** (nötr) olur |
| Buton işleniyorken | "BAĞLANIYOR..." / "KESİLİYOR..." / "AYAR UYGULANIYOR..." metni gösterilir, tıklanamaz |

### 2.4 Alt navigasyon

| Buton | Ne yapar |
|-------|----------|
| **AYARLAR** | Ayarlar ekranını açar |
| **LOGLAR** | Günlük panelini açar |

> Not: **Çıkış**, kurumsal yaklaşım için alt navigasyondan kaldırıldı. Çıkış sistem tepsisinden veya pencere kapatma X düğmesinden yapılır.

### 2.5 İnternet yok uyarısı

İnternet bağlantısı koparsa header altında **sarı şerit** belirir: "İnternet Bağlantısı Yok". Bağlantı geri gelince kaybolur.

---

## 3. Ayarlar → BAĞLANTI sekmesi

Ayarların ilk ve varsayılan sekmesi. Günlük kullanıcının ana karar noktası.

### 3.1 Bağlantı Profili

Üç satırlık kart; tek karar noktası. Tıkladığınız profil **dpiMethod + httpsChunkSize + selectedIspProfile**'ı atomik olarak günceller.

| Profil | Ne zaman? | Teknik karşılığı |
|--------|-----------|------------------|
| **Hızlı** | Yumuşak DPI (Türknet, küçük yerel ISP'ler) | SNI split, en hafif |
| **Önerilen** (varsayılan) | Çoğu fiber bağlantı | Chunk split = 2 bayt |
| **Maksimum** | Sert DPI (Kablonet, Superonline, Türk Telekom, Vodafone, Millenicom) | Chunk split = 1 bayt; Npcap kuruluysa fake packet |

**"Özel ayar etkin"** uyarısı: Gelişmiş'ten chunk/Npcap/CPU gibi bir şeyi değiştirince profil tier'a uymaz, picker altında soluk kırmızı şerit görünür. Bir profile tıklarsanız özel ayar sıfırlanır.

### 3.2 DNS

| Öğe | Ne yapar |
|------|----------|
| **Sistem Varsayılanı (toggle)** | Açıksa: Windows'un DNS'i kullanılır, alt seçenekler kilitlenir; kapatınca otomatik Cloudflare seçilir |
| **Otomatik en hızlıyı seç (toggle)** | Açıkken arka planda ping testi yapıp en hızlı DNS'i seçer; manuel liste kilitlenir |
| **"En hızlı DNS'yi bul" butonu** | Tüm DNS sağlayıcılarına ping atar, gecikmeleri gösterir, listeyi sıralar |
| **DNS Listesi** | Cloudflare · AdGuard · Google · Quad9 · OpenDNS — tıklanan seçilir |
| **Yanındaki "Xms" rozeti** | Son ping ölçümü |

> Not: DoH (DNS over HTTPS) desteği yeni kurulumlarda Cloudflare için aktiftir; sağlayıcıyı değiştirirken otomatik geçiş yapılır.

---

## 4. Ayarlar → UYGULAMA sekmesi

### 4.1 Dil

| Öğe | Ne yapar |
|------|----------|
| **Türkçe / English** | Anında değişir, sayfa yeniden yüklenmez |

### 4.2 Otomasyon

| Toggle | Ne yapar |
|--------|----------|
| **Otomatik Bağlan** | Uygulama açılır açılmaz bağlanmayı dener |
| **Otomatik Yeniden Bağlan** | Bağlantı koparsa otomatik tekrar dener (en fazla **5 deneme**, artan bekleme süresi: 2.5s → 3s → 6s → 12s → 20s) |

### 4.3 Genel

| Toggle | Ne yapar |
|--------|----------|
| **Windows ile Başlat** | Sistem başlangıcına ekler/çıkarır (Tauri autostart plugin'i) |
| **Tepsiye Küçült** | Pencere X düğmesine bastığınızda kapatmak yerine sistem tepsisine küçültür |
| **Her Şeyin Üzerinde Tut** | Pencereyi diğer pencerelerin önünde sabitler |
| **Eylem Onayı İste** | Bağlantıyı kesme / uygulamayı kapatma gibi kritik aksiyonlarda Windows onay diyaloğu çıkarır |

### 4.4 Bildirimler

| Toggle | Ne yapar |
|--------|----------|
| **Bildirimler** (ana toggle) | Windows masaüstü bildirimlerini tamamen açar/kapatır. Detaylı tür ayarları **Gelişmiş → Bildirim Türleri** altındadır |

---

## 5. Ayarlar → GELİŞMİŞ sekmesi

Üst tarafta uyarı şeridi: *"Bu ayarlar uzman kullanıcılar içindir. Varsayılan değerler çoğu durumda yeterlidir."*

### 5.1 Gelişmiş Bypass (Npcap)

Sadece Maksimum profilde gerçek etki sağlar. Sahte paket (fake packet) enjeksiyonu için Npcap sürücüsü gerekir.

**Npcap kuruluysa:**

| Öğe | Ne yapar |
|------|----------|
| **Gelişmiş Bypass (toggle)** | Açıksa Maksimum profilde sahte paket + chunk=1 + fake-count=3 gönderilir |
| **"Yeniden başlatma gerekli" uyarısı** | Sürücü yüklendikten sonra çıkar; bilgisayar yeniden başlatılana kadar etki sınırlı |

**Npcap kurulu değilse:**

| Öğe | Ne yapar |
|------|----------|
| **"Npcap kurulu değil" uyarısı** | Sürücünün ne işe yaradığını anlatır |
| **NPCAP SÜRÜCÜSÜNÜ YÜKLE** (kırmızı buton) | Tauri komutu `install_driver` çağrılır; Npcap kurulum sihirbazını başlatır |

### 5.2 Düşük CPU / Defender

| Öğe | Ne yapar |
|------|----------|
| **Düşük CPU Modu (toggle)** | Chunk ≥ 8 bayta yükseltir, fake packet'i kapatır, küçük paket sayısını azaltır → Defender'ın "Network Inspection Service" CPU yükü düşer |
| **Defender Dışlamalarını Ekle** (buton) | Yönetici izniyle `Add-MpPreference -ExclusionProcess dpireaper-proxy.exe` ve proje klasörü için dışlama ekler. Yönetici izni yoksa hata mesajı çıkar |
| **Yeşil onay mesajı** | Başarılı dışlama bildirimi |
| **Kırmızı hata mesajı** | İzin reddi veya hata detayı |

> Bu iki ayar birlikte kullanıldığında Antimalware Service Executable CPU sorununu büyük ölçüde çözer.

### 5.3 Gelişmiş Ağ

| Toggle | Ne yapar |
|--------|----------|
| **IPv4 Zorla** | DNS sorgularını sadece IPv4 (`--dns-qtype ipv4`) yapar. Sonsuz yükleme / timeout sorunlarını önler. Varsayılan: **açık** |
| **Oyun Modu (WinHTTP Proxy)** | Masaüstü oyunları / C++ servisleri / arka plan API'leri için WinHTTP proxy yönlendirmesi açar. Tarayıcı dışı uygulamaların da bypass kullanmasını sağlar |
| **LAN Paylaşımı** | Bu cihazı yerel ağdaki diğer cihazlar için proxy olarak çalışır hale getirir. Açıldığında ana ekranda "Diğer Cihazları Bağla" butonu görünür |

### 5.4 Bildirim Türleri

> Ana **Bildirimler** kapalıysa bu kart soluklaşır ve tıklanamaz.

| Toggle | Ne yapar |
|--------|----------|
| **Bağlantı Bildirimleri** | Bağlandığında masaüstü bildirimi |
| **Bağlantı Kesilme Bildirimleri** | Bağlantı koparıldığında masaüstü bildirimi |

### 5.5 Sorun Giderme

| Buton | Ne yapar |
|-------|----------|
| **İnterneti Onar** (`Wrench` ikonlu kart) | `clear_system_proxy` çağırır → Windows sistem proxy ayarlarını siler, PAC'i DIRECT'e geçirir. Bağlantı koptuysa veya tarayıcı internete giremiyorsa kullanın |
| Durumlar | İdle (gri) → Onarılıyor (spin) → Onarıldı (yeşil ✓ — 2sn) → Hata (kırmızı ⚠ — 2sn) |

### 5.6 Önemli Bilgi

Kırmızı vurgulu bilgi kartı — DPIReaper kullanırken dikkat edilmesi gerekenler.

### 5.7 Hakkında

| Satır | Ne gösterir / yapar |
|-------|---------------------|
| **Logo + DPIReaper 1.0.0** | Marka ve sürüm |
| **Gizlilik: Telemetri yok...** | Veri politikası |
| **Kaynak Kodu → GitHub** (tıklanabilir) | Tarayıcıda repo açar (`openShell` ile sistem tarayıcısı) |
| **Destek / Hata Bildirimi** (tıklanabilir) | GitHub Issues sayfası |
| **Telif notu (altta küçük yazı)** | © 2026 DPIReaper |

---

## 6. Alt navigasyon (Ayarlar penceresi)

3 sekme, her birinin kırmızı alt çizgi vurgusu aktif sekmeyi belirtir:

| Sekme | İkon | İçerik |
|--------|------|--------|
| **BAĞLANTI** | Globe | Profil + DNS |
| **UYGULAMA** | Settings | Dil + Otomasyon + Genel + Bildirim |
| **GELİŞMİŞ** | Wrench | Bypass + CPU + Ağ + Bildirim Türü + Sorun + Önemli + Hakkında |

**Geri butonu (sol üst, `<` ikon)** — Ana ekrana döner.

---

## 7. Günlük (LOGLAR) paneli

Alt navdaki **LOGLAR** butonuyla açılır. Sağdan sola animasyonla gelir.

### 7.1 Üst başlık

| Öğe | Ne yapar |
|------|----------|
| **X butonu** | Paneli kapatır |
| **SİSTEM LOGLARI** başlığı | - |

### 7.2 Filtre çubuğu

| Buton | Ne yapar |
|-------|----------|
| **TÜMÜ** | Bütün log girdileri |
| **BİLGİ** | Sadece info / success türü |
| **UYARI** | Sadece warn türü |
| **HATA** | Sadece error türü |

Her butonun yanında o filtreye ait **sayaç pill**'i var. Aktif filtre kırmızı vurgu, kırmızı sayaç.

### 7.3 Log alanı

| Eleman | Anlamı |
|--------|--------|
| **Sıra numarası** (`001`, `002`...) | Filtreli görünümde sırasıdır |
| **Saat damgası** (`[12:34:56]`) | Log yazılma anı |
| **Mesaj** | Renk: info=gri, warn=sarı, error=kırmızı, success=yeşil |

**Boş durum:**
- Hiç log yoksa: *"Henüz günlük kaydı yok"*
- Filtreye uyan yoksa: *"Bu filtreye uyan kayıt yok"*

### 7.4 Alt aksiyonlar

| Buton | Ne yapar |
|-------|----------|
| **TEMİZLE** (Trash ikon, nötr) | Tüm logları siler |
| **KOPYALA** (kırmızı/mavi gradient) | Tüm logları panoya kopyalar. Başarılı → "KOPYALANDI!" yeşil, hata → "HATA!" kırmızı |
| Loglar boşken | Kopyala butonu pasifleşir |

---

## 8. LAN Paylaşımı (Diğer Cihazları Bağla) modalı

**Şart:** Gelişmiş → Gelişmiş Ağ → "LAN Paylaşımı" açık olmalı **ve** uygulama bağlı olmalı.

Ana ekranda görünen **"Diğer Cihazları Bağla"** pill butonu modalı açar.

### 8.1 Modal başlığı

| Öğe | Ne yapar |
|------|----------|
| **Smartphone ikonu + "Cihaz Bağlama"** | Modal başlık |
| **X butonu** (sağ üst) | Modalı kapatır |
| Boş bir alana tıklama | Modalı kapatır |

### 8.2 Sekmeler

**Otomatik (PAC)** — önerilen
**Manuel** — yalnızca PAC desteklemeyen cihazlar için

#### PAC sekmesi

| Öğe | Ne yapar |
|------|----------|
| **Kırmızı uyarı kutusu** | "DPIReaper kapatıldıktan sonra Wi-Fi'yi kapatıp açın" |
| **QR kod** + "BÜYÜT" rozet | Kurulum rehberinin URL'ini içerir; tıklayınca tam ekran QR (telefondan okunabilir) |
| **PAC adresi kutusu** | `http://<lanIp>:<pacPort>/proxy.pac` — tıklayınca panoya kopyalar; başarılıyken ✓ |

> Telefonun **Wi-Fi → Proxy → Otomatik URL** kısmına bu PAC adresi yapıştırılır.

#### Manuel sekmesi

| Öğe | Ne yapar |
|------|----------|
| **Kırmızı uyarı kutusu** | "DPIReaper kapatıldığında telefonun internetini Proxy → Yok yapın" |
| **Sunucu (Host)** | Bilgisayarın yerel IP'si — tıkla, kopyala |
| **Port** | 8080 (veya değiştiyse aktif port) — tıkla, kopyala |
| **NASIL YAPILIR? (Rehber)** | Tarayıcıda rehber sayfasını açar |

### 8.3 QR büyüt overlay

QR'a tıklayınca tam ekran karanlık zemin üzerinde büyük QR + adres yazısı çıkar. Bir yere tıklayınca kapanır.

---

## 9. Sistem tepsisi (tray) menüsü

Tepsi ikonu üzerine:

| İşlem | Sonuç |
|-------|-------|
| **Sol tık** | Pencereyi geri açar / öne getirir |
| **Çift tık** | Pencereyi geri açar (debounce'lu) |
| **Sağ tık** | Menü açılır |

**Sağ tık menüsü:**

| Öğe | Ne yapar |
|------|----------|
| **Uygulamayı Aç** | Pencereyi gösterir + öne getirir |
| **Çıkış** | Bağlantıyı keser, proxy'yi temizler, uygulamayı tamamen kapatır |

Tepsi tooltip'i bağlantı durumuna göre güncellenir: "DPIReaper - Kapalı / Bağlanıyor / Aktif".

---

## 10. Kapatma davranışı

### 10.1 Pencere X düğmesi

- **Tepsiye Küçült açıksa:** pencere gizlenir, tepside kalır
- **Kapalıysa:** **Eylem Onayı İste** ayarına bağlı:
  - Açıksa: Windows onay diyaloğu çıkar ("Çıkmak istediğinize emin misiniz?")
  - Kapalıysa: Doğrudan kapanır

### 10.2 Kapatma animasyonu

Bağlı durumdayken kapatınca tam ekran karartı + DR logosu + "DPIReaper Kapatılıyor" + animasyonlu metin (Güvenli bağlantı sonlandırılıyor → Uygulama kapatılıyor).

### 10.3 Bağlantıyı kes onayı

**BAĞLANTIYI KES** butonuna basıldığında **Eylem Onayı İste** açıksa diyalog çıkar; iptal edebilirsiniz.

---

## 11. Yönetici izni uyarısı

Uygulama yönetici olmadan açılırsa tam ekran kırmızı vurgulu uyarı:

- Logo + "Yönetici İzni Gerekli"
- "Sağ tıklayın → Yönetici olarak çalıştır"
- **KAPAT** butonu (uygulamayı kapatır)

---

## 12. Konfigürasyon ve veri

### 12.1 Saklanan veriler

| Konum | İçerik |
|-------|--------|
| `localStorage` (uygulama içi) | Tüm konfigürasyon (`dpireaper_config`) — dil, profil, DNS, ileri ayarlar |
| `localStorage` (`dpireaper_first_run_done`) | İlk açılış sihirbazının gösterilip gösterilmediği |
| Tauri config | Pencere durumu, autostart kaydı |

### 12.2 Gizlilik

- **Sıfır telemetri** — hiçbir veri dışarı gönderilmez
- DNS sorguları sizin seçtiğiniz sağlayıcıya gider
- HTTPS trafiği **çözülmez**; sadece TLS handshake fragmentasyonu yapılır

### 12.3 Sıfırlamak için

DevTools Console'da:

```js
localStorage.clear()
```

Sonra uygulamayı kapatıp açın — ilk kurulum sihirbazı tekrar çıkar.

---

## 13. Yaygın senaryolar

### "Bir siteye giremiyorum"
1. Bağlantı profilini **Maksimum**'a alın
2. Çalışmazsa Gelişmiş → Npcap'i yükleyin → bilgisayarı yeniden başlatın
3. Hâlâ çalışmazsa Gelişmiş → Sorun Giderme → **İnterneti Onar**

### "İnternet hiç çalışmıyor (bağlandıktan sonra koptu)"
1. Ayarlar → Gelişmiş → **İnterneti Onar** (sistem proxy'sini temizler)
2. Hâlâ sorun varsa Wi-Fi'yi kapatıp açın

### "Antimalware Service Executable CPU'mu yiyor"
1. Ayarlar → Gelişmiş → **Düşük CPU Modu**'nu açın
2. Yanındaki **Defender Dışlamalarını Ekle** butonuna basın (yönetici şart)

### "Telefonum bağlanmıyor"
1. Bilgisayar ile telefon aynı Wi-Fi ağında mı kontrol edin
2. Ayarlar → Gelişmiş → **LAN Paylaşımı** açık mı
3. Bağlıyken ana ekranda "Diğer Cihazları Bağla" → PAC sekmesinden URL'i kopyalayın
4. Telefon: Wi-Fi → Ağ ayarları → Proxy → Otomatik URL'ye yapıştırın
5. **DPIReaper'ı kapattıktan sonra** telefonda Proxy → Yok yapmayı unutmayın

### "Oyun veya masaüstü uygulaması bypass kullanmıyor"
- Ayarlar → Gelişmiş → **Oyun Modu (WinHTTP Proxy)**'yi açın

### "Uygulama otomatik açılsın istiyorum"
- Ayarlar → Uygulama → Genel → **Windows ile Başlat**'ı açın
- Bağlanmayı da otomatik istiyorsanız: Ayarlar → Uygulama → Otomasyon → **Otomatik Bağlan**

---

## 14. Klavye / etkileşim notları

- F5, F11, F12 devre dışı (kurumsal uygulama hijyeni)
- Sağ tık devre dışı (üretim derlemesinde DevTools yok)
- Tüm metin **kopyalanabilir değil** (`user-select: none`) — loglar hariç (KOPYALA butonu ile)

---

## 15. Bilgilendirme

- Telemetri: **yok**
- Veri konumu: **yalnızca cihazınız**
- Kaynak motor: **SpoofDPI** (Go) — `src-tauri/binaries/dpireaper-proxy-x86_64-pc-windows-msvc.exe`
