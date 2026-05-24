# GBM-AID: Glioblastoma Multiforme Yapay Zeka Destekli Karar Destek Sistemi

## Genel Bakış

**GBM-AID**, glioblastoma multiforme (GBM) hastalarında MR görüntüleri, klinik veriler ve moleküler/epigenetik omics profillerinden yararlanarak klinisyene gerçek zamanlı, kanıta dayalı karar desteği sunan entegre bir yapay zeka sistemidir.

---

## Temel İşlevler

Sistem 6 temel işlevi yerine getirir:

| # | İşlev | Teknoloji |
|---|-------|-----------|
| 1 | MR görüntülerinden otomatik tümör segmentasyonu | nnU-Net / hazır maske |
| 2 | Radyomik özellik çıkarımı ve hasta bazlı sayısal profil oluşturma | PyRadiomics |
| 3 | Hayatta kalım risk skoru üretimi | Cox Proportional Hazards (Primary Risk Engine) |
| 4 | Benzer hasta kohort analizi | Çift FAISS vektör benzerlik araması (~771 + 48 hasta indeksi) |
| 5 | Dinamik PubMed literatür entegrasyonu ile LLM destekli klinik özet | RAG Engine |
| 6 | Moleküler/Epigenetik Omics Yorumu | TMZ direnç skoru, agresiflik profili, EGFR/PTEN/MGMT çapraz analizi *(Opsiyonel Katman — Bölüm 6.4)* |

---

## Sistem Mimarisi

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  GİRDİ KATMANI                                                                  │
│  ┌───────────────────────────────────────────┐                                  │
│  │ Hastaya Ait Çok Modlu MRG                 │                                  │
│  │ (T1, T1ce, T2, FLAIR) + Klinik Parametreler│                                │
│  └──────────────────────┬────────────────────┘                                  │
└─────────────────────────┼───────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  RADYOMİK KATMANI                                                               │
│                                                                                 │
│  ┌─────────────────────────────────┐                                            │
│  │  Veri Hazırlığı ve Özellik Çıkarımı │                                       │
│  └────────────┬────────────────────┘                                            │
│               │                                                                 │
│    ┌──────────▼──────────┐  ┌──────────────────────┐  ┌──────────────────┐    │
│    │ 1. nnU-Net          │  │ 2. PyRadiomics        │  │ 3. LASSO         │    │
│    │ Otomatik Tümör      │  │ Radyomik Özellik      │  │ Boyut İndirgeme  │    │
│    │ Segmentasyonu       │  │ Çıkarımı              │  │                  │    │
│    └──────────┬──────────┘  └──────────┬───────────┘  └────────┬─────────┘    │
└──────────────┼──────────────────────────┼─────────────────────┼───────────────┘
               │                          │                      │
               └──────────────────────────┴──────────┬───────────┘
                                                      │
              ┌───────────────────────────────────────┤
              │                                       │
              ▼                                       ▼
┌─────────────────────────┐           ┌───────────────────────────────────────┐
│  BENZER HASTA ANALİZİ   │           │  HİBRİT PROGNOSTİK MOTOR             │
│                         │           │                                       │
│  ┌─────────────────────┐│           │  ┌─────────────────────────────────┐  │
│  │ FAISS:              ││           │  │ Optimize Edilmiş Klinik +       │  │
│  │ En Benzer 10 Vaka   ││           │  │ Radyomik Vektör                 │  │
│  └──────────┬──────────┘│           │  └──────────┬──────────────────────┘  │
└─────────────┼───────────┘           │             │                         │
              │                       │   ┌──────────▼──────┐  ┌────────────┐ │
              │                       │   │ Cox PHM:        │  │ XGBoost:   │ │
              │                       │   │ Sürekli Risk    │  │ 12-Aylık   │ │
              │                       │   │ Skoru           │  │ Sağkalım   │ │
              │                       │   └──────────┬──────┘  └─────┬──────┘ │
              │                       └──────────────┼───────────────┼────────┘
              │                                      │               │
              └──────────────────────┬───────────────┘               │
                                     │     Birleştirilmiş            │
                                     │     Hasta Profili             │
                                     └───────────────┬───────────────┘
                                                     │
                    ┌────────────────────────────────┤
                    │                                │
                    ▼                                ▼
┌───────────────────────────────┐   ┌───────────────────────────────────────────┐
│  DİNAMİK LİTERATÜR MODÜLÜ    │   │  HEKİM KARAR DESTEK PANELİ (ÇIKTI)       │
│  (RAG)                        │   │                                           │
│                               │   │  ┌─────────────────────────────────────┐ │
│  ┌───────────────────────────┐│   │  │  Ana Panel                          │ │
│  │ 1. PubMed API: Canlı Arama││   │  └──────────────┬──────────────────────┘ │
│  └──────────────┬────────────┘│   │                 │                        │
│                 │             │   │   ┌─────────────▼──────┐  ┌────────────┐ │
│  ┌──────────────▼────────────┐│   │   │ Tümör Sınırları    │  │ Benzer     │ │
│  │ 2. LLM (RAG):             ││   │   │ Risk Skoru +       │  │ Hasta      │ │
│  │ PMID Kaynaklı Özet        ││   │   │ Sağkalım           │  │ Kohortu    │ │
│  └──────────────┬────────────┘│   │   └────────────────────┘  └────────────┘ │
└─────────────────┼─────────────┘   │                                          │
                  │                 │   ┌────────────────────────────────────┐  │
                  └────────────────▶│   │ Klinik Kanıt Özeti [PMID: ...]    │  │
                                    │   └────────────────────────────────────┘  │
                                    └───────────────────────────────────────────┘
```

---

## Bölüm Detayları

### 1. MR Görüntü Segmentasyonu

- **Yöntem:** nnU-Net otomatik segmentasyon veya önceden hazırlanmış maske yükleme
- **Girdi:** DICOM formatında çok modlu MR görüntüleri (T1, T1ce, T2, FLAIR)
- **Çıktı:** Tümör alt bölgelerini içeren 3D segmentasyon maskesi
  - Nekrotik çekirdek (necrotic core)
  - Peritümöral ödem (edema)
  - Aktif tümör (enhancing tumor)

### 2. Radyomik Özellik Çıkarımı

- **Araç:** PyRadiomics
- **Özellik grupları:**
  - Şekil özellikleri (Shape features)
  - Birinci derece istatistikler (First-order statistics)
  - Tekstür matrisleri: GLCM, GLRLM, GLSZM, NGTDM
- **Çıktı:** Hasta bazlı sayısal radyomik profil vektörü

### 3. Hayatta Kalım Risk Skoru

- **Model:** Cox Proportional Hazards (CPH)
- **Girdi değişkenleri:** Radyomik özellikler + klinik parametreler
- **Çıktı:**
  - Tahmini medyan sağkalım süresi
  - Risk sınıflandırması (düşük / orta / yüksek)
  - Güven aralıkları

### 4. Benzer Hasta Kohort Analizi

- **Teknoloji:** FAISS (Facebook AI Similarity Search) — vektör benzerlik araması
- **Veri tabanı:**
  - ~771 hasta indeksi (birincil kohort)
  - ~48 hasta indeksi (ikincil/doğrulama kohort)
- **İşlev:** Yeni hasta profilini mevcut hasta veritabanıyla karşılaştırarak en benzer vakaları tespit eder
- **Çıktı:** En benzer N hastanın klinik seyri ve tedavi yanıtı

### 5. RAG Engine — LLM Destekli Klinik Özet

- **Dinamik kaynak:** PubMed API entegrasyonu (gerçek zamanlı literatür tarama)
- **Yaklaşım:** Retrieval-Augmented Generation (RAG)
- **İşlev:**
  1. Hasta profiline özel PubMed sorgusu oluşturur
  2. İlgili makaleleri getirir ve vektör tabanlı sıralar
  3. LLM aracılığıyla kanıta dayalı klinik özet üretir
- **Çıktı:** Kaynaklı, hasta özelinde klinik karar desteği metni

### 6. Moleküler/Epigenetik Omics Yorumu *(Opsiyonel Katman — Bölüm 6.4)*

- **Biyobelirteçler:**
  - **MGMT** promotör metilasyon durumu → TMZ yanıt tahmini
  - **EGFR** amplifikasyonu / mutasyonu
  - **PTEN** kaybı
  - **IDH1/IDH2** mutasyon durumu
- **Çıktılar:**
  - TMZ (Temozolomid) direnç skoru
  - Tümör agresiflik profili
  - EGFR / PTEN / MGMT çapraz analiz raporu
- **Entegrasyon:** Radyomik ve klinik verilerle birleştirilmiş çok boyutlu risk değerlendirmesi

---

## Veri Akışı

```
MR Görüntüsü (DICOM)
        │
        ▼
Segmentasyon (nnU-Net)
        │
        ▼
Radyomik Özellik Çıkarımı (PyRadiomics)
        │
        ├──────────────────────────────┐
        ▼                              ▼
Klinik Veriler              Omics Profili (Opsiyonel)
        │                              │
        └──────────┬───────────────────┘
                   ▼
          Cox PH Risk Modeli
                   │
          ┌────────┴────────┐
          ▼                 ▼
   FAISS Kohort       PubMed RAG
   Benzerlik          Literatür
   Araması            Tarama
          │                 │
          └────────┬────────┘
                   ▼
          Klinik Karar Özeti
          (Klinisyen Arayüzü)
```

---

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Segmentasyon | nnU-Net |
| Radyomik | PyRadiomics |
| Vektör Arama | FAISS |
| Sağkalım Modeli | Lifelines (Cox PH) |
| Literatür | PubMed E-utilities API |
| Dil Modeli | LLM (RAG pipeline) |
| Omics Analizi | Özel biyoinformatik modül |

---

## Hedef Kullanıcılar

- Nöroşirurji uzmanları
- Tıbbi onkoloji uzmanları
- Radyasyon onkolojisi uzmanları
- Nöroradyologlar
- Tıbbi genetik uzmanları *(Omics katmanı için)*

---

## Klinik Çıktılar

GBM-AID, her hasta için aşağıdaki raporları üretir:

1. **Tümör Segmentasyon Raporu** — Hacim ölçümleri ve lokalizasyon
2. **Radyomik Profil Özeti** — Sayısal özellik vektörü ve görselleştirme
3. **Risk Sınıflandırma Raporu** — Sağkalım tahmini ve güven aralıkları
4. **Kohort Benzerlik Raporu** — En benzer hastalar ve klinik seyrler
5. **Literatür Destekli Klinik Özet** — Kaynaklı tedavi önerileri
6. **Omics Entegrasyon Raporu** *(Opsiyonel)* — Moleküler risk profili

---

> **Not:** GBM-AID bir karar **destek** sistemidir. Tüm klinik kararlar yetkili sağlık profesyonelleri tarafından verilmelidir. Sistem, klinisyenin yerini almaz; bilgi tabanlı destek sağlar.

---

## 1. Biyoteknoloji Alanı

Bu proje, erişkinlerde en sık görülen ve en agresif primer beyin tümörü olan Glioblastoma (GBM) hastalarına yönelik yapay zekâ destekli bir klinik karar destek sistemi geliştirmeyi amaçlamaktadır. Proje; **Radyoloji ve Görüntüleme Teknolojileri**, **Yapay Zekâ Destekli Yeni Nesil İlaç Geliştirme Çözümleri** ve **Tıbbi Onkoloji** şartname kategorilerinin kesişiminde konumlanmakta; sistem tanı koymamakta, hekime nicel ve açıklanabilir karar desteği sunmaktadır.

---

## 2. Proje Özeti

GBM-AID, GBM hastalarında tanı, tedavi ve takip süreçlerini desteklemek amacıyla geliştirilmekte olan yapay zekâ tabanlı bir karar destek sistemidir.

**Temel Hipotez:** Çok modlu Manyetik Rezonans Görüntüleme'den (MRG) elde edilen radyomik özellikler ile klinik verilerin birleşik analizinin, yalnızca klinik değerlendirmeye kıyasla GBM'de sağkalım tahmin doğruluğunu artıracağıdır [4,5].

**Veri Seti:** Hipotez, 260 hastayı kapsayan, açık kaynaklı ve tamamen anonimleştirilmiş TCGA-GBM (The Cancer Genome Atlas) veri seti üzerinde sınanmaktadır [6]. Etik kurul onayı gerektirmemektedir.

**Sistem Çıktıları:**
- Hasta bazında risk skoru
- 12 aylık sağkalım tahmini (Düşük / Orta / Yüksek risk kategorileri)
- Benzer hasta kohort analizi
- PubMed (Public Medline) kaynaklı güncel klinik literatür özeti

---

## 3. Sorun Tanımı

GBM, Dünya Sağlık Örgütü sınıflandırmasında **Derece 4 gliom** olarak tanımlanmaktadır. Stupp protokolü (cerrahi + radyoterapi + temozolomid kemoterapisi) 2005'ten bu yana standart tedavi olmasına karşın son 20 yılda sağkalım oranları anlamlı düzeyde iyileştirilememiş, ortalama genel sağkalım süresi hâlâ **14–15 ay** civarında kalmaktadır [1,3]. GBM hastalarının yalnızca **%7,2**'sinin tanı sonrası 5. yıla ulaşabildiği göz önüne alındığında, kişiselleştirilmiş prognostik değerlendirmeye olan gereksinimin kritik olduğu anlaşılmaktadır [1,2].

### Klinik Zorluklar

- Tümör hücrelerinin genetik, epigenetik ve metabolik düzeydeki yüksek çeşitliliği bireyler arasında belirgin seyir farklılıklarına yol açmaktadır [2,3]
- Tümörün beyin dokusuna hızla yayılması cerrahi olarak tam rezeksiyonu zorlaştırmakta ve nüksü kaçınılmaz kılmaktadır
- Mevcut klinik değerlendirme; yaş, Karnofsky Performans Skoru (KPS) ve MGMT gen promotor metilasyon durumu gibi sınırlı parametrelerle kısıtlı kalmaktadır

### Literatürde Saptanan Temel Eksiklikler

| # | Eksiklik | Açıklama |
|---|----------|----------|
| 1 | **Parçalı mimari** | GBM odaklı çalışmalar segmentasyon, radyomik analiz veya sağkalım modellemesini ayrı ayrı ele almakta; uçtan uca bütünleşik bir yapıya literatürde rastlanmamıştır |
| 2 | **Açıklanabilirlik eksikliği** | Derin öğrenme modellerinin kara kutu yapısı, klinik uygulamaya güvenli entegrasyonu zorlaştırmaktadır [8] |
| 3 | **Statik literatür** | Mevcut karar destek sistemleri sabit veri tabanlarına dayalı çalışmakta ve hastaya özgü, güncel kanıt üretememektedir [9] |

---

## 4. Çözüm

GBM-AID, dört temel bileşeni tek bir bütünleşik sistemde bir araya getirmektedir.

### 4.1 MRG Segmentasyonu ve Radyomik Analiz

- **nnU-Net** (no-new-U-Net: kendi kendini uyarlayan tıbbi görüntü segmentasyon mimarisi) derin öğrenme modeli; T1, T1 kontrastlı, T2 ve FLAIR (Fluid-Attenuated Inversion Recovery) görüntülerinden tümör maskesi üretmektedir
- **PyRadiomics** kütüphanesi ile tümör hacmi, şekil ve doku özellikleri dahil **107 radyomik özellik** çıkarılmaktadır
- **LASSO** (Least Absolute Shrinkage and Selection Operator) regularizasyonu ile klinik açıdan anlamlı özellik alt kümesi belirlenmektedir [4,5]

### 4.2 Hibrit Prognostik Motor

| Model | Görev | Hedef Metrik |
|-------|-------|--------------|
| Cox Orantılı Hazard Modeli | Zamana bağlı risk skoru üretimi | Uyum İndeksi ≥ 0,70 |
| XGBoost sınıflandırıcısı | 12 aylık sağkalım kategori tahmini | AUC ≥ 0,75 |

Bu kombinasyon, yalnızca istatistiksel veya yalnızca kara kutu yaklaşımların ötesinde açıklanabilir bir prognostik çıktı sunmaktadır [7,8].

### 4.3 Benzer Hasta Analizi

Vektör benzerlik algoritması aracılığıyla **en yakın 10 hastanın** tedavi yolları ve sağkalım metrikleri eşleştirilmektedir.

### 4.4 Dinamik Literatür Modülü

Her sorguda **PubMed API** üzerinden canlı literatür taranarak hasta profiline özgü, kaynak doğrulamalı klinik özet üretilmektedir [9].

### 4.5 Ek Özellikler

- Risk skoruna bağlı **6 aylık tümör hacim projeksiyonu**
- **RANO** (Yüksek Dereceli Gliom Yanıt Değerlendirme) kriterleri ile volumetrik takip desteği [10]
