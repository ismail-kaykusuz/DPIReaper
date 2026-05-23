# DPIReaper — Ürün ve Arayüz Geliştirme Planı

**Belge sürümü:** 1.1  
**Tarih:** 23 Mayıs 2026  
**Durum:** Faz 1–4 tamamlandı  
**Hedef:** Mevcut kırmızı/koyu renk kimliğini koruyarak arayüzü modern, minimalist ve kurumsal bir ürün deneyimine taşımak; ayarlar karmaşıklığını azaltmak ve teknik derinliği katmanlı (progressive disclosure) sunmak.

---

## 1. Özet

DPIReaper’ın ana ekranı işlevsel ve odaklıdır. Karmaşıklığın büyük kısmı **Ayarlar** ekranında (özellikle Ağ sekmesi), aynı kararın birden fazla yerde sunulmasından (ISS rehberi, bypass modları, ilk açılış sihirbazı) ve çok sayıda ileri düzey seçeneğin varsayılan görünümde olmasından kaynaklanmaktadır.

Bu plan, değişiklikleri **dört faz** halinde sunar. Her fazın kapsamı, teslimatları, başarı ölçütleri ve tahmini çabası belirtilmiştir. Fazlar sıralıdır; bir sonraki faza geçiş, bir öncekinin onayı ve tamamlanması ile önerilir.

---

## 2. Tasarım ilkeleri (tüm fazlar boyunca sabit)

| İlke | Açıklama |
|------|----------|
| **Renk kimliği** | Koyu zemin + kırmızı vurgu korunur; sarı/yeşil/mavi/mor “mod renkleri” kaldırılır veya yalnızca seçili durumda tek vurgu kullanılır. |
| **Tek birincil aksiyon** | Ana ekranda Bağlan / Bağlantıyı kes ön planda kalır. |
| **Katmanlı derinlik** | Günlük kullanıcı: profil + DNS özeti. İleri kullanıcı: Gelişmiş ayarlar. |
| **Az metin, net etiket** | Her satırda kısa başlık; uzun açıklamalar isteğe bağlı (tooltip / “Daha fazla bilgi”). |
| **Tutarlı bileşenler** | Inline stiller yerine CSS değişkenleri ve yeniden kullanılabilir UI parçaları. |
| **Kurumsal ton** | Gaming estetiği (aşırı glow, pulse, çoklu gradient) azaltılır; ölçülü geçişler (150–200 ms). |

---

## 3. Mevcut durum analizi

### Güçlü yönler
- Net bağlantı akışı (ana buton, durum metni)
- i18n altyapısı (TR / EN)
- ISS ve bypass profillerinin merkezi yönetimi (`profiles.js`)
- Tauri masaüstü entegrasyonu (tray, proxy, Defender dışlama)

### İyileştirme alanları
| Alan | Sorun | Etki |
|------|--------|------|
| Ayarlar → Ağ | ISS rehberi + 3 bypass modu + chunk + Npcap + DNS + LAN aynı sekmede | Bilişsel yük, beginner kaybı |
| Tekrarlayan UX | İlk açılış ISS overlay + Ayarlar ISS + Manuel mod seçici | “Hangisini seçmeliyim?” |
| Görsel dil | Çok renkli ikon kutuları, uzun açıklamalar | Amatör / oyuncu arayüzü hissi |
| Navigasyon | Alt barda Çıkış, Ayarlar, Günlük eşit ağırlıkta | Kurumsal ürün normlarına aykırı |
| Ana ekran | Shield ikonu; marka logosu header’da sınırlı | Marka bütünlüğü zayıf |
| Kod yapısı | `Settings.jsx` ~1100+ satır, yoğun inline style | Bakım ve tutarlılık zor |

---

## 4. Hedef mimari (bilgi mimarisi)

```
Ana ekran
├── Durum (bağlı / hazır / işleniyor)
├── Birincil aksiyon (Bağlan / Kes)
├── Özet şerit (isteğe bağlı): Profil · DNS
└── Alt nav: Ayarlar · Günlük  (+ Çıkış → tray / üst menü)

Ayarlar
├── Bağlantı          ← herkes (profil, DNS)
├── Uygulama          ← dil, başlangıç, bildirimler
└── Gelişmiş ▾        ← chunk, Npcap, Defender, LAN, WinHTTP, IPv4, sorun giderme

(Hakkında / Sürüm — Uygulama veya alt köşe)
```

**Bağlantı profili (birleşik kavram):** ISS rehberi + Turbo/Dengeli/Güçlü → kullanıcıya **Hızlı / Önerilen / Maksimum** (alt metinde ISS ipuçları).

---

## 5. Fazlar

---

### Faz 1 — Görsel sadeleştirme ve hızlı kazanımlar

**Süre (tahmini):** 1–2 gün  
**Risk:** Düşük  
**Bağımlılık:** Yok  

#### Kapsam
- CSS tasarım token’ları: `--accent`, `--surface`, `--border`, `--text-muted`
- Ayarlar listesinde tek vurgu rengi (kırmızı); mod başına sarı/yeşil/mavi ikon kutularının nötrleştirilmesi
- Ana ekran: header’da marka logosu; isteğe bağlı durum halkası (Shield yerine veya logo ile birlikte)
- Animasyonların sadeleştirilmesi (pulse yalnızca “bağlanıyor” durumunda)
- WinHTTP satırı ikonunun kurumsal ikonla değiştirilmesi
- Alt navigasyonda **Çıkış**’ın kaldırılması veya tray / onay diyaloğuna taşınması

#### Teslimatlar
- [ ] `App.css` token seti ve bileşen sınıfları güncellemesi
- [ ] Ayarlar satırlarında kısaltılmış metin + isteğe bağlı açıklama
- [ ] Ana ekran marka uyumu
- [ ] Navigasyon revizyonu

#### Başarı ölçütleri
- Ayarlar ekranında eşzamanlı **≤ 2 vurgu rengi** (kırmızı + nötr gri)
- Ana ekranda tek odak noktası (bağlan butonu) korunmuş
- Mevcut işlevsellik regresyonu yok (bağlan / kes / tray)

#### Onay noktası
> Faz 1 tamamlandığında görsel yön onaylanır; Faz 2’ye geçilir.

---

### Faz 2 — Ayarlar bilgi mimarisi ve Gelişmiş katman

**Süre (tahmini):** 3–5 gün  
**Risk:** Orta  
**Bağımlılık:** Faz 1 (tercihen tamamlanmış)  

#### Kapsam
- Ayar sekmelerinin yeniden yapılandırılması:
  - **Bağlantı** (profil özeti + DNS)
  - **Uygulama** (dil, otomasyon, bildirimler)
  - **Gelişmiş** (accordion / kapalı varsayılan)
- Ağ sekmesindeki teknik blokların Gelişmiş altına taşınması:
  - Chunk boyutu seçimi
  - Npcap / fake packet / Defender dışlama
  - LAN paylaşım, WinHTTP, IPv4 zorlama
- Bildirimler: 3 ayrı toggle → 1 ana toggle (+ isteğe bağlı alt ayrım Gelişmiş’te)
- `Settings.jsx` modülerleştirme:
  - `SettingsConnection.jsx`
  - `SettingsApp.jsx`
  - `SettingsAdvanced.jsx`

#### Teslimatlar
- [ ] Yeni ayarlar hiyerarşisi (3 grup)
- [ ] Gelişmiş bölüm varsayılan kapalı
- [ ] Dosya bölünmesi ve import yapısı
- [ ] i18n anahtarları güncellemesi (TR / EN)

#### Başarı ölçütleri
- Bağlantı sekmesinde **≤ 8** birincil satır (profil + DNS dahil)
- Yeni kullanıcı chunk / Npcap görmeden bağlanabiliyor
- Ayarlar dosyası parçalanmış; ana `Settings.jsx` yönlendirici rolünde

#### Onay noktası
> Ayarlar akışı ve Gelişmiş kapsamı onaylanır; Faz 3’te profil birleştirmesi yapılır.

---

### Faz 3 — Bağlantı profili birleştirmesi (UX birliği)

**Süre (tahmini):** 4–6 gün  
**Risk:** Orta–yüksek (motor argümanları ile uyum)  
**Bağımlılık:** Faz 2  

#### Kapsam
- **Tek profil seçici:** İlk açılış overlay + Ayarlar ISS rehberi + Manuel Turbo/Dengeli/Güçlü → tek UI
- Kullanıcı etiketleri (`profiles.js` / i18n):
  - `light` → **Hızlı**
  - `mid` → **Önerilen** (varsayılan)
  - `heavy` → **Maksimum**
  - Alt metin: ISS örnekleri (Turknet, Kablonet vb.) — bilgi amaçlı, ayrı expandable kart değil
- Varsayılanlar:
  - Profil: Önerilen
  - DNS: Cloudflare veya sistem (mevcut mantık korunur)
  - IPv4 / WinHTTP: açık (Gelişmiş’te değiştirilebilir)
- Ana ekran özet şeridi: `Profil: Önerilen · DNS: Cloudflare` (bağlıyken)
- DNS gecikme testi: otomatik değil; **“En hızlı DNS’yi bul”** butonu

#### Teslimatlar
- [ ] Birleşik `ConnectionProfilePicker` bileşeni
- [ ] İlk açılış sihirbazının sadeleştirilmesi veya profil seçici ile birleştirilmesi
- [ ] `profiles.js` / `buildProxyEngineArgs` ile UI eşlemesinin doğrulanması
- [ ] Regresyon testi: her profilde bağlan / kes / yeniden bağlan

#### Başarı ölçütleri
- Kullanıcı yolunda **tek** profil seçim noktası
- `dpiMethod` / `httpsChunkSize` / `selectedIspProfile` tutarlı kalıyor
- İlk kurulum ≤ 2 adım (profil → bağlan)

#### Onay noktası
> Profil isimlendirmesi (Hızlı / Önerilen / Maksimum) ve ISS alt metinleri onaylanır.

---

### Faz 4 — Kurumsal olgunluk ve ürün cilası

**Süre (tahmini):** 1–2 hafta  
**Risk:** Orta  
**Bağımlılık:** Faz 3  

#### Kapsam
- **Hakkında** ekranı: sürüm, lisans, GitHub / destek linki, gizlilik notu
- **Günlük** ekranı: filtre (Tümü / Bilgi / Uyarı / Hata), kopyala / temizle, renkli console yerine okunabilir liste
- **Durum ve güven:** bağlıyken net durum çubuğu; hata mesajlarında eylem önerisi (ör. Defender dışlama)
- **Kurulum deneyimi (isteğe bağlı):** ISS/profil → test bağlantısı → tamamlandı
- **Dokümantasyon:** README’de “Önerilen profil” ve “Gelişmiş ayarlar” bölümü
- **İsteğe bağlı (v2):** Açık tema, telemetri yok beyanı, imzalı installer notları

#### Teslimatlar
- [ ] Hakkında / sürüm bileşeni
- [ ] Günlük UX iyileştirmesi
- [ ] Kullanıcı dokümantasyonu güncellemesi
- [ ] (Opsiyonel) Kurulum sihirbazı v2

#### Başarı ölçütleri
- Yeni kullanıcı README olmadan bağlanabiliyor
- Destek senaryolarında log export / kopyalama ≤ 2 tıklama
- Kurumsal sunumda (ekran görüntüsü / demo) tutarlı marka ve sade ayarlar

#### Onay noktası
> Faz 4 kapsamındaki opsiyonel maddeler (kurulum sihirbazı v2, açık tema) ayrı onaylanır.

---

## 6. Kapsam dışı (bu planın parçası değil)

Aşağıdakiler **bilinçli olarak** bu plana dahil edilmemiştir; ayrı talep gerekir:

- Proxy motoru (SpoofDPI / Go) çekirdek algoritma değişiklikleri
- Yeni ISS profili ekleme (içerik güncellemesi Faz 3 sonrası kolaylaşır)
- macOS / Linux portu
- Abonelik / lisans sunucusu entegrasyonu

---

## 7. Riskler ve önlemler

| Risk | Olasılık | Önlem |
|------|----------|--------|
| Profil birleştirmede motor uyumsuzluğu | Orta | `profiles.js` tek kaynak; bağlantı öncesi/sonrası otomatik test |
| Gelişmiş ayarlara taşınan seçeneklerin bulunamaması | Düşük | İlk kullanımda tooltip; arama (Faz 4+) |
| i18n eksik anahtarlar | Orta | Her fazda TR + EN birlikte güncelleme |
| Windows ikon önbelleği | Düşük | `npm run icons` + yeniden derleme dokümantasyonu |

---

## 8. Tahmini zaman çizelgesi

| Faz | Süre | Kümülatif |
|-----|------|-----------|
| Faz 1 | 1–2 gün | ~2 gün |
| Faz 2 | 3–5 gün | ~7 gün |
| Faz 3 | 4–6 gün | ~13 gün |
| Faz 4 | 5–10 gün | ~23 gün |

*Süreler tek geliştirici, test ve geri bildirim döngüsü dahil tahminidir.*

---

## 9. Onay formu

Lütfen her madde için onayınızı işaretleyin veya not ekleyin.

| Madde | Onay | Not |
|-------|------|-----|
| Tasarım ilkeleri (Bölüm 2) | ☐ Evet ☐ Revizyon | |
| Hedef bilgi mimarisi (Bölüm 4) | ☐ Evet ☐ Revizyon | |
| **Faz 1** — Görsel sadeleştirme | ☐ Başla ☐ Ertele ☐ İptal | |
| **Faz 2** — Ayarlar yapısı + Gelişmiş | ☐ Başla ☐ Ertele ☐ İptal | |
| **Faz 3** — Profil birleştirmesi | ☐ Başla ☐ Ertele ☐ İptal | |
| **Faz 4** — Kurumsal cilâ | ☐ Başla ☐ Ertele ☐ İptal | |
| Profil adları: Hızlı / Önerilen / Maksimum | ☐ Evet ☐ Alternatif: _______ | |
| Çıkış butonunun alttan kaldırılması | ☐ Evet ☐ Hayır | |
| Faz 4 opsiyonelleri (açık tema, kurulum v2) | ☐ Dahil et ☐ Sonraya bırak | |

**Genel onay:** ☐ Planı onaylıyorum, Faz 1 ile başlanabilir  
**İmza / tarih:** _________________  

---

## 10. Revizyon geçmişi

| Sürüm | Tarih | Değişiklik |
|-------|-------|------------|
| 1.0 | 2026-05-23 | İlk plan — onay bekliyor |
| 1.1 | 2026-05-23 | Faz 1–4 tamamlandı (görsel sadeleştirme, 3 sekme, profil birleştirmesi, Hakkında + Günlük UX + README + modülerleştirme) |

---

*Bu belge proje kökünde `plan.md` olarak tutulur. Onay sonrası uygulama adımları ilgili faz başlıkları altındaki checklist’lere göre yürütülür.*
