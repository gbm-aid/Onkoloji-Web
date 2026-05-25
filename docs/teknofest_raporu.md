# GBM-AID: Glioblastoma Multiforme Yapay Zeka Destekli Klinik Karar Destek Sistemi

**Proje Adı:** GBM-AID (GBM Artificial Intelligence Decision Support)  
**Kategori:** Sağlık Teknolojileri / Tıbbi Yapay Zeka  
**Platform:** Web tabanlı, sunucu bağımsız (local deployment)

---

## 1. PROJE ÖZETİ

Glioblastoma Multiforme (GBM), erişkinlerde en sık görülen ve en agresif primer beyin tümörüdür. 2005'ten bu yana uygulanan standart Stupp protokolüne (cerrahi + radyoterapi + Temozolomid) rağmen ortalama genel sağkalım süresi 14–15 ay civarında kalmakta, yalnızca %7,2'lik hasta grubu 5 yıla ulaşabilmektedir.

**GBM-AID**, çok modlu Manyetik Rezonans Görüntüleme'den (T1, T1ce, T2, FLAIR) otomatik olarak çıkarılan 107 radyomik özellik ile klinik ve moleküler verileri birleştiren, hibrit makine öğrenmesi tabanlı bir klinik karar destek sistemidir.

**Sistemin Özgün Katkıları:**
1. **Bütünleşik Pipeline:** Segmentasyon, radyomik analiz ve sağkalım modellemesini tek platformda birleştirir; mevcut parçalı yaklaşımların boşluğunu doldurur.
2. **Açıklanabilir AI:** Kara kutu modeller yerine Cox Oransal Tehlikeler modeli ve XGBoost kombinasyonuyla klinik güven sağlar.
3. **Gerçek Zamanlı Kanıt:** PubMed E-utilities API ve Anthropic Claude AI ile her hasta için güncel literatüre dayalı klinik özet üretir.
4. **Büyük Kohort Benzerliği:** FAISS vektör araması ile 819 hastalık (LUMIERE 771 + doğrulama 48) referans kohortuna anlık erişim sağlar.

---

## 2. SİSTEM MİMARİSİ

```
┌─────────────────────────────────────────────────────────────────┐
│                         GİRİŞ KATMANI                          │
│                                                                 │
│  ┌──────────────────┐        ┌────────────────────────────┐    │
│  │  Çok Modlu MR    │        │    Klinik Parametreler     │    │
│  │  ─────────────   │        │    ─────────────────────   │    │
│  │  T1  │ T1ce      │        │    Yaş │ Cinsiyet │ KPS    │    │
│  │  T2  │ FLAIR     │        │    MGMT │ IDH1 │ Cerrahi  │    │
│  │  [NIfTI format]  │        │    Lokalizasyon │ Protokol │    │
│  └────────┬─────────┘        └───────────────┬────────────┘    │
└───────────┼──────────────────────────────────┼─────────────────┘
            │                                  │
┌───────────▼──────────────────────────────────▼─────────────────┐
│                       İŞLEME KATMANI                           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Otomatik Segmentasyon Analizi               │  │
│  │  Whole Tumor (1|2|4) │ Core (1|4) │ Enhancing (T1ce)    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼──────────────────────────────┐  │
│  │              107 Radyomik Özellik Çıkarımı               │  │
│  │  Hacim (4) │ Şekil (3) │ Yoğunluk (40) │ Doku-GLCM (3)  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                              │                                  │
│  ┌───────────────────────────▼──────────────────────────────┐  │
│  │         LASSO Özellik Seçimi (~30–50 özellik)            │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                        ANALİZ KATMANI                           │
│                                                                  │
│  ┌───────────────────┐  ┌───────────────────┐  ┌─────────────┐ │
│  │ Cox Oransal       │  │ XGBoost           │  │ FAISS       │ │
│  │ Tehlikeler Modeli │  │ Sınıflandırıcı    │  │ Vektör      │ │
│  │ ──────────────    │  │ ────────────────  │  │ Benzerlik   │ │
│  │ Sürekli risk      │  │ 12 ay sağkalım    │  │ ──────────  │ │
│  │ skoru (1–99)      │  │ kategorisi        │  │ Top-10 en   │ │
│  │ C-index ≥ 0.70    │  │ AUC-ROC ≥ 0.75   │  │ benzer hasta│ │
│  └─────────┬─────────┘  └─────────┬─────────┘  └──────┬──────┘ │
│            └──────────────┬────────┘                   │        │
│  ┌────────────────────────▼───────────────────────────▼──────┐  │
│  │         RAG Modülü: PubMed + Anthropic Claude AI          │  │
│  │  Sorgu → Top-5 Makale → LLM Klinik Özet (Kaynaklı)       │  │
│  └───────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────┐
│                         ÇIKTI KATMANI                           │
│                                                                  │
│  Risk Skoru │ Sağkalım %  │ Benzer Hastalar │ Klinik Özet      │
│  Büyüme Projeksiyonu (24 hafta) │ Radyomik Rapor │ CSV/Export  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. TEKNOLOJİ STACK

| Katman | Teknoloji | Sürüm | Amaç |
|--------|-----------|-------|------|
| Web Framework | FastAPI | 0.115.6 | RESTful API ve async HTTP servisleme |
| ASGI Server | Uvicorn | 0.34.0 | Yüksek performanslı sunucu |
| Görüntü İşleme | NiBabel | 5.3.2 | NIfTI format okuma/slice extraction |
| Sayısal Hesaplama | NumPy | 2.1.3 | Matris işlemleri, vektör hesabı |
| İstatistik | SciPy | — | Özellik hesaplamaları |
| Görsel İşleme | Pillow | 11.0.0 | PNG slice görselleştirme, overlay |
| ORM / DB | SQLAlchemy + SQLite | — | İlişkisel veri yönetimi |
| Vektör Araması | FAISS | — | Cosine similarity, 819 hasta kohort |
| Prognostik Model 1 | Cox PH (Lifelines) | — | Zamana bağlı risk skoru |
| Prognostik Model 2 | XGBoost | — | 12 ay sağkalım sınıflandırması |
| Literatür API | PubMed E-utilities | — | Gerçek zamanlı makale sorgusu |
| Üretken AI | Anthropic Claude Haiku | 4.5 | RAG tabanlı klinik özet üretimi |
| Template | Jinja2 | 3.1.4 | HTML şablonlama |
| Konfigürasyon | python-dotenv | — | Ortam değişkeni yönetimi |

---

## 4. VERİTABANI ŞEMASI

### Entity-Relationship Diyagramı

```
┌──────────────────────────────────────────┐
│                 PATIENTS                  │
│──────────────────────────────────────────│
│ PK  id              INTEGER              │
│     patient_id      VARCHAR(50) UNIQUE   │
│     age             INTEGER              │
│     gender          VARCHAR(10)          │
│     kps_score       INTEGER (0–100)      │
│     mgmt_status     VARCHAR(30)          │◄── methylated /
│     idh1_status     VARCHAR(30)          │    unmethylated /
│     treatment_protocol VARCHAR(100)      │    unknown
│     survival_days   INTEGER              │
│     status          VARCHAR(20)          │◄── alive / deceased
│     diagnosis_date  DATE                 │
│     tumor_location  VARCHAR(100)         │◄── frontal / temporal /
│     surgery_type    VARCHAR(50)          │    parietal / occipital /
│     notes           TEXT                 │    insular / multifocal
│     dataset_source  VARCHAR(50)          │◄── GTR / STR / biopsy
│     created_at      DATETIME             │
└───────────────┬──────────────────────────┘
                │ 1 : N                        1 : N
    ┌───────────┘                    ┌─────────────────┐
    │                                │
┌───▼───────────────────────┐  ┌────▼─────────────────────────────┐
│         ANALYSES           │  │           TREATMENTS              │
│───────────────────────────│  │──────────────────────────────────│
│ PK  id          INTEGER   │  │ PK  id          INTEGER          │
│ FK  patient_pk  INT       │  │ FK  patient_pk  INT              │
│     session_id  VARCHAR   │  │     drug_name   VARCHAR(100)     │
│     report_id   VARCHAR   │  │     protocol    VARCHAR(100)     │
│     risk_score  FLOAT     │  │     start_date  DATE             │
│     risk_class  VARCHAR   │  │     end_date    DATE             │
│     risk_label  VARCHAR   │  │     dosage      VARCHAR(100)     │
│     survival_6m_pct FLOAT │  │     cycles      INTEGER          │
│     tumor_volume_cm3 FLOAT│  │     response    VARCHAR(20)      │◄──
│     core_volume_cm3  FLOAT│  │     side_effects TEXT            │  complete /
│     enhancing_vol    FLOAT│  │     notes       TEXT             │  partial /
│     edema_vol        FLOAT│  │     created_at  DATETIME         │  stable /
│     surface_area     FLOAT│  └──────────────────────────────────┘  progression
│     sphericity       FLOAT│
│     results_json    TEXT  │
│     created_at  DATETIME  │
└───────────────────────────┘
```

---

## 5. BİYOİNFORMATİK PIPELINE

### 5.1 Giriş ve Segmentasyon

Sistem BraTS Multi-Label segmentasyon maskesi formatını destekler:

| Label | Bölge | Tanım |
|-------|-------|-------|
| 1 | Nekrotik Çekirdek | Aktif olmayan, nekrotik tümör dokusu |
| 2 | Peritümöral Ödem | Tümör çevresi ödem bölgesi |
| 4 | Enhancing Tümör | Kontrast-tutan aktif tümör bölgesi |
| 1+2+4 | Whole Tumor | Tüm tümöral alan |
| 1+4 | Tumor Core | Aktif + nekrotik çekirdek |

### 5.2 Radyomik Özellik Gruplaması (107 Özellik)

```
107 RADYOMİK ÖZELLİK
│
├── Hacim Özellikleri (4 özellik)
│   tumor_volume_cm³ │ core_volume_cm³ │ enhancing_volume_cm³ │ edema_volume_cm³
│
├── Şekil Özellikleri (3 özellik)
│   surface_area_cm² │ sphericity (0–1) │ compactness
│
├── Yoğunluk Özellikleri — Her Modality için 10 özellik (×4 = 40 özellik)
│   [FLAIR, T1ce, T1, T2]:
│   mean │ std │ median │ skewness │ kurtosis
│   entropy │ energy │ p10 │ p90 │ range
│
└── Doku Özellikleri — GLCM (3 özellik)
    contrast │ homogeneity │ correlation
```

### 5.3 Risk Skoru Modeli

**Cox Oransal Tehlikeler:**
```
h(t|x) = h₀(t) × exp(β₁·Yaş + β₂·KPS + β₃·log(Tümör_Vol) + ... + βₙ·Özellikₙ)

Risk_Skoru = normalize(exp(Σ βᵢ·xᵢ)) → [1, 99]
```

**Risk Sınıflandırması:**
```
Risk_Skoru < 35   →  DÜŞÜK Risk
35 ≤ Risk ≤ 65   →  ORTA  Risk
Risk_Skoru > 65   →  YÜKSEK Risk
```

**6 Aylık Sağkalım Projeksiyonu (Tümör Büyüme Modeli):**
```
V(t) = V₀ × (1 + growth_rate)^(t/4)

growth_rate = 0.03 + (Risk_Skoru / 100) × 0.07
```
RANO kriteri (Yüksek Dereceli Gliom): Hacim değişimi ≥ %25 → Progresif Hastalık (PD)

### 5.4 FAISS Benzer Hasta Analizi

```
Özellik Vektörü (35+ boyut):
[tumor_vol, core_vol, enhancing_vol, edema_vol, surface_area, sphericity,
 compactness, contrast, homogeneity, correlation,
 flair_mean, flair_std, flair_entropy, ...,
 t1ce_mean, t1ce_std, t1ce_entropy, ...]

Benzerlik: cos(Q, P) = (Q · P) / (||Q|| × ||P||)
Referans Kohort: LUMIERE (771) + Doğrulama (48) = 819 hasta
Çıktı: En benzer 10 hasta + sağkalım bilgisi
```

### 5.5 RAG + Claude AI Pipeline

```
1. Hasta profili analizi (MGMT, IDH1, KPS, risk sınıfı)
       │
2. Dinamik PubMed sorgusu
   "glioblastoma" + "MGMT methylated" + "radiomics" + "survival"
       │
3. PubMed E-utilities API (esearch → esummary)
   → Top-5 ilgili makale (PMID, başlık, dergi, yıl)
       │
4. Anthropic Claude Haiku 4.5
   Prompt: Hasta profili + Radyomik bulgular + Makale özetleri
   → Türkçe, kaynaklı klinik özet
```

---

## 6. API ENDPOINT TABLOSU

### Görüntü ve Analiz

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/upload` | POST | NIfTI dosyaları yükler, modality otomatik algılar |
| `/api/slice/{session_id}/{filename}` | GET | MR slice görselleştirme (PNG, overlay destekli) |
| `/api/analyze` | POST | Ana analiz pipeline'ını tetikler |
| `/api/lumiere-patients` | GET | LUMIERE kohort hasta listesi |
| `/api/lumiere-files/{patient_id}` | GET | LUMIERE hasta NIfTI dosyaları |

### Hasta Yönetimi

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/patients` | GET | Tüm hastaları listeler |
| `/api/patients/{patient_id}` | GET | Hasta detayı (klinik + analiz + tedavi) |
| `/api/patients/{patient_id}` | PUT | Hasta verilerini günceller |
| `/api/patients/{patient_id}` | DELETE | Hasta ve tüm ilişkili kayıtları siler |
| `/api/patients/{patient_id}/timeline` | GET | Zaman serisi analiz sonuçları |

### Tedavi Yönetimi

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/patients/{patient_id}/treatments` | POST | Tedavi kaydı ekler |
| `/api/patients/{patient_id}/treatments` | GET | Hasta tedavi geçmişi |

### Veri ve İstatistik

| Endpoint | Method | Açıklama |
|----------|--------|----------|
| `/api/cohort-stats` | GET | Kohort risk dağılımı, yaş ve MGMT istatistikleri |
| `/api/import-csv` | POST | Toplu hasta CSV importu |
| `/api/export-csv` | GET | Tüm hastaları CSV'ye aktarır |
| `/api/db/stats` | GET | DB boyutu, tablo sayıları, doluluk oranı |
| `/api/db/table/{table_name}` | GET | Sayfalanmış tablo içeriği |
| `/api/health` | GET | Sistem sağlığı ve versiyon bilgisi |

---

## 7. VERİ KAYNAKLARI

| Kohort | Hasta Sayısı | Kullanım Amacı | Kaynak |
|--------|-------------|----------------|--------|
| TCGA-GBM | 260 | Model eğitim | Açık kaynak, anonimleştirilmiş |
| LUMIERE | 771 | Benzerlik araması, kalibrasyon | Klinik araştırma verisi |
| LUMIERE Doğrulama | 48 | İkincil kohort doğrulaması | Klinik araştırma verisi |
| Web Upload | Dinamik | Gerçek zamanlı hasta analizi | Klinisyen yüklemesi |
| CSV Import | Toplu | Kurumsal veri entegrasyonu | CSV formatı |

---

## 8. KLİNİK ÇIKTI ÖRNEKLERİ

### Çıktı 1 — Risk Sınıflandırma Raporu
```
Cox Risk Skoru   : 72 / 100
Risk Sınıfı      : YÜKSEK
6 Aylık Sağkalım : %38
12 Ay Kategorisi : Kritik İzlem Gerektirir
```

### Çıktı 2 — Segmentasyon Özeti
```
Whole Tumor  : 42.3 cm³
Tumor Core   : 18.7 cm³
Enhancing    : 12.1 cm³
Ödem         : 23.6 cm³
Yüzey Alanı  : 98.4 cm²
Küresellik   : 0.612
```

### Çıktı 3 — Benzer Hasta Analizi (FAISS)
```
#1  LUMIERE-0412  Benzerlik: 0.9731  Vol: 39.8 cm³  Sağkalım: 11 ay
#2  LUMIERE-0187  Benzerlik: 0.9618  Vol: 44.2 cm³  Sağkalım: 14 ay
#3  LUMIERE-0293  Benzerlik: 0.9502  Vol: 41.1 cm³  Sağkalım:  9 ay
...
```

### Çıktı 4 — RAG Klinik Özet (Claude AI)
```
Hasta profili (Yaş: 58, KPS: 80, MGMT: methylated) değerlendirildiğinde,
Stupp protokolü (TMZ + RT) standart birinci basamak tedavi olarak önerilmektedir
[PMID: 16061997]. MGMT promotör metilasyonu pozitif hastalarda Temozolomid yanıt
oranı anlamlı ölçüde artmaktadır [PMID: 26516056]. Radyomik tabanlı modellerin
GBM sağkalım tahminine katkısı prospektif çalışmalarla desteklenmektedir
[PMID: 33975139]. 3 aylık aralıklarla RANO kriterlerine göre MR değerlendirmesi
önerilmektedir.
```

### Çıktı 5 — 24 Haftalık Büyüme Projeksiyonu
```
Hafta  Hacim (cm³)  Değişim   RANO
─────  ───────────  ────────  ────
    4       44.4      +4.9%   SD
    8       46.6      +9.7%   SD
   12       48.9     +15.0%   SD
   16       51.3     +21.3%   SD
   20       53.9     +27.4%   PD  ← Progresif Hastalık
   24       56.6     +33.8%   PD
```

---

## 9. TEKNIK ÖZELLİKLER

### Modality Otomatik Algılama
Dosya adından regex tabanlı otomatik sınıflandırma:
- `t1ce` / `t1gd` / `t1c` → T1 Kontrastlı
- `t1` → T1 Ağırlıklı
- `flair` → FLAIR
- `t2` → T2 Ağırlıklı
- `seg` / `mask` → Segmentasyon maskesi

### Veritabanı Yönetimi
- Otomatik şema migrasyonu (cascade delete, sütun ekleme)
- Session tabanlı dosya yönetimi (UUID, 24 saat TTL)
- LRU cache ile NIfTI slice bellekleme (disk I/O optimizasyonu)

### Dağıtım
```
Çalıştırma  : python main.py
Port        : 8000
Veritabanı  : SQLite (gbmaid.db)
Mimarı      : Stateless (yatay ölçekleme için hazır)
```
