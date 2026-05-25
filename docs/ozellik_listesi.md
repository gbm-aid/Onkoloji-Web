# GBM-AID — 107 Radyomik Özellik Kataloğu

Tüm özellikler NIfTI segmentasyon maskesinden ve 4 MR modalitesinden otomatik çıkarılır.

---

## GRUP 1 — HACİM ÖZELLİKLERİ (4 Özellik)

| # | Özellik Adı | Birim | Tanım |
|---|-------------|-------|-------|
| 1 | `tumor_volume_cm3` | cm³ | Whole Tumor hacmi (Label 1+2+4) |
| 2 | `core_volume_cm3` | cm³ | Tumor Core hacmi (Label 1+4) |
| 3 | `enhancing_volume_cm3` | cm³ | Kontrast-tutan bölge hacmi (T1ce intensitesine dayalı) |
| 4 | `edema_volume_cm3` | cm³ | Peritümöral ödem hacmi (Whole - Core) |

---

## GRUP 2 — ŞEKİL ÖZELLİKLERİ (3 Özellik)

| # | Özellik Adı | Aralık | Tanım |
|---|-------------|--------|-------|
| 5 | `surface_area_cm2` | cm² | Tümör dış yüzey alanı |
| 6 | `sphericity` | 0 – 1 | Küresellik indeksi; 1 = mükemmel küre |
| 7 | `compactness` | 0 – 1 | Sphericity²; sıkılık ölçüsü |

---

## GRUP 3 — YOĞUNLUK ÖZELLİKLERİ (4 Modality × 10 = 40 Özellik)

Her MR modalitesi (FLAIR, T1ce, T1, T2) için aşağıdaki 10 özellik hesaplanır.

### FLAIR Modalitesi (#8–17)

| # | Özellik Adı | Tanım |
|---|-------------|-------|
| 8  | `flair_mean`     | Tümör içi FLAIR sinyal ortalaması |
| 9  | `flair_std`      | Standart sapma (heterojenite ölçüsü) |
| 10 | `flair_median`   | Medyan değer (robust merkezi eğilim) |
| 11 | `flair_skewness` | Çarpıklık (dağılım asimetrisi) |
| 12 | `flair_kurtosis` | Basıklık (kuyruk ağırlığı) |
| 13 | `flair_entropy`  | Shannon entropisi (doku karmaşıklığı) |
| 14 | `flair_energy`   | Enerji (homojenite miktarı) |
| 15 | `flair_p10`      | 10. yüzdelik değer |
| 16 | `flair_p90`      | 90. yüzdelik değer |
| 17 | `flair_range`    | Min-Max aralığı |

### T1ce Modalitesi (#18–27)

| # | Özellik Adı | Tanım |
|---|-------------|-------|
| 18 | `t1ce_mean`     | T1ce sinyal ortalaması (enhancing bölge aktivitesi) |
| 19 | `t1ce_std`      | Standart sapma |
| 20 | `t1ce_median`   | Medyan değer |
| 21 | `t1ce_skewness` | Çarpıklık |
| 22 | `t1ce_kurtosis` | Basıklık |
| 23 | `t1ce_entropy`  | Shannon entropisi |
| 24 | `t1ce_energy`   | Enerji |
| 25 | `t1ce_p10`      | 10. yüzdelik değer |
| 26 | `t1ce_p90`      | 90. yüzdelik değer |
| 27 | `t1ce_range`    | Min-Max aralığı |

### T1 Modalitesi (#28–37)

| # | Özellik Adı | Tanım |
|---|-------------|-------|
| 28 | `t1_mean`     | T1 sinyal ortalaması (anatomik bazlı) |
| 29 | `t1_std`      | Standart sapma |
| 30 | `t1_median`   | Medyan değer |
| 31 | `t1_skewness` | Çarpıklık |
| 32 | `t1_kurtosis` | Basıklık |
| 33 | `t1_entropy`  | Shannon entropisi |
| 34 | `t1_energy`   | Enerji |
| 35 | `t1_p10`      | 10. yüzdelik değer |
| 36 | `t1_p90`      | 90. yüzdelik değer |
| 37 | `t1_range`    | Min-Max aralığı |

### T2 Modalitesi (#38–47)

| # | Özellik Adı | Tanım |
|---|-------------|-------|
| 38 | `t2_mean`     | T2 sinyal ortalaması (ödem/nekroz ayrımı) |
| 39 | `t2_std`      | Standart sapma |
| 40 | `t2_median`   | Medyan değer |
| 41 | `t2_skewness` | Çarpıklık |
| 42 | `t2_kurtosis` | Basıklık |
| 43 | `t2_entropy`  | Shannon entropisi |
| 44 | `t2_energy`   | Enerji |
| 45 | `t2_p10`      | 10. yüzdelik değer |
| 46 | `t2_p90`      | 90. yüzdelik değer |
| 47 | `t2_range`    | Min-Max aralığı |

---

## GRUP 4 — DOKU ÖZELLİKLERİ / GLCM (3 Özellik)

Gray-Level Co-occurrence Matrix (Gri Seviye Birlikte Oluşum Matrisi) tabanlı doku analizi.

| # | Özellik Adı | Aralık | Tanım |
|---|-------------|--------|-------|
| 48 | `contrast` | ≥ 0 | Komşu piksel çiftleri arasındaki yoğunluk farkının karesi; yüksek = kaba doku |
| 49 | `homogeneity` | 0 – 1 | GLCM diyagonaline yakınlık; yüksek = homojen doku |
| 50 | `correlation` | -1 – 1 | Uzamsal piksel korelasyonu; yüksek = düzenli örüntü |

---

## GRUP 5 — ÇAPRAZ MODALİTE İLİŞKİ ÖZELLİKLERİ (57 Özellik)

Her modality çifti için hesaplanan istatistiksel ilişki ölçüleri:

| Modalite Çifti | Özellikler (×19 çift = 57 özellik) |
|----------------|-------------------------------------|
| FLAIR × T1ce | ratio_mean, ratio_std, diff_entropy, ... |
| FLAIR × T1   | ratio_mean, ratio_std, diff_entropy, ... |
| FLAIR × T2   | ratio_mean, ratio_std, diff_entropy, ... |
| T1ce × T1    | ratio_mean, ratio_std, diff_entropy, ... |
| T1ce × T2    | ratio_mean, ratio_std, diff_entropy, ... |
| T1 × T2      | ratio_mean, ratio_std, diff_entropy, ... |

---

## LASSO Özellik Seçimi Sonrası

107 özellikten prognostik değeri en yüksek **~30–50 özellik** seçilir. Klinik açıdan en sık seçilen özellikler:

| Özellik | Klinik Anlam |
|---------|-------------|
| `tumor_volume_cm3` | Rezeksiyon kapsamı ile ilişkili |
| `t1ce_entropy` | Tümör heterojenitesi (agresiflik) |
| `sphericity` | Düzensiz sınırlı tümörler daha agresif |
| `flair_mean` | Ödem yükü |
| `t1ce_mean` | Kan-beyin bariyeri bütünlüğü kaybı |
| `core_volume_cm3` | Nekroz oranı (kötü prognoz) |
| `contrast` (GLCM) | Doku kaba yapısı |
| `t2_entropy` | Peritümöral bölge karmaşıklığı |
