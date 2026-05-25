# GBM-AID Frontend Entegrasyon Rehberi

## Dosya Yapısı

Mevcut `Onkoloji Web/` klasörünüze şu dosyaları kopyalayın:

```
Onkoloji Web/
├── templates/
│   └── index.html          ← YENİ (eski index.html'i değiştirir)
├── static/
│   ├── styles.css           ← YENİ (eski style.css'i değiştirir)
│   ├── api-client.js        ← YENİ (API wrapper + mock fallback)
│   ├── mock-data.js         ← YENİ (fallback veriler)
│   ├── tweaks-panel.jsx     ← YENİ
│   ├── visualizations.jsx   ← YENİ
│   ├── shared-ui.jsx        ← YENİ
│   ├── enhanced-viewer.jsx  ← YENİ
│   ├── analysis-page.jsx    ← YENİ
│   ├── dashboard-page.jsx   ← YENİ
│   ├── compare-page.jsx     ← YENİ
│   ├── other-pages.jsx      ← YENİ
│   └── app.jsx              ← YENİ (eski app.js'i değiştirir)
├── main.py                  ← GÜNCELLE (yeni endpoint'leri ekle)
└── ... (diğer dosyalar aynen kalır)
```

## Adımlar

### 1. Yedek Al
```bash
cp templates/index.html templates/index.html.bak
cp static/style.css static/style.css.bak
cp static/app.js static/app.js.bak
```

### 2. Dosyaları Kopyala
`integration/templates/` → `templates/`
`integration/static/` → `static/`

### 3. Backend Güncelle
`api_additions.py` dosyasındaki endpoint'leri `main.py`'a ekleyin.
(Dosyanın sonuna, mevcut route'lardan sonra yapıştırın.)

### 4. Çalıştır
```bash
python main.py
```
Tarayıcıda `http://localhost:8000` açın.

## Yeni API Endpoint'leri

| Endpoint | Metod | Açıklama |
|----------|-------|----------|
| `/api/dashboard` | GET | Dashboard KPI'ları, son analizler, aktivite |
| `/api/patients/{id}/timeline` | GET | Hasta zaman çizelgesi (analiz + tedavi) |
| `/api/compare` | GET | Birden fazla hasta karşılaştırma verisi |

## Mock Fallback

API erişilemezse frontend otomatik olarak `mock-data.js`'teki
örnek verilerle çalışır. Bu sayede backend olmadan da UI test
edilebilir.
