/* GBM-AID Mock Data
   NOT: Hayalet "Patient-042..091" listesi kaldırıldı (gerçek DB TCGA-XX-XXXX kullanıyor).
   Boş şema fallback'i — backend ulaşılamadığında records sayfası boş gözükür.
   "Analizi Başlat" demo akışı kendi DEMO_PATIENT şablonunu analysis-page.jsx'te tutuyor. */
const MOCK_PATIENTS = [];

const MOCK_SIMILAR_PATIENTS = [
  { id: "TCGA-06-0137", similarity: 0.94, tumor_volume_cm3: 32.1, core_volume_cm3: 7.8, modalities: ["T1","T1ce","T2","FLAIR"] },
  { id: "TCGA-02-0034", similarity: 0.91, tumor_volume_cm3: 36.5, core_volume_cm3: 9.2, modalities: ["T1","T1ce","FLAIR"] },
  { id: "TCGA-08-0246", similarity: 0.89, tumor_volume_cm3: 29.8, core_volume_cm3: 6.4, modalities: ["T1","T1ce","T2","FLAIR"] },
  { id: "TCGA-12-0178", similarity: 0.87, tumor_volume_cm3: 38.2, core_volume_cm3: 11.3, modalities: ["T1ce","T2","FLAIR"] },
  { id: "TCGA-06-0211", similarity: 0.85, tumor_volume_cm3: 31.4, core_volume_cm3: 8.9, modalities: ["T1","T1ce","T2","FLAIR"] },
  { id: "TCGA-14-0089", similarity: 0.83, tumor_volume_cm3: 42.1, core_volume_cm3: 13.2, modalities: ["T1","T1ce","T2"] },
  { id: "TCGA-02-0115", similarity: 0.81, tumor_volume_cm3: 27.3, core_volume_cm3: 5.6, modalities: ["T1","T1ce","T2","FLAIR"] },
  { id: "TCGA-06-0190", similarity: 0.79, tumor_volume_cm3: 35.8, core_volume_cm3: 10.1, modalities: ["T1ce","FLAIR"] },
  { id: "TCGA-08-0352", similarity: 0.77, tumor_volume_cm3: 44.6, core_volume_cm3: 15.7, modalities: ["T1","T1ce","T2","FLAIR"] },
  { id: "TCGA-14-0234", similarity: 0.75, tumor_volume_cm3: 30.2, core_volume_cm3: 7.1, modalities: ["T1","T1ce","T2","FLAIR"] },
];

const MOCK_LITERATURE = {
  source: "pubmed",
  terms: ["glioblastoma", "MGMT methylation", "survival prediction", "radiomics"],
  summary: "Güncel literatür, MGMT promotör metilasyonu pozitif GBM hastalarında temozolomid bazlı kemoterapiye anlamlı düzeyde daha iyi yanıt alındığını desteklemektedir. Radyomik özellikler ile klinik parametrelerin birleşik analizi, yalnızca klinik değerlendirmeye kıyasla sağkalım tahmin doğruluğunu artırmaktadır (C-index: 0.74 vs 0.65). Özellikle tümör heterojenite indeksi ve nekrotik komponent oranı bağımsız prognostik faktörler olarak öne çıkmaktadır.",
  refs: [
    { pmid: "38245671", title: "Radiomics-based survival prediction in glioblastoma: a multi-center validation study", journal: "Neuro-Oncology", year: 2024 },
    { pmid: "37891234", title: "MGMT promoter methylation and treatment response in newly diagnosed GBM patients", journal: "Journal of Clinical Oncology", year: 2024 },
    { pmid: "37654321", title: "Integrated clinical-radiomic model for personalized GBM prognosis", journal: "The Lancet Oncology", year: 2023 },
    { pmid: "36987654", title: "Machine learning approaches for glioblastoma survival estimation", journal: "Nature Medicine", year: 2023 },
  ]
};

const MOCK_PROJECTION = [
  { week: "0", volume_cm3: 34.8, change_pct: 0, rano: "Baseline" },
  { week: "4", volume_cm3: 36.2, change_pct: 4, rano: "SD" },
  { week: "8", volume_cm3: 38.9, change_pct: 11.8, rano: "SD" },
  { week: "12", volume_cm3: 42.1, change_pct: 21, rano: "SD" },
  { week: "16", volume_cm3: 47.8, change_pct: 37.4, rano: "PD" },
  { week: "20", volume_cm3: 55.3, change_pct: 58.9, rano: "PD" },
  { week: "24", volume_cm3: 64.2, change_pct: 84.5, rano: "PD" },
];

const MOCK_RISK_FACTORS = [
  { factor: "Yaş (58)", impact: 0.42, direction: "high" },
  { factor: "KPS Skoru (80)", impact: -0.25, direction: "low" },
  { factor: "MGMT Metile", impact: -0.38, direction: "low" },
  { factor: "IDH1 Wildtype", impact: 0.31, direction: "high" },
  { factor: "Tümör Hacmi (34.8 cm³)", impact: 0.35, direction: "high" },
  { factor: "Nekrotik Oran (%23.6)", impact: 0.22, direction: "high" },
  { factor: "GTR Cerrahi", impact: -0.44, direction: "low" },
  { factor: "Sferiklik (0.72)", impact: -0.15, direction: "low" },
];

const MOCK_COHORT_STATS = {
  total_patients: 312,
  analyzed: 247,
  avg_risk: 52,
  avg_surv: 61.3,
  risk_dist: { low: 89, medium: 118, high: 105 },
  age_bins: { "20-39": 28, "40-49": 52, "50-59": 94, "60-69": 98, "70+": 40 },
  mgmt_dist: { methylated: 134, unmethylated: 148, unknown: 30 },
  idh1_dist: { mutant: 38, wildtype: 248, unknown: 26 },
};

const MOCK_UPLOADED_FILES = [
  { filename: "Patient-042_t1.nii.gz", modality: "T1", modality_label: "T1", confidence: 99, shape: [155, 240, 240] },
  { filename: "Patient-042_t1ce.nii.gz", modality: "T1ce", modality_label: "T1 Kontrastlı", confidence: 99, shape: [155, 240, 240] },
  { filename: "Patient-042_t2.nii.gz", modality: "T2", modality_label: "T2", confidence: 99, shape: [155, 240, 240] },
  { filename: "Patient-042_flair.nii.gz", modality: "FLAIR", modality_label: "FLAIR", confidence: 99, shape: [155, 240, 240] },
  { filename: "Patient-042_seg.nii.gz", modality: "SEG", modality_label: "Segmentasyon", confidence: 95, shape: [155, 240, 240] },
];

// Kaplan-Meier — gerçekçi kohort verisi: her hasta için olay/sansür zamanı.
// Weibull tabanlı deterministik üretici (seed sabit → her render aynı eğri).
function _kmSeededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}
function _kmGenerate(n, medianMonths, censorRate, seed, maxFollowup = 30) {
  const rand = _kmSeededRand(seed);
  const k = 1.35;
  const lambda = medianMonths / Math.pow(Math.log(2), 1 / k);
  const events = [], censored = [];
  for (let i = 0; i < n; i++) {
    const u = Math.max(1e-4, rand());
    const t_death = lambda * Math.pow(-Math.log(1 - u), 1 / k);
    const t_censor = maxFollowup * (0.45 + 0.55 * rand());
    const willCensor = rand() < censorRate;
    if (willCensor && t_censor < t_death) {
      censored.push(+t_censor.toFixed(2));
    } else if (t_death > maxFollowup) {
      censored.push(maxFollowup);
    } else {
      events.push(+t_death.toFixed(2));
    }
  }
  events.sort((a, b) => a - b);
  censored.sort((a, b) => a - b);
  return { n0: n, events, censored };
}

const MOCK_KM_CURVES = [
  Object.assign({ label: 'Düşük Risk', color: '#15803d' },
    _kmGenerate(96, 22.5, 0.32, 17)),
  Object.assign({ label: 'Orta Risk', color: '#b45309' },
    _kmGenerate(118, 13.8, 0.22, 41)),
  Object.assign({ label: 'Yüksek Risk', color: '#b91c1c' },
    _kmGenerate(105, 7.2, 0.12, 73)),
];

// Tumor volume timeline for selected patient (with treatment events)
const MOCK_TUMOR_TIMELINE = {
  data: [
    { week: 0, volume: 34.8 },
    { week: 4, volume: 18.2 },  // post-surgery
    { week: 8, volume: 14.5 },  // RT response
    { week: 12, volume: 12.1 },
    { week: 16, volume: 11.8 },
    { week: 20, volume: 13.4 },
    { week: 24, volume: 16.2 },
  ],
  events: [
    { week: 2, label: 'GTR', type: 'surgery' },
    { week: 5, label: 'RT+TMZ', type: 'treatment' },
    { week: 14, label: 'TMZ', type: 'treatment' },
    { week: 20, label: 'PD?', type: 'progression' },
  ]
};

// Dashboard stats
const MOCK_DASHBOARD = {
  thisMonth: { newPatients: 12, completedAnalyses: 8, pendingReviews: 3, highRiskAlerts: 4 },
  weeklyActivity: [3, 5, 2, 8, 6, 9, 4, 7, 5, 11, 8, 6],
  recentPatients: ['Patient-042', 'Patient-123', 'Patient-091', 'Patient-034', 'Patient-078'],
  survivalSparkline: [62, 58, 65, 71, 68, 73, 70, 75, 72],
  riskSparkline: [55, 58, 52, 60, 57, 53, 51, 49, 52],
};

// Radiomic features (normalized 0-1) for radar chart
const MOCK_RADIOMIC_FEATURES = {
  'Patient-042': {
    'Sferiklik': 0.72,
    'Yüzey/Hacim': 0.65,
    'Heterojenite': 0.58,
    'Enhancing/Whole': 0.36,
    'Nekrotik/Whole': 0.24,
    'GLCM Kontrast': 0.71,
    'Şekil': 0.62,
    'Tekstür': 0.55,
  },
  'Patient-017': {
    'Sferiklik': 0.81,
    'Yüzey/Hacim': 0.45,
    'Heterojenite': 0.32,
    'Enhancing/Whole': 0.32,
    'Nekrotik/Whole': 0.17,
    'GLCM Kontrast': 0.42,
    'Şekil': 0.78,
    'Tekstür': 0.38,
  },
};

window.MOCK = {
  patients: MOCK_PATIENTS,
  similarPatients: MOCK_SIMILAR_PATIENTS,
  literature: MOCK_LITERATURE,
  projection: MOCK_PROJECTION,
  riskFactors: MOCK_RISK_FACTORS,
  cohortStats: MOCK_COHORT_STATS,
  uploadedFiles: MOCK_UPLOADED_FILES,
  kmCurves: MOCK_KM_CURVES,
  tumorTimeline: MOCK_TUMOR_TIMELINE,
  dashboard: MOCK_DASHBOARD,
  radiomicFeatures: MOCK_RADIOMIC_FEATURES,
};
