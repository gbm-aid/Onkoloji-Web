# GBM-AID Sistem Mimarisi — Detaylı Diyagram

## Genel Veri Akışı

```
KLİNİSYEN
    │
    │  ① MR Görüntüleri (NIfTI)    ② Klinik Form
    │     T1, T1ce, T2, FLAIR          Yaş, KPS, MGMT, IDH1...
    ▼
┌───────────────────────────────────────────────────────────┐
│                    WEB ARAYÜZÜ                            │
│               (FastAPI + Jinja2 + JS)                     │
│   ┌─────────────┐  ┌──────────────┐  ┌───────────────┐   │
│   │ Dosya       │  │ Hasta        │  │ Kohort        │   │
│   │ Yükleme     │  │ Paneli       │  │ İstatistik    │   │
│   │ + Viewer    │  │ + Tedavi     │  │ + DB Görünüm  │   │
│   └──────┬──────┘  └──────┬───────┘  └───────────────┘   │
└──────────┼────────────────┼──────────────────────────────┘
           │                │
           ▼                ▼
┌──────────────────────────────────────────────────────────┐
│                    REST API KATMANI                       │
│                   FastAPI Endpoints                       │
│                                                          │
│  /api/upload    /api/analyze    /api/patients/...        │
│  /api/slice     /api/cohort-stats   /api/export-csv      │
│  /api/health    /api/db/stats       /api/import-csv      │
└──────────┬──────────────────────────────────────────────┘
           │
    ┌──────┴──────┐
    │             │
    ▼             ▼
┌────────┐  ┌─────────────────────────────────────────────┐
│SQLite  │  │           ANALİZ MOTORU                     │
│  DB    │  │           real_analysis.py                  │
│────────│  │─────────────────────────────────────────────│
│patients│  │                                             │
│analyses│  │  ┌─────────────┐  ┌───────────────────┐    │
│treatm. │  │  │ NiBabel     │  │ Özellik Çıkarımı  │    │
└────────┘  │  │ NIfTI Parse │  │ 107 Özellik       │    │
            │  │ + LRU Cache │  │ Hacim/Şekil/Doku  │    │
            │  └──────┬──────┘  └─────────┬─────────┘    │
            │         │                   │               │
            │         ▼                   ▼               │
            │  ┌──────────────────────────────────────┐   │
            │  │         LASSO Özellik Seçimi         │   │
            │  │    107 özellik → ~30–50 özellik      │   │
            │  └──────────────────┬───────────────────┘   │
            │                     │                       │
            │         ┌───────────┼────────────┐          │
            │         ▼           ▼            ▼          │
            │  ┌──────────┐ ┌─────────┐ ┌──────────┐     │
            │  │ Cox PH   │ │XGBoost  │ │  FAISS   │     │
            │  │ Risk     │ │12 Ay    │ │ Cosine   │     │
            │  │ Skoru    │ │Sağkalım │ │ Similarity│    │
            │  │ (1–99)   │ │Sınıfı   │ │ Top-10   │     │
            │  └────┬─────┘ └────┬────┘ └────┬─────┘     │
            │       └────────────┼────────────┘           │
            │                    ▼                        │
            │  ┌─────────────────────────────────────┐    │
            │  │        RAG MODÜLÜ                   │    │
            │  │  PubMed API → Top-5 Makale          │    │
            │  │  → Claude Haiku 4.5                 │    │
            │  │  → Türkçe Klinik Özet (Kaynaklı)   │    │
            │  └─────────────────────────────────────┘    │
            └─────────────────────────────────────────────┘
                                 │
                                 ▼
            ┌────────────────────────────────────────┐
            │           RAPOR ÇIKTILARI              │
            │                                        │
            │  • Risk Skoru + Sağkalım Tahmini       │
            │  • Radyomik Profil                     │
            │  • Benzer 10 Hasta                     │
            │  • 24 Haftalık Büyüme Projeksiyonu     │
            │  • Literatür Destekli Klinik Özet      │
            │  • CSV Export                          │
            └────────────────────────────────────────┘
```

---

## Bileşen Bağımlılık Haritası

```
main.py (FastAPI App)
    ├── models.py          → SQLAlchemy ORM (Patient, Analysis, Treatment)
    ├── database.py        → SQLite bağlantı ve session yönetimi
    ├── real_analysis.py   → Analiz motoru (NiBabel, FAISS, Cox, XGBoost)
    ├── static/
    │   ├── app.js         → Tek sayfalı uygulama (SPA) mantığı
    │   └── style.css      → UI stillendirme
    └── templates/
        └── index.html     → Ana uygulama şablonu (Jinja2)
```

---

## Veri Akışı Zaman Çizelgesi

```
t=0s   Klinisyen MR dosyalarını yükler
        → session_id oluşturulur (UUID)
        → NIfTI doğrulama + modality algılama

t=1s   Segmentasyon maskesi analizi
        → Whole Tumor, Core, Enhancing hacimleri hesaplanır

t=2s   107 radyomik özellik çıkarımı
        → 4 modality × 10 yoğunluk + 3 şekil + 3 GLCM

t=3s   LASSO özellik seçimi + model kalibrasyonu
        → Cox PH risk skoru (1–99)
        → XGBoost 12 ay sınıfı

t=4s   FAISS vektör araması
        → 819 hastalık kohorttan top-10 benzer

t=5s   PubMed sorgusu (async)
        → esearch + esummary → top-5 makale

t=6s   Claude API çağrısı
        → RAG prompt → klinik özet

t=7s   Rapor oluşturma ve DB kayıt
        → report_id: GA-RPT-XXXXXXXX
        → Tüm sonuçlar analyses tablosuna kaydedilir
```
