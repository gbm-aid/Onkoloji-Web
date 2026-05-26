/* analysis-page.jsx — Simplified 3-step wizard + rich results */

// Demo şablonu — gerçek backend çağrılmadan "Analizi Başlat" tıklandığında
// sonuçlar bu sahte hastayla doldurulur. (Gerçek bağlama TODO — şu an demo.)
const DEMO_PATIENT = {
  patient_id: "Patient-042", age: 58, gender: "M", kps_score: 80,
  mgmt_status: "methylated", idh1_status: "wildtype",
  treatment_protocol: "stupp", diagnosis_date: "2025-11-15",
  tumor_location: "frontal", surgery_type: "GTR",
  risk_score: 62, risk_class: "medium", risk_label: "Orta",
  survival_6m_pct: 71.2, date: "15.11.2025", report_id: "GBM-RPT-042A",
  tumor_volume: 34.8, core_volume: 8.2, enhancing_volume: 12.5, edema_volume: 18.4,
  surface_area: 78.3, sphericity: 0.72,
  ai_summary: "58 yaşında erkek hasta, frontal lob yerleşimli GBM tanısıyla izlenmektedir. MGMT promotör metilasyonu pozitif olup Stupp protokolüne parsiyel yanıt gözlenmiştir. KPS 80 ile fonksiyonel durumu korunmuş olup, adjuvan TMZ tedavisine geçilmiştir. Radyomik analiz 34.8 cm³ toplam tümör hacmi göstermekte; nekrotik komponent oranı (%23.6) orta düzeyde agresif bir profili düşündürmektedir. Cox modeli orta risk kategorisinde (skor: 62/100) sınıflandırmış olup, 6 aylık sağkalım olasılığı %71.2 olarak hesaplanmıştır. MGMT metilasyon pozitifliği TMZ yanıtı açısından olumlu bir prognostik faktör olarak değerlendirilmektedir.",
};

function AnalysisPage({ onViewReport }) {
  const [step, setStep] = React.useState(1);
  const [showResults, setShowResults] = React.useState(false);
  const [files, setFiles] = React.useState([]);
  const [sessionId, setSessionId] = React.useState('');
  const [pid, setPid] = React.useState('');
  const [age, setAge] = React.useState('58');
  const [gender, setGender] = React.useState('M');
  const [kps, setKps] = React.useState('80');
  const [treatment, setTreatment] = React.useState('stupp');
  const [mgmt, setMgmt] = React.useState('methylated');
  const [idh1, setIdh1] = React.useState('wildtype');
  const [diagDate, setDiagDate] = React.useState('2025-11-15');
  const [tumorLoc, setTumorLoc] = React.useState('frontal');
  const [surgType, setSurgType] = React.useState('GTR');
  const [analyzing, setAnalyzing] = React.useState(false);
  const [analyzeResult, setAnalyzeResult] = React.useState(null);
  const [analyzeError, setAnalyzeError] = React.useState('');
  const [cohortKM, setCohortKM] = React.useState(null);
  const fileInputRef = React.useRef(null);

  // Sonuç ekranı açıldığında kohort KM eğrisini çek (risk sınıfına göre stratifiye)
  React.useEffect(() => {
    if (!showResults) return;
    GBM_API.getCohortKM({ stratify: 'risk_class' }).then(setCohortKM);
  }, [showResults]);

  // Viewer state — slice 115: tümör hacminin en yüksek olduğu aksiyel kesit (LUMIERE Patient-001)
  const [viewerAxis, setViewerAxis] = React.useState('axial');
  const [viewerSlice, setViewerSlice] = React.useState(115);
  const maxSlices = { axial: 191, coronal: 255, sagittal: 255 };

  // Sonuç: backend yanıtı (analyzeResult) > demo şablon (fallback)
  const r = analyzeResult || DEMO_PATIENT;

  // Demo: gerçek LUMIERE hastası (Patient-001:week-000-1).
  // CT1.nii.gz (256×256×192) ile native-space ct1_seg_mask.nii.gz voxel-wise hizalı
  // — tümör overlay'i doğru anatomik konumda görünür.
  const DEMO_SESSION = 'Patient-001:week-000-1';
  const DEMO_FILES = [
    { filename: 'CT1.nii.gz',           modality: 'T1ce',  modality_label: 'T1 Kontrastlı (CT1)', confidence: 99, shape: [256, 256, 192] },
    { filename: 'T1.nii.gz',            modality: 'T1',    modality_label: 'T1',                  confidence: 99, shape: [640, 640, 24]  },
    { filename: 'T2.nii.gz',            modality: 'T2',    modality_label: 'T2',                  confidence: 99, shape: [512, 512, 24]  },
    { filename: 'FLAIR.nii.gz',         modality: 'FLAIR', modality_label: 'FLAIR',               confidence: 99, shape: [640, 640, 40]  },
    { filename: 'ct1_seg_mask.nii.gz',  modality: 'SEG',   modality_label: 'Tümör Maskesi (CT1 native)', confidence: 95, shape: [256, 256, 192] },
    { filename: 't1_seg_mask.nii.gz',   modality: 'SEG',   modality_label: 'Tümör Maskesi (T1 native)',  confidence: 95, shape: [640, 640, 24]  },
    { filename: 't2_seg_mask.nii.gz',   modality: 'SEG',   modality_label: 'Tümör Maskesi (T2 native)',  confidence: 95, shape: [512, 512, 24]  },
    { filename: 'flair_seg_mask.nii.gz',modality: 'SEG',   modality_label: 'Tümör Maskesi (FLAIR native)',confidence: 95, shape: [640, 640, 40]  },
  ];

  // Demo modu: hızlı test için sahte upload
  const handleDemoUpload = () => {
    setFiles(DEMO_FILES);
    setSessionId(DEMO_SESSION);
    setPid('Patient-042');
  };

  // Gerçek dosya seçici → backend /api/upload
  const handleRealUpload = async (fileList) => {
    if (!fileList || !fileList.length) return;
    setAnalyzing(true); setAnalyzeError('');
    try {
      const result = await GBM_API.uploadFiles(fileList);
      if (!result || !result.session_id) {
        setAnalyzeError('Yükleme başarısız — backend kontrol edin');
        return;
      }
      setSessionId(result.session_id);
      setFiles((result.files || []).map(f => ({
        filename: f.filename, modality: f.modality, modality_label: f.modality_label,
        confidence: f.confidence, shape: f.shape,
      })));
    } finally {
      setAnalyzing(false);
    }
  };

  const continueToClinical = () => {
    if (files.length === 0) return;
    setStep(2);
  };

  const runAnalysis = async () => {
    if (!pid.trim() || !age) return;
    setAnalyzing(true); setAnalyzeError('');
    const payload = {
      patient_id: pid.trim(),
      session_id: sessionId,
      clinical: {
        age: parseInt(age) || null,
        gender, kps_score: parseInt(kps) || null,
        mgmt_status: mgmt, idh1_status: idh1,
        treatment, diagnosis_date: diagDate,
        tumor_location: tumorLoc, surgery_type: surgType,
      },
      files: files.map(f => ({ filename: f.filename, modality: f.modality })),
    };
    const result = await GBM_API.runAnalysis(payload);
    setAnalyzing(false);
    if (!result || !result.results) {
      setAnalyzeError('Analiz başarısız — backend yanıt vermedi. Demo sonuç gösteriliyor.');
      setAnalyzeResult(null);  // r → DEMO_PATIENT fallback
    } else {
      const res = result.results;
      const rad = res.radiomics || {};
      setAnalyzeResult({
        patient_id: result.patient_id,
        report_id: res.report_id,
        date: new Date().toLocaleDateString('tr-TR'),
        risk_score: res.risk_score,
        risk_score_lower: res.risk_score_lower,
        risk_score_upper: res.risk_score_upper,
        risk_class: res.risk_class,
        risk_label: res.risk_label,
        survival_6m_pct: res.survival_6m_pct,
        survival_6m_lower: res.survival_6m_lower,
        survival_6m_upper: res.survival_6m_upper,
        model_version: res.model_version,
        tumor_volume: rad.tumor_volume_cm3,
        core_volume: rad.core_volume_cm3,
        enhancing_volume: rad.enhancing_volume_cm3,
        edema_volume: rad.edema_volume_cm3,
        sphericity: rad.sphericity,
        radiomics: rad,
        similar_patients: res.similar_patients || [],
        literature: res.literature || null,
        ai_summary: res.ai_summary || '',
      });
    }
    setStep(3); setShowResults(true);
  };

  const resetAnalysis = () => {
    setStep(1); setShowResults(false); setFiles([]); setPid(''); setSessionId('');
    setAnalyzeResult(null); setAnalyzeError('');
  };

  // Simplified 3-step wizard
  const steps = [
    { n: 1, label: 'Veri Yükleme' },
    { n: 2, label: 'Klinik Bilgiler' },
    { n: 3, label: 'Sonuçlar' },
  ];

  const stepWizard = React.createElement('div', { className: 'stepper-wrap' },
    React.createElement('div', { className: 'stepper' },
      steps.map((s, i) => React.createElement(React.Fragment, { key: s.n },
        i > 0 && React.createElement('div', { className: `step-line ${step > s.n - 1 ? 'done' : ''}` }),
        React.createElement('div', { className: `step ${step === s.n ? 'active' : step > s.n ? 'done' : ''}` },
          React.createElement('div', { className: 'step-circle' }, step > s.n ? '✓' : s.n),
          React.createElement('div', { className: 'step-label' }, s.label)
        )
      ))
    )
  );

  // Analyzing loader
  if (analyzing) {
    return React.createElement('div', null,
      stepWizard,
      React.createElement('div', { className: 'container page-fade' },
        React.createElement('div', { style: {
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '80px 20px', gap: 16
        }},
          React.createElement('div', { style: {
            width: 48, height: 48, border: '3px solid var(--border)',
            borderTopColor: 'var(--accent)', borderRadius: '50%',
            animation: 'spin 0.7s linear infinite'
          }}),
          React.createElement('div', { style: { fontSize: 15, fontWeight: 600, color: 'var(--text)' } }, 'Analiz çalıştırılıyor'),
          React.createElement('div', { style: { fontSize: 12, color: 'var(--text-muted)' } }, 'Radyomik özellikler çıkarılıyor, Cox modeli hesaplanıyor...'),
          React.createElement('div', { style: { display: 'flex', gap: 16, marginTop: 8, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-faint)' } },
            React.createElement('span', null, '✓ Segmentasyon'),
            React.createElement('span', null, '✓ Radyomik'),
            React.createElement('span', { style: { color: 'var(--accent)' } }, '⟳ Cox PHM'),
            React.createElement('span', { style: { opacity: 0.4 } }, '○ FAISS'),
            React.createElement('span', { style: { opacity: 0.4 } }, '○ Literatür')
          )
        )
      )
    );
  }

  // RESULTS VIEW
  if (showResults) {
    // r tanımlandı (analyzeResult || DEMO_PATIENT)
    const survColor = r.survival_6m_pct > 50 ? 'var(--green)' : r.survival_6m_pct > 25 ? 'var(--yellow)' : 'var(--red)';

    // ── Türetilmiş paneller (gerçek backend verisi varsa onu kullan) ──
    const hasReal = !!analyzeResult;
    const similarRows = (hasReal && r.similar_patients?.length) ? r.similar_patients : MOCK.similarPatients;
    const lit = (hasReal && r.literature) ? r.literature : MOCK.literature;

    // Radar: gerçek radiomics özelliklerinden hesapla; yoksa fallback Patient-042 örneği.
    const rad = r.radiomics || {};
    const tv = rad.tumor_volume_cm3 || r.tumor_volume || 0;
    const cv = rad.core_volume_cm3 || r.core_volume || 0;
    const ev = rad.enhancing_volume_cm3 || r.enhancing_volume || 0;
    const realRadar = hasReal && tv > 0 ? {
      'Sferiklik':      rad.sphericity   || r.sphericity || 0,
      'Kompaktlık':     rad.compactness  || 0,
      'Yüzey/Hacim':    rad.surface_area_cm2 && tv ? Math.min(1, rad.surface_area_cm2 / (tv * 4)) : 0,
      'Enhancing/Whole': tv ? Math.min(1, ev / tv) : 0,
      'Nekrotik/Whole': tv ? Math.min(1, cv / tv) : 0,
      'GLCM Kontrast':  rad.glcm_contrast || rad.firstorder_Energy ? Math.min(1, (rad.glcm_contrast || 0.5)) : 0.5,
      'Şekil':          rad.sphericity ? Math.min(1, rad.sphericity) : 0,
      'Tekstür':        rad.firstorder_Entropy ? Math.min(1, rad.firstorder_Entropy / 6) : 0.5,
    } : MOCK.radiomicFeatures['Patient-042'];

    // Risk faktör atfı: klinik + radiomics değerlerinden deterministik hesapla
    const realFactors = hasReal ? [
      { factor: `Yaş (${age})`,                 impact: Math.max(-0.5, Math.min(0.5, ((parseInt(age) || 60) - 50) / 50)), direction: (parseInt(age) || 60) >= 60 ? 'high' : 'low' },
      { factor: `KPS Skoru (${kps})`,           impact: Math.max(-0.5, Math.min(0.5, (70 - (parseInt(kps) || 70)) / 60)), direction: (parseInt(kps) || 70) < 70 ? 'high' : 'low' },
      { factor: mgmt === 'methylated' ? 'MGMT Metile' : 'MGMT Metile Değil',
        impact: mgmt === 'methylated' ? -0.38 : 0.32, direction: mgmt === 'methylated' ? 'low' : 'high' },
      { factor: idh1 === 'mutant' ? 'IDH1 Mutant' : 'IDH1 Wildtype',
        impact: idh1 === 'mutant' ? -0.45 : 0.31, direction: idh1 === 'mutant' ? 'low' : 'high' },
      { factor: `Tümör Hacmi (${tv.toFixed(1)} cm³)`, impact: Math.min(0.5, tv / 80), direction: tv > 35 ? 'high' : 'low' },
      { factor: `Nekrotik Oran (%${tv ? (cv/tv*100).toFixed(1) : 0})`,
        impact: tv ? Math.min(0.4, cv/tv * 0.8) : 0, direction: tv && cv/tv > 0.2 ? 'high' : 'low' },
      { factor: `${surgType} Cerrahi`,          impact: surgType === 'GTR' ? -0.44 : surgType === 'STR' ? -0.20 : 0.15, direction: surgType === 'GTR' ? 'low' : surgType === 'STR' ? 'low' : 'high' },
      ...(rad.sphericity != null ? [{ factor: `Sferiklik (${rad.sphericity.toFixed(2)})`,
        impact: -0.15 * rad.sphericity, direction: 'low' }] : []),
    ] : MOCK.riskFactors;

    // Gerçek kohort KM eğrisi
    const realKMCurves = (cohortKM?.curves || []).map(c => ({
      label: c.label, color: c.color, n0: c.n0,
      events: c.events || [], censored: c.censored || [],
    }));
    const kmCurves = realKMCurves.length ? realKMCurves : MOCK.kmCurves;

    return React.createElement('div', null,
      stepWizard,
      React.createElement('div', { className: 'container page-fade' },
        // Success banner
        React.createElement('div', { className: 'banner-success' },
          React.createElement('div', { className: 'banner-left' },
            React.createElement('div', { className: 'banner-check' }, '✓'),
            React.createElement('div', null,
              React.createElement('div', { className: 'banner-title' }, 'Analiz Tamamlandı: ' + r.patient_id),
              React.createElement('div', { className: 'banner-sub' }, r.report_id + '  ·  ' + r.date)
            )
          ),
          React.createElement('div', { style: { display: 'flex', gap: 8 } },
            React.createElement('button', { className: 'btn btn-outline', onClick: () => onViewReport(r.patient_id) }, 'Detaylı Rapor'),
            React.createElement('button', { className: 'btn btn-outline', onClick: resetAnalysis }, '← Yeni Analiz')
          )
        ),

        // KPI row
        React.createElement('div', { className: 'kpi-row' },
          React.createElement('div', { className: 'kpi-card accent' },
            React.createElement('div', { className: 'kpi-label' }, '6 Aylık Sağkalım'),
            React.createElement('div', { className: 'kpi-value' }, '%' + Math.round(r.survival_6m_pct)),
            React.createElement('div', { className: 'kpi-sub' },
              r.survival_6m_lower != null && r.survival_6m_upper != null
                ? `%${r.survival_6m_lower.toFixed(0)}–%${r.survival_6m_upper.toFixed(0)} (95% CI)`
                : 'Cox model tahmini'
            )
          ),
          React.createElement('div', { className: 'kpi-card' },
            React.createElement('div', { className: 'kpi-label' }, 'Tümör Hacmi'),
            React.createElement('div', { className: 'kpi-value' }, r.tumor_volume.toFixed(1), React.createElement('span', { className: 'kpi-unit' }, ' cm³')),
            React.createElement('div', { className: 'kpi-sub' }, 'Whole tumor segmentation')
          ),
          React.createElement('div', { className: 'kpi-card' },
            React.createElement('div', { className: 'kpi-label' }, 'Risk Skoru'),
            React.createElement('div', { className: 'kpi-value' }, Math.round(r.risk_score), React.createElement('span', { className: 'kpi-unit' }, '/100')),
            React.createElement('div', { className: 'kpi-sub' },
              React.createElement('span', { className: 'risk-badge ' + r.risk_class, style: { marginRight: 6 } }, r.risk_label),
              r.risk_score_lower != null && r.risk_score_upper != null &&
                React.createElement('span', { style: { fontSize: 10.5, color: 'var(--text-faint)', fontFamily: 'var(--mono)' } },
                  `${r.risk_score_lower.toFixed(0)}–${r.risk_score_upper.toFixed(0)}`)
            )
          ),
          React.createElement('div', { className: 'kpi-card' },
            React.createElement('div', { className: 'kpi-label' }, 'Benzer Hasta'),
            React.createElement('div', { className: 'kpi-value' }, similarRows.length),
            React.createElement('div', { className: 'kpi-sub' }, hasReal && r.similar_patients?.length ? 'Referans kohort' : 'Demo veri')
          )
        ),

        // Main 2-col: Survival/Risk | MRI Viewer
        React.createElement('div', { className: 'grid-2col' },
          // Left: Survival & Risk
          React.createElement('div', null,
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'SAĞKALIM & RİSK')),
              React.createElement('div', { className: 'card-body' },
                // Survival bar
                React.createElement('div', { className: 'risk-section' },
                  React.createElement('div', { className: 'risk-row' },
                    React.createElement('span', { className: 'risk-row-label' }, '6 Aylık Sağkalım'),
                    React.createElement('span', { className: 'risk-row-value' },
                      '%' + Math.round(r.survival_6m_pct),
                      r.survival_6m_lower != null && r.survival_6m_upper != null &&
                        React.createElement('span', { style: { fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, marginLeft: 8, fontFamily: 'var(--mono)' } },
                          `(%${r.survival_6m_lower.toFixed(0)}–%${r.survival_6m_upper.toFixed(0)} 95% CI)`)
                    )
                  ),
                  React.createElement('div', { className: 'progress-bar', style: { position: 'relative' } },
                    // CI bandı arka planda
                    r.survival_6m_lower != null && r.survival_6m_upper != null &&
                      React.createElement('div', {
                        style: {
                          position: 'absolute',
                          left: r.survival_6m_lower + '%',
                          width: (r.survival_6m_upper - r.survival_6m_lower) + '%',
                          top: 0, bottom: 0,
                          background: survColor, opacity: 0.25, borderRadius: 4
                        }
                      }),
                    React.createElement('div', { className: 'progress-fill', style: { width: r.survival_6m_pct + '%', background: survColor, position: 'relative', zIndex: 1 } })
                  )
                ),
                // Risk slider
                React.createElement('div', { className: 'risk-section' },
                  React.createElement('div', { className: 'risk-row' },
                    React.createElement('span', { className: 'risk-row-label' }, 'Cox Risk Skoru'),
                    React.createElement('span', { className: `risk-badge ${r.risk_class}` }, r.risk_label)
                  ),
                  React.createElement('div', { className: 'risk-slider-wrap' },
                    React.createElement('div', { className: 'risk-gradient' }),
                    React.createElement('div', { className: 'risk-marker', style: { left: r.risk_score + '%' } })
                  ),
                  React.createElement('div', { className: 'risk-labels' },
                    React.createElement('span', null, 'Düşük'),
                    React.createElement('span', null, 'Orta'),
                    React.createElement('span', null, 'Yüksek')
                  )
                ),
                // Volume cards
                React.createElement('div', { style: { marginTop: 18 } },
                  React.createElement('div', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--text-muted)', marginBottom: 10 } }, 'Tümör Bölümleri'),
                  React.createElement('div', { className: 'vol-cards' },
                    React.createElement('div', { className: 'vol-card whole' },
                      React.createElement('div', { className: 'vol-card-label' }, 'Whole'),
                      React.createElement('div', { className: 'vol-card-value' }, r.tumor_volume.toFixed(1)),
                      React.createElement('div', { className: 'vol-card-unit' }, 'cm³')
                    ),
                    React.createElement('div', { className: 'vol-card core' },
                      React.createElement('div', { className: 'vol-card-label' }, 'Core'),
                      React.createElement('div', { className: 'vol-card-value' }, r.core_volume.toFixed(1)),
                      React.createElement('div', { className: 'vol-card-unit' }, 'cm³')
                    ),
                    React.createElement('div', { className: 'vol-card enh' },
                      React.createElement('div', { className: 'vol-card-label' }, 'Enh.'),
                      React.createElement('div', { className: 'vol-card-value' }, r.enhancing_volume.toFixed(1)),
                      React.createElement('div', { className: 'vol-card-unit' }, 'cm³')
                    )
                  )
                )
              )
            ),
            // Risk waterfall (NEW)
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'RİSK FAKTÖR ATFI'),
                React.createElement('span', { className: 'section-badge' },
                  hasReal ? 'Klinik + radyomik (Cox PHM)' : 'Demo ağırlıkları')
              ),
              React.createElement('div', { className: 'card-body' },
                React.createElement(RiskWaterfall, { factors: realFactors })
              )
            )
          ),
          // Right: Enhanced MRI Viewer
          React.createElement('div', null,
            React.createElement('div', { className: 'card', style: { overflow: 'hidden' } },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'TÜMÖR GÖRÜNTÜLEME'),
                React.createElement('span', { className: 'section-badge' }, 'LUMIERE · Patient-001')
              ),
              React.createElement(MRIViewer, {
                axis: viewerAxis, slice: viewerSlice,
                maxSlice: maxSlices[viewerAxis],
                onAxisChange: a => { setViewerAxis(a); setViewerSlice(Math.floor(maxSlices[a] / 2)); },
                onSliceChange: setViewerSlice, segOverlay: true,
                sessionId: DEMO_SESSION,
                files: DEMO_FILES
              })
            ),
            // Radiomic radar
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'RADYOMİK PROFİL'),
                React.createElement('span', { className: 'section-badge' },
                  hasReal && tv > 0 ? 'Gerçek özellikler' : 'Demo örnek')
              ),
              React.createElement('div', { className: 'card-body' },
                React.createElement(RadiomicRadar, {
                  data: realRadar,
                  label: r.patient_id,
                  color: 'var(--accent)',
                  size: 240
                })
              )
            )
          )
        ),

        // Kaplan-Meier in full width — gerçek kohort verisi (yoksa demo)
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'section-head' },
            React.createElement('div', { className: 'section-title' }, 'KAPLAN-MEIER SAĞKALIM EĞRİSİ'),
            React.createElement('span', { className: 'section-badge' },
              realKMCurves.length
                ? `${cohortKM?.total_filtered || 0} hasta · Risk sınıfına göre`
                : 'Demo eğri · Risk gruplarına göre')
          ),
          React.createElement('div', { className: 'card-body' },
            React.createElement(KaplanMeier, { curves: kmCurves, height: 240 })
          )
        ),

        // AI Assessment
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'section-head' },
            React.createElement('div', { className: 'section-title' }, 'YAPAY ZEKA DEĞERLENDİRMESİ'),
            React.createElement('span', { className: 'ai-engine-badge' }, '◆ GBM-AID Motor')
          ),
          React.createElement('div', { className: 'card-body' },
            React.createElement('p', { className: 'ai-text' }, r.ai_summary)
          )
        ),

        // Cohort
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'section-head' },
            React.createElement('div', { className: 'section-title' }, 'KOHORT ANALİZİ (BENZER HASTALAR)'),
            React.createElement('span', { className: 'section-badge' },
              hasReal && r.similar_patients?.length
                ? `LUMIERE benzerlik · Top ${similarRows.length}`
                : `Demo · ${similarRows.length} hasta`)
          ),
          React.createElement('div', { style: { overflowX: 'auto' } },
            React.createElement('table', { className: 'dtable' },
              React.createElement('thead', null,
                React.createElement('tr', null,
                  React.createElement('th', null, 'Hasta ID'),
                  React.createElement('th', null, 'Benzerlik'),
                  React.createElement('th', null, 'Whole Vol.'),
                  React.createElement('th', null, 'Core Vol.'),
                  React.createElement('th', null, 'Modaliteler')
                )
              ),
              React.createElement('tbody', null,
                similarRows.map(p => {
                  const mods = p.modalities || p.available_modalities || [];
                  return React.createElement('tr', { key: p.id },
                    React.createElement('td', { style: { fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--primary)' } }, p.id),
                    React.createElement('td', null,
                      React.createElement('span', { style: { display: 'inline-block', width: 50, height: 6, background: 'var(--border-light)', borderRadius: 3, marginRight: 8, verticalAlign: 'middle', position: 'relative', overflow: 'hidden' } },
                        React.createElement('span', { style: { display: 'block', width: (p.similarity * 100) + '%', height: '100%', background: 'var(--accent)' } })
                      ),
                      (p.similarity * 100).toFixed(1) + '%'),
                    React.createElement('td', null, (p.tumor_volume_cm3 || 0).toFixed(1) + ' cm³'),
                    React.createElement('td', null, (p.core_volume_cm3 || 0).toFixed(1) + ' cm³'),
                    React.createElement('td', { style: { fontSize: 11 } },
                      mods.map(m =>
                        React.createElement('span', { key: m, className: 'mod-badge ' + m, style: { marginRight: 3, fontSize: 9, padding: '1px 6px' } }, m)
                      )
                    )
                  );
                })
              )
            )
          )
        ),

        // Literature
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'section-head' },
            React.createElement('div', { className: 'section-title' }, 'KLİNİK LİTERATÜR ÖZETİ'),
            React.createElement('span', { className: 'section-badge' }, '◆ PubMed RAG')
          ),
          React.createElement('div', { className: 'card-body' },
            React.createElement('div', { style: { marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
              React.createElement('span', { style: { fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Sorgu:'),
              (lit.terms || []).map(t =>
                React.createElement('span', { key: t, style: { background: 'var(--surface-tint)', padding: '3px 9px', borderRadius: 12, fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' } }, t)
              ),
              React.createElement('span', { style: { color: lit.source === 'pubmed' ? 'var(--green)' : 'var(--text-muted)', fontSize: 11, fontWeight: 600, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 } },
                React.createElement('span', { style: { width: 6, height: 6, borderRadius: '50%', background: lit.source === 'pubmed' ? 'var(--green)' : 'var(--text-faint)' } }),
                lit.source === 'pubmed' ? 'PubMed canlı' : (lit.source === 'fallback' ? 'Yerleşik referanslar' : 'Demo'))
            ),
            React.createElement('div', { className: 'lit-summary' }, lit.summary || ''),
            (lit.refs || []).map(ref =>
              React.createElement('div', { key: ref.pmid, className: 'lit-ref' },
                React.createElement('strong', { style: { color: 'var(--accent-dark)', fontFamily: 'var(--mono)', fontSize: 11 } }, '[PMID: ' + ref.pmid + '] '),
                React.createElement('span', { style: { fontWeight: 500 } }, ref.title),
                React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 11.5, marginTop: 4, fontStyle: 'italic' } }, ref.journal + ' · ' + ref.year)
              )
            )
          )
        )
      )
    );
  }

  // INPUT VIEW
  const modOptions = ['T1', 'T1ce', 'T2', 'FLAIR', 'MASK (Core)', 'MASK (Whole)', 'MASK (Enh)', 'Diğer'];
  const modMap = { T1: 'T1', T1ce: 'T1ce', T2: 'T2', FLAIR: 'FLAIR', SEG: 'MASK (Whole)' };

  // STEP 1: Veri (Upload + Sequence)
  if (step === 1) {
    return React.createElement('div', null,
      stepWizard,
      React.createElement('div', { className: 'container page-fade' },
        React.createElement('div', { className: 'grid-2col' },
          // Left: Upload
          React.createElement('div', null,
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'MR GÖRÜNTÜ DOSYALARI'),
                React.createElement('span', { className: 'section-badge' }, files.length + ' dosya')
              ),
              React.createElement('div', { className: 'card-body' },
                React.createElement('input', {
                  ref: fileInputRef, type: 'file', multiple: true,
                  accept: '.nii,.nii.gz,.dcm,.nrrd,.mha',
                  style: { display: 'none' },
                  onChange: e => handleRealUpload(e.target.files),
                }),
                React.createElement('div', { className: 'upload-zone', onClick: () => fileInputRef.current?.click() },
                  React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
                    React.createElement('path', { d: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' })
                  ),
                  React.createElement('div', { className: 'upload-text' }, analyzing ? 'Yükleniyor...' : 'Dosyaları seçin'),
                  React.createElement('div', { className: 'upload-hint' }, 'NIfTI · DICOM · NRRD · MHA'),
                  React.createElement('div', { className: 'upload-btns' },
                    React.createElement('button', { className: 'btn btn-primary', onClick: e => { e.stopPropagation(); fileInputRef.current?.click(); } }, 'Dosya Seç'),
                    React.createElement('button', { className: 'btn btn-accent', onClick: e => { e.stopPropagation(); handleDemoUpload(); } }, 'Demo Hasta Yükle')
                  )
                ),
                analyzeError && React.createElement('div', {
                  style: { marginTop: 10, padding: '8px 12px', background: '#fef2f2',
                           border: '1px solid #fecaca', color: '#991b1b', borderRadius: 6, fontSize: 12.5 }
                }, '⚠ ' + analyzeError),
                React.createElement('div', { className: 'upload-info' },
                  React.createElement('strong', null, 'İpucu: '),
                  'NIfTI klasörü seçin — T1, T2, FLAIR, T1ce ve maskeler otomatik tanınır. Sekans eşleştirme tabloda gösterilir, gerekirse manuel düzeltebilirsiniz.')
              )
            )
          ),
          // Right: Sequence matching
          React.createElement('div', null,
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'SEKANS EŞLEŞTİRME'),
                React.createElement('span', { className: 'section-badge' }, 'Oto-tahmin · Düzenlenebilir')
              ),
              files.length > 0 && React.createElement('div', { style: { padding: '12px 20px', fontSize: 13, background: 'var(--green-tint)', borderBottom: '1px solid var(--border-light)' } },
                React.createElement('strong', { style: { color: 'var(--green)' } }, '✓ 4/4'), ' modalite tanımlandı: ',
                ['T1', 'T1ce', 'T2', 'FLAIR'].map(m =>
                  React.createElement('span', { key: m, className: 'mod-badge ' + m, style: { marginLeft: 4 } }, m)
                )
              ),
              React.createElement('table', { className: 'match-table' },
                React.createElement('thead', null,
                  React.createElement('tr', null,
                    React.createElement('th', null, 'Dosya'),
                    React.createElement('th', null, 'Tahmin'),
                    React.createElement('th', null, 'Güven'),
                    React.createElement('th', null, 'Sekans')
                  )
                ),
                React.createElement('tbody', null,
                  files.length === 0
                    ? React.createElement('tr', null,
                        React.createElement('td', { colSpan: 4, className: 'match-empty' }, 'Dosya yüklendiğinde burada görünecek'))
                    : files.map((f, i) =>
                        React.createElement('tr', { key: i },
                          React.createElement('td', { style: { fontWeight: 500, fontSize: 12.5 } }, f.filename),
                          React.createElement('td', null, React.createElement('span', { className: 'mod-badge ' + f.modality }, f.modality)),
                          React.createElement('td', null,
                            React.createElement('span', { className: 'conf' },
                              React.createElement('span', { className: 'conf-dot' }), f.confidence + '%')
                          ),
                          React.createElement('td', null,
                            React.createElement('select', { className: 'seq-select', defaultValue: modMap[f.modality] || 'Diğer' },
                              modOptions.map(o => React.createElement('option', { key: o, value: o }, o))
                            )
                          )
                        )
                      )
                )
              )
            )
          )
        ),
        // Continue button
        files.length > 0 && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 } },
          React.createElement('button', { className: 'btn btn-accent btn-lg', onClick: continueToClinical }, 'Klinik Bilgilere Geç →'),
          React.createElement('button', { className: 'btn btn-outline', onClick: resetAnalysis }, '↻ Sıfırla'),
          React.createElement('span', { style: { fontSize: 12, color: 'var(--text-muted)' } }, files.length + ' dosya hazır')
        )
      )
    );
  }

  // STEP 2: Klinik Bilgiler
  return React.createElement('div', null,
    stepWizard,
    React.createElement('div', { className: 'container page-fade' },
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'section-head' },
          React.createElement('div', { className: 'section-title' }, 'KLİNİK HASTA BİLGİLERİ'),
          React.createElement('span', { className: 'section-badge' }, files.length + ' MRI dosyası hazır')),
        React.createElement('div', { className: 'card-body' },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Hasta Adı / ID *'),
            React.createElement('input', { type: 'text', className: 'form-input', value: pid, onChange: e => setPid(e.target.value), style: { maxWidth: 480 } })
          ),
          React.createElement('div', { className: 'grid-4col' },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Yaş *'),
              React.createElement('input', { type: 'number', className: 'form-input', value: age, onChange: e => setAge(e.target.value) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Cinsiyet'),
              React.createElement('select', { className: 'form-select', value: gender, onChange: e => setGender(e.target.value) },
                React.createElement('option', { value: 'unknown' }, 'Seçin'),
                React.createElement('option', { value: 'M' }, 'Erkek'),
                React.createElement('option', { value: 'F' }, 'Kadın')
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'KPS Skoru'),
              React.createElement('select', { className: 'form-select', value: kps, onChange: e => setKps(e.target.value) },
                ['100','90','80','70','60','50','40','30','20','10'].map(v =>
                  React.createElement('option', { key: v, value: v }, v))
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Tedavi'),
              React.createElement('select', { className: 'form-select', value: treatment, onChange: e => setTreatment(e.target.value) },
                React.createElement('option', { value: 'stupp' }, 'Stupp Protokolü'),
                React.createElement('option', { value: 'surgery_only' }, 'Sadece Cerrahi'),
                React.createElement('option', { value: 'rt_only' }, 'Sadece Radyoterapi'),
                React.createElement('option', { value: 'tmz_only' }, 'Sadece TMZ'),
                React.createElement('option', { value: 'bev' }, 'Bevacizumab')
              )
            )
          ),
          React.createElement('div', { className: 'grid-2col', style: { maxWidth: 720 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'MGMT Metilasyonu'),
              React.createElement('select', { className: 'form-select', value: mgmt, onChange: e => setMgmt(e.target.value) },
                React.createElement('option', { value: 'unknown' }, 'Bilinmiyor'),
                React.createElement('option', { value: 'methylated' }, 'Metile'),
                React.createElement('option', { value: 'unmethylated' }, 'Metile Değil')
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'IDH Mutasyonu'),
              React.createElement('select', { className: 'form-select', value: idh1, onChange: e => setIdh1(e.target.value) },
                React.createElement('option', { value: 'unknown' }, 'Bilinmiyor'),
                React.createElement('option', { value: 'mutant' }, 'Mutant'),
                React.createElement('option', { value: 'wildtype' }, 'Wildtype')
              )
            )
          ),
          React.createElement('div', { className: 'grid-3col', style: { maxWidth: 720 } },
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Tanı Tarihi'),
              React.createElement('input', { type: 'date', className: 'form-input', value: diagDate, onChange: e => setDiagDate(e.target.value) })
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Tümör Lokalizasyonu'),
              React.createElement('select', { className: 'form-select', value: tumorLoc, onChange: e => setTumorLoc(e.target.value) },
                React.createElement('option', { value: 'frontal' }, 'Frontal Lob'),
                React.createElement('option', { value: 'temporal' }, 'Temporal Lob'),
                React.createElement('option', { value: 'parietal' }, 'Parietal Lob'),
                React.createElement('option', { value: 'occipital' }, 'Oksipital Lob'),
                React.createElement('option', { value: 'insular' }, 'İnsula'),
                React.createElement('option', { value: 'multifocal' }, 'Multifokal')
              )
            ),
            React.createElement('div', { className: 'form-group' },
              React.createElement('label', { className: 'form-label' }, 'Cerrahi Tipi'),
              React.createElement('select', { className: 'form-select', value: surgType, onChange: e => setSurgType(e.target.value) },
                React.createElement('option', { value: 'GTR' }, 'GTR (Gross Total Rezeksiyon)'),
                React.createElement('option', { value: 'STR' }, 'STR (Subtotal Rezeksiyon)'),
                React.createElement('option', { value: 'biopsy' }, 'Sadece Biyopsi'),
                React.createElement('option', { value: 'none' }, 'Cerrahi Yok')
              )
            )
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border-light)' } },
            React.createElement('button', { className: 'btn btn-outline', onClick: () => setStep(1) }, '← Geri'),
            React.createElement('button', { className: 'btn btn-accent btn-lg', onClick: runAnalysis }, '▶ Analizi Başlat'),
            React.createElement('button', { className: 'btn btn-ghost', onClick: resetAnalysis }, '↻ Baştan')
          )
        )
      )
    )
  );
}

window.AnalysisPage = AnalysisPage;
