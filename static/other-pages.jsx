/* other-pages.jsx — Records, Reports (w/ timeline), Cohort (richer), Help */

const LOC_LABELS = { frontal:'Frontal Lob', temporal:'Temporal Lob', parietal:'Parietal Lob', occipital:'Oksipital Lob', insular:'İnsula', multifocal:'Multifokal' };
const SURG_LABELS = { GTR:'GTR', STR:'STR', biopsy:'Biyopsi', none:'Yok' };
const RESPONSE_LABELS = { complete:'Tam Yanıt', partial:'Parsiyel', stable:'Stabil', progression:'Progresyon' };
const RISK_COLORS = { low: 'var(--green)', medium: 'var(--yellow)', high: 'var(--red)' };
const RISK_LABELS_MAP = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };
const MGMT_COLORS = { methylated: 'var(--green)', unmethylated: 'var(--red)', unknown: 'var(--text-faint)' };
const IDH1_COLORS = { mutant: 'var(--blue)', wildtype: 'var(--orange)', unknown: 'var(--text-faint)' };

/* ━━━ RECORDS PAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function RecordsPage({ patients, onViewReport, onEditPatient, onAddTreatment, onDeletePatient, onCompareSelected, onReloadPatients }) {
  const [search, setSearch] = React.useState('');
  const [filterRisk, setFilterRisk] = React.useState('all');
  const [selected, setSelected] = React.useState([]);
  const csvInputRef = React.useRef(null);
  const [csvMsg, setCsvMsg] = React.useState('');

  const handleCsvImport = async (fileList) => {
    if (!fileList || !fileList.length) return;
    setCsvMsg('Yükleniyor...');
    const result = await GBM_API.importCSV(fileList[0]);
    if (result && (result.imported >= 0 || result.updated >= 0)) {
      setCsvMsg(`✓ ${result.imported || 0} yeni, ${result.updated || 0} güncellendi` +
                (result.errors?.length ? ` · ${result.errors.length} hata` : ''));
      if (onReloadPatients) onReloadPatients();
    } else {
      setCsvMsg('⚠ Yükleme başarısız');
    }
    csvInputRef.current.value = '';
    setTimeout(() => setCsvMsg(''), 5000);
  };
  const filtered = patients.filter(p => {
    if (!p.patient_id.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterRisk !== 'all' && p.risk_class !== filterRisk) return false;
    return true;
  });

  const toggleSelect = (pid) => {
    setSelected(prev => prev.includes(pid) ? prev.filter(x => x !== pid) : prev.length < 3 ? [...prev, pid] : prev);
  };
  const selectAll = () => {
    if (selected.length === filtered.length) setSelected([]);
    else setSelected(filtered.slice(0, 3).map(p => p.patient_id));
  };

  return React.createElement('div', { className: 'page-fade' },
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' },
        React.createElement('div', { className: 'section-title' }, 'HASTA KAYITLARI'),
        React.createElement('span', { className: 'section-badge' }, filtered.length + ' / ' + patients.length + ' hasta')
      ),
      React.createElement('div', { className: 'toolbar' },
        React.createElement('input', {
          ref: csvInputRef, type: 'file', accept: '.csv',
          style: { display: 'none' },
          onChange: e => handleCsvImport(e.target.files),
        }),
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: () => csvInputRef.current?.click(),
        }, '↓ CSV Import'),
        React.createElement('a', {
          className: 'btn btn-accent btn-sm',
          href: '/api/export-csv' + (localStorage.getItem('gbm_jwt') ? '?token=' + localStorage.getItem('gbm_jwt') : ''),
          download: 'gbm-aid-export.csv',
          style: { textDecoration: 'none' },
        }, '↑ CSV Export'),
        React.createElement('a', {
          className: 'btn btn-outline btn-sm',
          href: GBM_API.csvTemplateUrl(), download: 'template.csv',
          style: { textDecoration: 'none' },
        }, '⬇ Şablon'),
        csvMsg && React.createElement('span', {
          style: { fontSize: 12, color: csvMsg.startsWith('✓') ? 'var(--green)' : csvMsg.startsWith('⚠') ? 'var(--red)' : 'var(--text-muted)',
                   marginLeft: 8, fontWeight: 600 }
        }, csvMsg),
        selected.length >= 2 && React.createElement('button', {
          className: 'btn btn-accent btn-sm',
          style: { marginLeft: 4, animation: 'pageFade 0.2s ease' },
          onClick: () => onCompareSelected(selected)
        }, '⇆ Seçilenleri Karşılaştır (' + selected.length + ')'),
        React.createElement('div', { style: { display: 'flex', gap: 4, marginLeft: 12 } },
          ['all', 'low', 'medium', 'high'].map(r =>
            React.createElement('button', {
              key: r,
              className: 'btn btn-sm ' + (filterRisk === r ? 'btn-primary' : 'btn-outline'),
              onClick: () => setFilterRisk(r)
            }, r === 'all' ? 'Tümü' : RISK_LABELS_MAP[r])
          )
        ),
        React.createElement('input', {
          type: 'text', className: 'form-input', placeholder: 'Hasta ara...',
          value: search, onChange: e => setSearch(e.target.value)
        })
      ),
      React.createElement('div', { style: { overflowX: 'auto' } },
        React.createElement('table', { className: 'dtable' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', { style: { width: 36 } },
                React.createElement('input', { type: 'checkbox', checked: selected.length > 0 && selected.length === Math.min(3, filtered.length), onChange: selectAll, style: { cursor: 'pointer' } })),
              ['Hasta ID', 'Tarih', 'Yaş', 'KPS', 'MGMT', 'IDH1', 'Risk', 'Sınıf', 'Sağkalım', 'İşlemler'].map(h =>
                React.createElement('th', { key: h }, h))
            )
          ),
          React.createElement('tbody', null,
            filtered.length === 0
              ? React.createElement('tr', null,
                  React.createElement('td', { colSpan: 11, style: { textAlign: 'center', padding: 40, color: 'var(--text-muted)' } }, 'Kayıt bulunamadı'))
              : filtered.map(p => {
                  const isChecked = selected.includes(p.patient_id);
                  return React.createElement('tr', { key: p.patient_id, style: isChecked ? { background: 'var(--accent-light)' } : {} },
                    React.createElement('td', null,
                      React.createElement('input', { type: 'checkbox', checked: isChecked, onChange: () => toggleSelect(p.patient_id), style: { cursor: 'pointer' } })),
                    React.createElement('td', { style: { fontWeight: 600, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--primary)' } }, p.patient_id),
                    React.createElement('td', { style: { fontSize: 12, color: 'var(--text-muted)' } }, p.date || '-'),
                    React.createElement('td', null, p.age || '-'),
                    React.createElement('td', null, p.kps_score || '-'),
                    React.createElement('td', null, p.mgmt_status === 'methylated' ? '✓' : p.mgmt_status === 'unmethylated' ? '✗' : '-'),
                    React.createElement('td', null, p.idh1_status === 'mutant' ? 'Mut' : p.idh1_status === 'wildtype' ? 'WT' : '-'),
                    React.createElement('td', { style: { fontWeight: 700, fontFamily: 'var(--mono)' } }, p.risk_score != null ? Math.round(p.risk_score) : '-'),
                    React.createElement('td', null,
                      p.risk_class ? React.createElement('span', { className: 'risk-badge ' + p.risk_class }, p.risk_label) : '-'
                    ),
                    React.createElement('td', { style: { fontWeight: 600 } }, p.survival_6m_pct != null ? '%' + Math.round(p.survival_6m_pct) : '-'),
                    React.createElement('td', { style: { whiteSpace: 'nowrap' } },
                      React.createElement('button', { className: 'btn btn-sm btn-outline', onClick: () => onViewReport(p.patient_id) }, 'Rapor'),
                      ' ',
                      React.createElement('button', { className: 'btn btn-sm btn-outline', onClick: () => onEditPatient(p) }, 'Düzenle'),
                      ' ',
                      React.createElement('button', { className: 'btn btn-sm btn-accent', onClick: () => onAddTreatment(p.patient_id) }, '+ Tedavi'),
                      ' ',
                      React.createElement('button', { className: 'btn btn-sm btn-danger-outline', onClick: () => onDeletePatient(p.patient_id) }, 'Sil')
                    )
                  );
                })
          )
        )
      )
    )
  );
}

/* ━━━ TIMELINE COMPONENT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function PatientTimeline({ patient }) {
  // Build events from patient data
  const events = [];
  if (patient.diagnosis_date) {
    events.push({ date: patient.diagnosis_date, label: 'Tanı', type: 'mri', detail: LOC_LABELS[patient.tumor_location] + ' GBM' });
  }
  (patient.treatments || []).forEach(t => {
    let type = 'treatment';
    if (t.drug_name.includes('Cerrahi')) type = 'surgery';
    if (t.response === 'progression') type = 'progression';
    events.push({
      date: t.start_date,
      label: t.drug_name,
      type,
      detail: (t.dosage || '') + (t.response ? ' · ' + RESPONSE_LABELS[t.response] : '')
    });
  });

  events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return React.createElement('div', null,
    // Tumor volume chart
    React.createElement(TumorTimeline, {
      data: MOCK.tumorTimeline.data,
      events: MOCK.tumorTimeline.events,
      height: 220
    }),
    // Event list
    React.createElement('div', { className: 'timeline-events-list', style: { marginTop: 18 } },
      events.map((e, i) =>
        React.createElement('div', { key: i, className: 'timeline-event-card ' + e.type },
          React.createElement('div', { className: 'tle-date' }, e.date),
          React.createElement('div', { style: { flex: 1 } },
            React.createElement('div', { className: 'tle-title' }, e.label),
            e.detail && React.createElement('div', { className: 'tle-detail' }, e.detail)
          ),
          React.createElement('span', { className: 'risk-badge', style: {
            background: e.type === 'surgery' ? 'var(--red-pale)' : e.type === 'progression' ? 'var(--yellow-pale)' : 'var(--blue-pale)',
            color: e.type === 'surgery' ? 'var(--red)' : e.type === 'progression' ? 'var(--yellow)' : 'var(--blue)',
            fontSize: 10
          }},
            { mri: 'TANI', surgery: 'CERRAHİ', treatment: 'TEDAVİ', progression: 'PROGRESYON' }[e.type])
        )
      )
    )
  );
}

/* ━━━ REPORT PAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function ReportsPage({ patients, selectedPatientId, onSelectPatient, onEditPatient, onAddTreatment, refreshKey }) {
  const listPatient = patients.find(p => p.patient_id === selectedPatientId);

  const [fullPatient, setFullPatient] = React.useState(null);
  const [detailLoading, setDetailLoading] = React.useState(false);

  React.useEffect(() => {
    if (!selectedPatientId) { setFullPatient(null); return; }
    setDetailLoading(true);
    GBM_API.getPatientDetail(selectedPatientId)
      .then(d => { if (d) setFullPatient(d); setDetailLoading(false); })
      .catch(() => setDetailLoading(false));
  }, [selectedPatientId, refreshKey]);

  const patient = fullPatient || listPatient;

  const [viewerAxis, setViewerAxis] = React.useState('axial');
  const [viewerSlice, setViewerSlice] = React.useState(77);
  const maxSlices = { axial: 154, coronal: 239, sagittal: 239 };

  const infoRow = (label, value) =>
    React.createElement('tr', null,
      React.createElement('td', { style: { color: 'var(--text-muted)', padding: '6px 0', width: 160 } }, label),
      React.createElement('td', { style: { fontWeight: 600 } }, value || '-')
    );

  return React.createElement('div', { className: 'page-fade' },
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' },
        React.createElement('div', { className: 'section-title' }, 'RAPOR GÖRÜNTÜLE')),
      React.createElement('div', { className: 'card-body' },
        React.createElement('div', { className: 'form-group', style: { maxWidth: 400, margin: 0 } },
          React.createElement('label', { className: 'form-label' }, 'Hasta Seçin'),
          React.createElement('select', { className: 'form-select', value: selectedPatientId || '', onChange: e => onSelectPatient(e.target.value) },
            React.createElement('option', { value: '' }, '-- Hasta seçin --'),
            patients.map(p =>
              React.createElement('option', { key: p.patient_id, value: p.patient_id }, p.patient_id + ' (' + p.date + ')')
            )
          )
        )
      )
    ),

    !patient
      ? React.createElement('div', { className: 'empty' },
          React.createElement('div', { className: 'empty-icon' }, '📄'),
          React.createElement('p', null, 'Rapor görüntülemek için yukarıdaki listeden bir hasta seçin.'))
      : React.createElement('div', null,
          // Banner
          React.createElement('div', { className: 'banner-success' },
            React.createElement('div', { className: 'banner-left' },
              React.createElement('div', { className: 'banner-check' }, '✓'),
              React.createElement('div', null,
                React.createElement('div', { className: 'banner-title' }, patient.patient_id),
                React.createElement('div', { className: 'banner-sub' }, (patient.report_id || '') + ' · ' + (patient.date || ''))
              )
            ),
            React.createElement('div', { style: { display: 'flex', gap: 8 } },
              React.createElement('a', {
                className: 'btn btn-primary btn-sm',
                href: GBM_API.reportPdfUrl(patient.patient_id),
                target: '_blank', rel: 'noopener',
                style: { textDecoration: 'none' },
              }, '📄 PDF İndir'),
              React.createElement('button', { className: 'btn btn-outline btn-sm', onClick: () => window.print() }, '🖨 Yazdır')
            )
          ),

          // ── EXECUTIVE SUMMARY CARD ──
          React.createElement('div', { className: 'card', style: { borderLeft: '4px solid var(--accent)', background: 'linear-gradient(135deg, var(--surface) 0%, var(--accent-light) 100%)' } },
            React.createElement('div', { className: 'section-head', style: { borderBottom: 'none', paddingBottom: 0 } },
              React.createElement('div', { className: 'section-title', style: { borderLeftColor: 'var(--accent)' } }, 'KLİNİK KARAR DESTEK ÖZETİ'),
              React.createElement('span', { className: 'ai-engine-badge' }, '◆ GBM-AID')
            ),
            React.createElement('div', { className: 'card-body', style: { paddingTop: 10 } },
              (() => {
                const p = patient;
                const genderStr = p.gender === 'M' ? 'erkek' : p.gender === 'F' ? 'kadın' : '';
                const locStr = (LOC_LABELS[p.tumor_location] || '').toLowerCase();
                const mgmtStr = p.mgmt_status === 'methylated' ? 'MGMT+' : p.mgmt_status === 'unmethylated' ? 'MGMT−' : '';
                const idhStr = p.idh1_status === 'mutant' ? 'IDH-mut' : p.idh1_status === 'wildtype' ? 'IDH-wt' : '';
                const riskStr = p.risk_label ? p.risk_label.toLowerCase() + ' risk (' + Math.round(p.risk_score) + '/100)' : '';
                const txStr = p.treatment_protocol === 'stupp' ? 'Stupp protokolü' : p.treatment_protocol || '';
                const lastTx = (p.treatments || []).slice(-1)[0];
                const responseStr = lastTx && lastTx.response ? RESPONSE_LABELS[lastTx.response]?.toLowerCase() || lastTx.response : '';
                const survStr = p.survival_6m_pct != null ? '%' + p.survival_6m_pct.toFixed(0) : '';

                // Build next step recommendation
                let nextStep = '';
                if (lastTx && lastTx.response === 'progression') {
                  nextStep = 'İkinci basamak tedavi (bevacizumab/lomustine) değerlendirilmeli.';
                } else if (lastTx && lastTx.response === 'complete') {
                  nextStep = 'Takip MR planlanmalı, adjuvan döngülere devam.';
                } else if (p.mgmt_status === 'methylated') {
                  nextStep = 'TMZ adjuvan döngüleri (6-12 siklus) önerilir.';
                } else {
                  nextStep = 'Tedavi yanıtı değerlendirilmeli, kontrol MR planlanmalı.';
                }

                const summaryLine = [
                  p.age + ' yaş ' + genderStr,
                  locStr + ' GBM',
                  [mgmtStr, idhStr].filter(Boolean).join(' '),
                ].filter(Boolean).join(', ') + '.';

                const riskLine = [
                  riskStr ? riskStr.charAt(0).toUpperCase() + riskStr.slice(1) : '',
                  txStr ? txStr + ' altında' : '',
                  responseStr ? responseStr : '',
                ].filter(Boolean).join(', ') + '.';

                const survLine = survStr ? '6 aylık sağkalım tahmini ' + survStr + '.' : '';

                return React.createElement('div', null,
                  // Main summary text
                  React.createElement('div', { style: { fontSize: 15, lineHeight: 1.7, color: 'var(--text)', marginBottom: 14 } },
                    React.createElement('strong', { style: { color: 'var(--primary)' } }, summaryLine), ' ',
                    riskLine, ' ', survLine
                  ),
                  // Next step
                  React.createElement('div', { style: {
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    padding: '12px 14px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-light)'
                  }},
                    React.createElement('span', { style: { fontSize: 16, flexShrink: 0, marginTop: 1 } }, '→'),
                    React.createElement('div', null,
                      React.createElement('div', { style: { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.7, color: 'var(--accent-dark)', marginBottom: 3 } }, 'ÖNERİLEN SONRAKI ADIM'),
                      React.createElement('div', { style: { fontSize: 13.5, color: 'var(--text)', fontWeight: 500 } }, nextStep)
                    )
                  ),
                  // Quick stats row
                  React.createElement('div', { style: { display: 'flex', gap: 18, marginTop: 14, flexWrap: 'wrap' } },
                    [
                      { label: 'RİSK', value: Math.round(p.risk_score) + '/100', badge: p.risk_class },
                      { label: 'SAĞKALIM', value: survStr },
                      { label: 'HACİM', value: p.tumor_volume ? p.tumor_volume.toFixed(1) + ' cm³' : '-' },
                      { label: 'KPS', value: p.kps_score || '-' },
                      { label: 'TEDAVİLER', value: (p.treatments || []).length + ' kayıt' },
                    ].map(s =>
                      React.createElement('div', { key: s.label, style: { textAlign: 'center', minWidth: 70 } },
                        React.createElement('div', { style: { fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)', marginBottom: 3 } }, s.label),
                        s.badge
                          ? React.createElement('span', { className: 'risk-badge ' + s.badge, style: { fontSize: 13, fontWeight: 800, padding: '4px 12px' } }, s.value)
                          : React.createElement('div', { style: { fontSize: 16, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)' } }, s.value)
                      )
                    )
                  )
                );
              })()
            )
          ),

          React.createElement('div', { className: 'grid-2col' },
            // Clinical info
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'Klinik Bilgiler'),
                React.createElement('button', { className: 'btn btn-sm btn-outline', onClick: () => onEditPatient(patient) }, 'Düzenle')
              ),
              React.createElement('div', { className: 'card-body' },
                React.createElement('table', { style: { width: '100%', fontSize: 13 } },
                  React.createElement('tbody', null,
                    infoRow('Yaş', patient.age),
                    infoRow('Cinsiyet', patient.gender === 'M' ? 'Erkek' : patient.gender === 'F' ? 'Kadın' : '-'),
                    infoRow('KPS Skoru', patient.kps_score),
                    infoRow('MGMT', patient.mgmt_status),
                    infoRow('IDH1', patient.idh1_status),
                    infoRow('Tedavi Protokolü', patient.treatment_protocol),
                    infoRow('Tanı Tarihi', patient.diagnosis_date),
                    infoRow('Tümör Lokalizasyonu', LOC_LABELS[patient.tumor_location] || patient.tumor_location),
                    infoRow('Cerrahi Tipi', SURG_LABELS[patient.surgery_type] || patient.surgery_type)
                  )
                )
              )
            ),
            // Prognostic
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'Prognostik Sonuçlar')),
              React.createElement('div', { className: 'card-body' },
                React.createElement('table', { style: { width: '100%', fontSize: 13 } },
                  React.createElement('tbody', null,
                    React.createElement('tr', null,
                      React.createElement('td', { style: { color: 'var(--text-muted)', padding: '6px 0', width: 160 } }, 'Risk Skoru'),
                      React.createElement('td', { style: { fontWeight: 700, fontSize: 16, fontFamily: 'var(--mono)' } }, patient.risk_score != null ? patient.risk_score.toFixed(1) + ' / 100' : '-')
                    ),
                    React.createElement('tr', null,
                      React.createElement('td', { style: { color: 'var(--text-muted)', padding: '6px 0' } }, 'Risk Sınıfı'),
                      React.createElement('td', null, patient.risk_class ? React.createElement('span', { className: 'risk-badge ' + patient.risk_class }, patient.risk_label) : '-')
                    ),
                    infoRow('6 Aylık Sağkalım', patient.survival_6m_pct != null ? '%' + patient.survival_6m_pct.toFixed(1) : '-'),
                    infoRow('Tümör Hacmi', patient.tumor_volume ? patient.tumor_volume.toFixed(1) + ' cm³' : '-'),
                    infoRow('Nekrotik Çekirdek', patient.core_volume ? patient.core_volume.toFixed(1) + ' cm³' : '-'),
                    infoRow('Enhancing', patient.enhancing_volume ? patient.enhancing_volume.toFixed(1) + ' cm³' : '-'),
                    infoRow('Sferiklik', patient.sphericity ? patient.sphericity.toFixed(2) : '-')
                  )
                )
              )
            )
          ),

          // Timeline (NEW!)
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title' }, 'HASTALIK SEYRİ — ZAMAN ÇİZELGESİ'),
              React.createElement('span', { className: 'section-badge' }, 'Tümör hacmi + tedavi olayları')
            ),
            React.createElement('div', { className: 'card-body' },
              React.createElement(PatientTimeline, { patient })
            )
          ),

          // AI Summary
          patient.ai_summary && React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title' }, 'Yapay Zeka Değerlendirmesi'),
              React.createElement('span', { className: 'ai-engine-badge' }, '◆ GBM-AID Motor')
            ),
            React.createElement('div', { className: 'card-body' },
              React.createElement('p', { className: 'ai-text' }, patient.ai_summary)
            )
          ),

          // Treatments
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title' }, 'Tedaviler'),
              React.createElement('button', { className: 'btn btn-sm btn-accent', onClick: () => onAddTreatment(patient.patient_id) }, '+ Tedavi Ekle')
            ),
            React.createElement('div', { className: 'card-body' },
              patient.treatments && patient.treatments.length > 0
                ? React.createElement('table', { style: { width: '100%', fontSize: 13, borderCollapse: 'collapse' } },
                    React.createElement('thead', null,
                      React.createElement('tr', { style: { borderBottom: '1px solid var(--border)' } },
                        ['İlaç / Tedavi', 'Başlangıç', 'Doz', 'Yanıt'].map(h =>
                          React.createElement('th', { key: h, style: { textAlign: 'left', padding: '8px 0', color: 'var(--text-muted)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 } }, h)
                        )
                      )
                    ),
                    React.createElement('tbody', null,
                      patient.treatments.map((t, i) =>
                        React.createElement('tr', { key: i, style: { borderBottom: '1px solid var(--border-light)' } },
                          React.createElement('td', { style: { padding: '10px 0', fontWeight: 600 } }, t.drug_name),
                          React.createElement('td', { style: { padding: '10px 0', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-muted)' } }, t.start_date || '-'),
                          React.createElement('td', { style: { padding: '10px 0', fontSize: 12, color: 'var(--text-muted)' } }, t.dosage || '-'),
                          React.createElement('td', { style: { padding: '10px 0' } },
                            t.response
                              ? React.createElement('span', { className: 'risk-badge', style: { background: 'var(--blue-pale)', color: 'var(--blue)' } }, RESPONSE_LABELS[t.response] || t.response)
                              : '-'
                          )
                        )
                      )
                    )
                  )
                : React.createElement('p', { style: { color: 'var(--text-muted)', fontSize: 13 } }, 'Henüz tedavi kaydı bulunmamaktadır.')
            )
          ),

          // RANO follow-up timeline
          React.createElement(RanoTimeline, { patientId: patient.patient_id }),

          // Multi-TP MRI karşılaştırma (≥2 zaman noktası varsa)
          React.createElement(MultiTpCompare, { patientId: patient.patient_id }),

          // Multidisipliner konsey notları
          React.createElement(CaseNotes, { patientId: patient.patient_id }),

          // MRI Viewer
          React.createElement('div', { className: 'card', style: { overflow: 'hidden' } },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title' }, 'Tümör Görüntüleme')),
            React.createElement(MRIViewer, {
              axis: viewerAxis, slice: viewerSlice,
              maxSlice: maxSlices[viewerAxis],
              onAxisChange: a => { setViewerAxis(a); setViewerSlice(Math.floor(maxSlices[a] / 2)); },
              onSliceChange: setViewerSlice, segOverlay: true,
              sessionId: patient.session_id || '00e6a88b',
              files: (patient.files && patient.files.length) ? patient.files : [
                { filename: 'T1w.nii',      modality: 'T1',    confidence: 99, shape: [240, 240, 155] },
                { filename: 'T1c.nii',      modality: 'T1ce',  confidence: 99, shape: [240, 240, 155] },
                { filename: 'T2w.nii',      modality: 'T2',    confidence: 99, shape: [240, 240, 155] },
                { filename: 'FLAIR.nii',    modality: 'FLAIR', confidence: 99, shape: [240, 240, 155] },
                { filename: 'whole.nii.gz', modality: 'SEG',   confidence: 95, shape: [240, 240, 155] },
              ]
            })
          )
        )
  );
}

/* ━━━ Multi-timepoint MR yan-yana karşılaştırma ━━━━━━ */
function MultiTpCompare({ patientId }) {
  const [data, setData] = React.useState(null);
  const [leftTp, setLeftTp] = React.useState(0);
  const [rightTp, setRightTp] = React.useState(null);
  const [axis, setAxis] = React.useState('axial');
  const [slice, setSlice] = React.useState(77);
  const maxSlices = { axial: 154, coronal: 239, sagittal: 239 };

  React.useEffect(() => {
    GBM_API.getRano(patientId).then(d => {
      setData(d);
      if (d?.events?.length > 1) setRightTp(d.events.length - 1);
    });
  }, [patientId]);

  if (!data || !data.events || data.events.length < 2) {
    return null; // tek timepoint varsa bu bölümü gösterme
  }

  const events = data.events;
  const lE = events.find(e => e.timepoint === leftTp) || events[0];
  const rE = events.find(e => e.timepoint === rightTp) || events[events.length - 1];

  // Demo session/files (gerçek hastada patient.session_id'den gelir)
  const DEMO = [
    { fn: 'T1c.nii',      session: '00e6a88b' },
    { fn: 'T1c.nii',      session: '2a99c3db' },
  ];
  const leftFiles = [
    { filename: 'T1c.nii', modality: 'T1ce', confidence: 99, shape: [240,240,155] },
    { filename: 'whole.nii.gz', modality: 'SEG', confidence: 95, shape: [240,240,155] },
  ];
  const leftSession = DEMO[Math.min(leftTp, DEMO.length-1)]?.session || '00e6a88b';
  const rightSession = DEMO[Math.min(rightTp, DEMO.length-1)]?.session || '2a99c3db';

  const dV = (rE.tumor_volume_cm3 || 0) - (lE.tumor_volume_cm3 || 0);
  const dPct = lE.tumor_volume_cm3 ? (dV / lE.tumor_volume_cm3 * 100) : 0;
  const ranoColor = (rE.rano_class === 'PD') ? 'var(--red)' :
                    (rE.rano_class === 'PR' || rE.rano_class === 'CR') ? 'var(--green)' :
                    'var(--yellow)';

  return React.createElement('div', { className: 'card' },
    React.createElement('div', { className: 'section-head' },
      React.createElement('div', { className: 'section-title' }, 'ZAMAN NOKTASI MR KARŞILAŞTIRMASI'),
      React.createElement('span', { className: 'section-badge' },
        events.length + ' zaman noktası')
    ),
    React.createElement('div', { className: 'card-body' },
      // TP selectors + axis/slice ortak kontrol
      React.createElement('div', { style: { display: 'grid',
        gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12, alignItems: 'center' }
      },
        React.createElement('div', null,
          React.createElement('label', { className: 'form-label' }, 'Sol — Zaman Noktası'),
          React.createElement('select', { className: 'form-select', value: leftTp,
            onChange: e => setLeftTp(parseInt(e.target.value)) },
            events.map(e => React.createElement('option', { key: e.id, value: e.timepoint },
              `TP${e.timepoint} · ${e.rano_class || '—'} · ${(e.tumor_volume_cm3||0).toFixed(1)} cm³`))
          )
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'form-label' }, 'Sağ — Zaman Noktası'),
          React.createElement('select', { className: 'form-select', value: rightTp ?? '',
            onChange: e => setRightTp(parseInt(e.target.value)) },
            events.map(e => React.createElement('option', { key: e.id, value: e.timepoint },
              `TP${e.timepoint} · ${e.rano_class || '—'} · ${(e.tumor_volume_cm3||0).toFixed(1)} cm³`))
          )
        )
      ),

      // Ortak axis + slice kontrol
      React.createElement('div', { style: { display: 'flex', gap: 10, alignItems: 'center',
        padding: '8px 12px', background: 'var(--surface-tint)', borderRadius: 6, marginBottom: 12 } },
        React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' } }, 'Eksen:'),
        ['axial', 'coronal', 'sagittal'].map(a =>
          React.createElement('button', { key: a,
            className: 'btn btn-sm ' + (axis === a ? 'btn-primary' : 'btn-outline'),
            onClick: () => { setAxis(a); setSlice(Math.floor(maxSlices[a] / 2)); }
          }, a === 'axial' ? 'AX' : a === 'coronal' ? 'COR' : 'SAG')
        ),
        React.createElement('span', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginLeft: 12 } }, 'Dilim:'),
        React.createElement('input', { type: 'range', min: 0, max: maxSlices[axis], value: slice,
          onChange: e => setSlice(parseInt(e.target.value)), style: { flex: 1 } }),
        React.createElement('span', { style: { fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text)', minWidth: 70, textAlign: 'right' } },
          `${slice} / ${maxSlices[axis]}`)
      ),

      // Yan yana 2 viewer
      React.createElement('div', { style: { display: 'grid',
        gridTemplateColumns: '1fr 1fr', gap: 12 }
      },
        [{ tp: leftTp, ev: lE, session: leftSession, label: 'TP' + leftTp },
         { tp: rightTp, ev: rE, session: rightSession, label: 'TP' + rightTp }
        ].map((side, i) =>
          React.createElement('div', { key: i,
            style: { background: '#000', borderRadius: 8, overflow: 'hidden', position: 'relative', aspectRatio: '1' }
          },
            React.createElement('img', {
              src: GBM_API.getSliceUrl(side.session, 'T1c.nii', axis, slice, ['whole.nii.gz']),
              alt: side.label,
              style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000' }
            }),
            React.createElement('div', { style: { position: 'absolute', top: 8, left: 8,
              background: 'rgba(13,148,136,0.85)', color: 'white', padding: '3px 10px',
              borderRadius: 3, fontSize: 11, fontWeight: 700, letterSpacing: 0.3 } },
              side.label + ' · ' + (side.ev.rano_class || '—')),
            React.createElement('div', { style: { position: 'absolute', bottom: 8, right: 8,
              background: 'rgba(0,0,0,0.7)', color: 'white', padding: '3px 8px',
              borderRadius: 3, fontSize: 11, fontFamily: 'var(--mono)' } },
              (side.ev.tumor_volume_cm3 || 0).toFixed(1) + ' cm³')
          )
        )
      ),

      // Diff card
      React.createElement('div', { style: { marginTop: 14,
        padding: '12px 16px', background: 'var(--surface-tint)', borderRadius: 6,
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }
      },
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 } }, 'Hacim Δ'),
          React.createElement('div', { style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, color: dV > 0 ? 'var(--red)' : 'var(--green)' } },
            (dV >= 0 ? '+' : '') + dV.toFixed(1) + ' cm³')
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 } }, 'Yüzde Δ'),
          React.createElement('div', { style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 16, color: dPct > 0 ? 'var(--red)' : 'var(--green)' } },
            (dPct >= 0 ? '+' : '') + dPct.toFixed(1) + '%')
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 } }, 'Yeni RANO'),
          React.createElement('div', { style: { fontWeight: 700, fontSize: 16, color: ranoColor } },
            rE.rano_class || '—')
        ),
        React.createElement('div', null,
          React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 } }, 'Tarih Aralığı'),
          React.createElement('div', { style: { fontSize: 12, color: 'var(--text)' } },
            (lE.event_date || '—') + ' → ' + (rE.event_date || '—'))
        )
      )
    )
  );
}

/* ━━━ RANO follow-up timeline ━━━━━━━━━━━━━━━━━━━━━━━━━ */
function RanoTimeline({ patientId }) {
  const [data, setData] = React.useState(null);
  React.useEffect(() => {
    GBM_API.getRano(patientId).then(setData);
  }, [patientId]);
  if (!data || !data.events?.length) {
    return React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' },
        React.createElement('div', { className: 'section-title' }, 'RANO TAKİP'),
        React.createElement('span', { className: 'section-badge' }, '0 MR olayı')),
      React.createElement('div', { className: 'card-body', style: { fontSize: 12.5, color: 'var(--text-muted)' } },
        'Henüz analiz yok. İlk MR analizi yapıldığında baseline (BL) olarak kaydedilir; sonraki MR\'lar RANO kriterleri ile (CR/PR/SD/PD) otomatik sınıflandırılır.')
    );
  }
  const events = data.events;
  const maxVol = Math.max(...events.map(e => e.tumor_volume_cm3 || 0), 1);
  const RANO_COLORS = { BL: '#64748b', CR: '#15803d', PR: '#22c55e', SD: '#b45309', PD: '#dc2626' };
  const RANO_LABELS = { BL: 'Baseline', CR: 'Tam Yanıt', PR: 'Parsiyel', SD: 'Stabil', PD: 'Progresyon' };

  return React.createElement('div', { className: 'card' },
    React.createElement('div', { className: 'section-head' },
      React.createElement('div', { className: 'section-title' }, 'RANO TAKİP'),
      React.createElement('span', { className: 'section-badge' }, events.length + ' zaman noktası')
    ),
    React.createElement('div', { className: 'card-body' },
      // Volume trend bar chart
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'flex-end', gap: 14, height: 140,
                 padding: '8px 0', borderBottom: '1px solid var(--border-light)', marginBottom: 14 }
      },
        events.map(e => React.createElement('div', { key: e.id,
          style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }
        },
          React.createElement('div', { style: { fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--text)' } },
            (e.tumor_volume_cm3 || 0).toFixed(1) + ' cm³'),
          React.createElement('div', {
            style: { width: '100%', height: ((e.tumor_volume_cm3 || 0) / maxVol * 100) + '%',
                     minHeight: 4, background: RANO_COLORS[e.rano_class] || '#94a3b8',
                     borderRadius: '4px 4px 0 0', transition: 'all 0.3s' }
          }),
          React.createElement('div', { style: { fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--mono)' } },
            'TP' + e.timepoint),
          e.volume_change_pct != null && React.createElement('div', {
            style: { fontSize: 10, color: e.volume_change_pct > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }
          }, (e.volume_change_pct > 0 ? '+' : '') + e.volume_change_pct.toFixed(0) + '%'),
          React.createElement('span', {
            style: { fontSize: 9.5, fontWeight: 700, padding: '2px 7px', borderRadius: 10,
                     background: (RANO_COLORS[e.rano_class] || '#94a3b8') + '22',
                     color: RANO_COLORS[e.rano_class] || '#94a3b8' }
          }, e.rano_class || '—')
        ))
      ),
      // Legend + rules
      React.createElement('div', { style: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11 } },
        Object.keys(RANO_COLORS).map(k =>
          React.createElement('div', { key: k, style: { display: 'flex', alignItems: 'center', gap: 6 } },
            React.createElement('span', { style: { width: 12, height: 12, background: RANO_COLORS[k], borderRadius: 2 } }),
            React.createElement('span', { style: { color: 'var(--text-secondary)' } }, k + ' · ' + RANO_LABELS[k])
          )
        )
      ),
      React.createElement('div', { style: { marginTop: 12, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' } },
        'RANO eşikleri: PR ≥30% azalış, PD ≥25% artış, arası SD; enhancing <5% → CR.')
    )
  );
}

/* ━━━ Case notes (MDT konsey) ━━━━━━━━━━━━━━━━━━━━━━━━ */
function CaseNotes({ patientId }) {
  const [notes, setNotes] = React.useState([]);
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    GBM_API.listNotes(patientId).then(d => setNotes(d?.notes || []));
  }, [patientId]);
  React.useEffect(load, [load]);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const r = await GBM_API.addNote(patientId, body.trim());
    setBusy(false);
    if (r && r.ok) { setBody(''); load(); }
  };
  const remove = async (id) => {
    if (!confirm('Notu sil?')) return;
    if (await GBM_API.deleteNote(patientId, id)) load();
  };

  const fmtDate = (s) => s ? new Date(s).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'}) : '';

  return React.createElement('div', { className: 'card' },
    React.createElement('div', { className: 'section-head' },
      React.createElement('div', { className: 'section-title' }, 'KONSEY NOTLARI'),
      React.createElement('span', { className: 'section-badge' }, notes.length + ' not')),
    React.createElement('div', { className: 'card-body' },
      // New note form
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 } },
        React.createElement('textarea', {
          value: body, onChange: e => setBody(e.target.value),
          placeholder: 'Konsey notu, klinik yorum, tedavi önerisi...',
          rows: 3,
          style: { padding: '10px 12px', border: '1px solid var(--border)',
                   borderRadius: 6, fontSize: 13, fontFamily: 'var(--font)', resize: 'vertical' }
        }),
        React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          React.createElement('span', { style: { fontSize: 11, color: 'var(--text-muted)' } },
            body.length + ' karakter'),
          React.createElement('button', {
            className: 'btn btn-primary btn-sm', onClick: submit, disabled: busy || !body.trim(),
          }, busy ? 'Kaydediliyor...' : '+ Not Ekle')
        )
      ),
      // Notes list
      notes.length === 0
        ? React.createElement('div', { style: { fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', padding: 20 } },
            'Henüz konsey notu yok.')
        : React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            notes.map(n => React.createElement('div', { key: n.id,
              style: { padding: '10px 12px', background: 'var(--surface-tint)',
                       borderLeft: '3px solid var(--accent)', borderRadius: 4 }
            },
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 4 } },
                React.createElement('div', null,
                  React.createElement('span', { style: { fontWeight: 700, fontSize: 12.5 } },
                    n.author_name || 'Anonim'),
                  React.createElement('span', { style: { fontSize: 10.5, color: 'var(--text-muted)', marginLeft: 8, textTransform: 'uppercase' } },
                    n.author_role || '')
                ),
                React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
                  fmtDate(n.created_at),
                  React.createElement('button', {
                    onClick: () => remove(n.id),
                    title: 'Sil',
                    style: { background: 'transparent', border: 'none', color: 'var(--text-faint)',
                             cursor: 'pointer', marginLeft: 8, fontSize: 14 }
                  }, '×')
                )
              ),
              React.createElement('div', { style: { fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.45 } },
                n.body)
            ))
          )
    )
  );
}

/* ━━━ COHORT PAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function CohortPage() {
  const s = MOCK.cohortStats;
  return React.createElement('div', { className: 'page-fade' },
    React.createElement('div', { className: 'kpi-row' },
      [
        { label: 'Toplam Hasta', value: s.total_patients, sub: 'kayıtlı hasta' },
        { label: 'Analiz Edilmiş', value: s.analyzed, sub: 'MRI analizi mevcut' },
        { label: 'Ort. Risk Skoru', value: s.avg_risk, sub: 'kohort ortalaması' },
        { label: 'Ort. 6-Ay Sağkalım', value: '%' + s.avg_surv, sub: 'model tahmini' },
      ].map((k, i) =>
        React.createElement('div', { key: k.label, className: 'kpi-card' + (i === 0 ? ' accent' : '') },
          React.createElement('div', { className: 'kpi-label' }, k.label),
          React.createElement('div', { className: 'kpi-value' }, k.value),
          React.createElement('div', { className: 'kpi-sub' }, k.sub)
        )
      )
    ),

    // Kaplan-Meier full width
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' },
        React.createElement('div', { className: 'section-title' }, 'KAPLAN-MEIER SAĞKALIM EĞRİSİ'),
        React.createElement('span', { className: 'section-badge' }, 'Risk gruplarına göre · 24 ay')
      ),
      React.createElement('div', { className: 'card-body' },
        React.createElement(KaplanMeier, { curves: MOCK.kmCurves, height: 280 })
      )
    ),

    // Distributions with donuts
    React.createElement('div', { className: 'grid-2col' },
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'section-head' },
          React.createElement('div', { className: 'section-title' }, 'RİSK SINIFI DAĞILIMI')),
        React.createElement('div', { className: 'card-body' },
          React.createElement(DonutChart, {
            data: { 'Düşük': s.risk_dist.low, 'Orta': s.risk_dist.medium, 'Yüksek': s.risk_dist.high },
            colors: { 'Düşük': 'var(--green)', 'Orta': 'var(--yellow)', 'Yüksek': 'var(--red)' },
            size: 160, thickness: 26
          })
        )
      ),
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'section-head' },
          React.createElement('div', { className: 'section-title' }, 'YAŞ DAĞILIMI')),
        React.createElement('div', { className: 'card-body' },
          React.createElement(StatBarChart, { data: s.age_bins, colorMap: {} })
        )
      )
    ),

    React.createElement('div', { className: 'grid-2col' },
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'section-head' },
          React.createElement('div', { className: 'section-title' }, 'MGMT METİLASYON')),
        React.createElement('div', { className: 'card-body' },
          React.createElement(DonutChart, {
            data: { 'Metile': s.mgmt_dist.methylated, 'Metile Değil': s.mgmt_dist.unmethylated, 'Bilinmiyor': s.mgmt_dist.unknown },
            colors: { 'Metile': 'var(--green)', 'Metile Değil': 'var(--red)', 'Bilinmiyor': 'var(--text-faint)' },
            size: 160, thickness: 26
          })
        )
      ),
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'section-head' },
          React.createElement('div', { className: 'section-title' }, 'IDH1 MUTASYON')),
        React.createElement('div', { className: 'card-body' },
          React.createElement(DonutChart, {
            data: { 'Mutant': s.idh1_dist.mutant, 'Wildtype': s.idh1_dist.wildtype, 'Bilinmiyor': s.idh1_dist.unknown },
            colors: { 'Mutant': 'var(--blue)', 'Wildtype': 'var(--orange)', 'Bilinmiyor': 'var(--text-faint)' },
            size: 160, thickness: 26
          })
        )
      )
    )
  );
}

/* ━━━ HELP PAGE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function HelpPage() {
  return React.createElement('div', { className: 'page-fade' },
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' }, React.createElement('div', { className: 'section-title' }, 'SİSTEM HAKKINDA')),
      React.createElement('div', { className: 'card-body' },
        React.createElement('div', { className: 'help-block' },
          React.createElement('h3', null, 'GBM-AID Nedir?'),
          React.createElement('p', null, 'GBM-AID, Glioblastoma Multiforme (GBM) hastalarında MR görüntüleri, klinik veriler ve moleküler/epigenetik omics profillerinden yararlanarak hekime gerçek zamanlı, kanıta dayalı karar desteği sunan entegre bir yapay zeka sistemidir.'),
          React.createElement('p', { style: { marginTop: 8 } },
            React.createElement('strong', null, 'Bu sistem tanı veya tedavi kararı vermez.'), ' Yalnızca hekime nicel ve açıklanabilir karar desteği sağlar.')
        )
      )
    ),
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' }, React.createElement('div', { className: 'section-title' }, 'KULLANIM KILAVUZU')),
      React.createElement('div', { className: 'card-body' },
        React.createElement('div', { className: 'help-block' },
          React.createElement('h3', null, '1. Veri Yükleme'),
          React.createElement('ul', null,
            React.createElement('li', null, 'Analiz sekmesindeki yükleme alanına NIfTI (.nii veya .nii.gz) dosyalarını sürükleyin.'),
            React.createElement('li', null, 'Sistem dosya adlarından T1, T1ce, T2, FLAIR ve segmentasyon maskesini otomatik tanır.'),
            React.createElement('li', null, 'BraTS format: ', React.createElement('code', null, '*_t1.nii.gz'), ', ', React.createElement('code', null, '*_t1ce.nii.gz'), ', ', React.createElement('code', null, '*_t2.nii.gz'), ', ', React.createElement('code', null, '*_flair.nii.gz'))
          )
        ),
        React.createElement('div', { className: 'help-block' },
          React.createElement('h3', null, '2. Klinik Parametre Girişi'),
          React.createElement('ul', null,
            React.createElement('li', null, React.createElement('strong', null, 'Yaş:'), ' Hastanın tanı anındaki yaşı.'),
            React.createElement('li', null, React.createElement('strong', null, 'KPS:'), ' Karnofsky Performans Skoru (0-100).'),
            React.createElement('li', null, React.createElement('strong', null, 'MGMT:'), ' Metile / Metile Değil / Bilinmiyor.'),
            React.createElement('li', null, React.createElement('strong', null, 'IDH1:'), ' Mutant / Wildtype / Bilinmiyor.')
          )
        ),
        React.createElement('div', { className: 'help-block' },
          React.createElement('h3', null, '3. Sonuçlar & Görselleştirmeler'),
          React.createElement('ul', null,
            React.createElement('li', null, React.createElement('strong', null, 'Risk Skoru:'), ' Cox PH modeli ile 0-100 arası sürekli değer.'),
            React.createElement('li', null, React.createElement('strong', null, 'Kaplan-Meier:'), ' Risk gruplarına göre kohort sağkalım eğrisi.'),
            React.createElement('li', null, React.createElement('strong', null, 'Radyomik Radar:'), ' 8 boyutlu tümör profili.'),
            React.createElement('li', null, React.createElement('strong', null, 'Risk Atfı:'), ' Her klinik/radyomik faktörün risk üzerine etkisi (waterfall).'),
            React.createElement('li', null, React.createElement('strong', null, 'Hasta Karşılaştırma:'), ' 2-3 hastayı yan yana inceleyin.'),
            React.createElement('li', null, React.createElement('strong', null, 'Zaman Çizelgesi:'), ' Tümör hacmi + tedavi olayları (raporlarda).')
          )
        )
      )
    )
  );
}

/* ━━━ SCIENCE / VALIDATION PAGE ━━━━━━━━━━━━━━━━━━━━━ */
function SciencePage() {
  const [filters, setFilters] = React.useState({
    mgmt: '', idh1: '', gender: '',
    age_min: '', age_max: '', kps_min: '', kps_max: '',
    stratify: 'mgmt',
  });
  const [kmData, setKmData] = React.useState(null);
  const [calib, setCalib] = React.useState(null);
  const [card, setCard] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  const reloadKM = React.useCallback(async () => {
    setLoading(true);
    const r = await GBM_API.getCohortKM(filters);
    setKmData(r);
    setLoading(false);
  }, [filters]);
  React.useEffect(() => { reloadKM(); }, [reloadKM]);
  React.useEffect(() => {
    GBM_API.getCalibration().then(setCalib);
    GBM_API.getModelCard().then(setCard);
  }, []);

  const setF = (k, v) => setFilters(prev => ({ ...prev, [k]: v }));

  const MGMT_OPTS = [
    { v: 'methylated', l: 'Metile' }, { v: 'unmethylated', l: 'Metile Değil' },
    { v: 'unknown', l: 'Bilinmiyor' },
  ];
  const IDH_OPTS = [
    { v: 'mutant', l: 'Mutant' }, { v: 'wildtype', l: 'Wildtype' },
    { v: 'unknown', l: 'Bilinmiyor' },
  ];
  const STRAT_OPTS = [
    { v: 'none', l: 'Tek eğri' }, { v: 'mgmt', l: 'MGMT' },
    { v: 'idh1', l: 'IDH1' }, { v: 'risk_class', l: 'Risk Sınıfı' },
    { v: 'age_group', l: 'Yaş Grubu' },
  ];

  const cohortCurves = (kmData?.curves || []).map(c => ({
    label: c.label, color: c.color, n0: c.n0,
    events: c.events || [], censored: c.censored || [],
  }));

  return React.createElement('div', { className: 'page-fade' },
    // Header banner
    React.createElement('div', { className: 'card', style: { borderLeft: '4px solid var(--accent)', background: 'linear-gradient(135deg, var(--surface) 0%, var(--accent-light) 100%)' } },
      React.createElement('div', { className: 'section-head', style: { borderBottom: 'none' } },
        React.createElement('div', { className: 'section-title' }, 'BİLİM & MODEL DOĞRULAMA'),
        React.createElement('span', { className: 'section-badge' }, 'Yayın-grade analiz')
      ),
      React.createElement('div', { className: 'card-body', style: { paddingTop: 0, fontSize: 13, color: 'var(--text-secondary)' } },
        'Modelin gerçek hasta verisi üzerindeki performansını ve filtrelenebilir kohort sağkalım eğrilerini inceleyin. ' +
        'Tüm grafikler canlı veriden hesaplanır.'
      )
    ),

    // Filter panel
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' },
        React.createElement('div', { className: 'section-title' }, 'KOHORT FİLTRELERİ'),
        kmData && React.createElement('span', { className: 'section-badge' },
          `${kmData.total_filtered} hasta · ${cohortCurves.length} stratum`)
      ),
      React.createElement('div', { className: 'card-body', style: { display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }
      },
        // MGMT multi-select (single for now)
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'MGMT'),
          React.createElement('select', { className: 'form-select', value: filters.mgmt,
            onChange: e => setF('mgmt', e.target.value) },
            React.createElement('option', { value: '' }, 'Tümü'),
            MGMT_OPTS.map(o => React.createElement('option', { key: o.v, value: o.v }, o.l))
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'IDH1'),
          React.createElement('select', { className: 'form-select', value: filters.idh1,
            onChange: e => setF('idh1', e.target.value) },
            React.createElement('option', { value: '' }, 'Tümü'),
            IDH_OPTS.map(o => React.createElement('option', { key: o.v, value: o.v }, o.l))
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Cinsiyet'),
          React.createElement('select', { className: 'form-select', value: filters.gender,
            onChange: e => setF('gender', e.target.value) },
            React.createElement('option', { value: '' }, 'Tümü'),
            React.createElement('option', { value: 'M' }, 'Erkek'),
            React.createElement('option', { value: 'F' }, 'Kadın')
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Yaş (min–max)'),
          React.createElement('div', { style: { display: 'flex', gap: 4 } },
            React.createElement('input', { className: 'form-input', type: 'number', placeholder: '18',
              value: filters.age_min, onChange: e => setF('age_min', e.target.value) }),
            React.createElement('input', { className: 'form-input', type: 'number', placeholder: '90',
              value: filters.age_max, onChange: e => setF('age_max', e.target.value) })
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'KPS (min–max)'),
          React.createElement('div', { style: { display: 'flex', gap: 4 } },
            React.createElement('input', { className: 'form-input', type: 'number', placeholder: '40',
              value: filters.kps_min, onChange: e => setF('kps_min', e.target.value) }),
            React.createElement('input', { className: 'form-input', type: 'number', placeholder: '100',
              value: filters.kps_max, onChange: e => setF('kps_max', e.target.value) })
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Stratifiye et'),
          React.createElement('select', { className: 'form-select', value: filters.stratify,
            onChange: e => setF('stratify', e.target.value) },
            STRAT_OPTS.map(o => React.createElement('option', { key: o.v, value: o.v }, o.l))
          )
        )
      )
    ),

    // KM curves
    React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' },
        React.createElement('div', { className: 'section-title' }, 'KOHORT SAĞKALIM EĞRİSİ'),
        React.createElement('span', { className: 'section-badge' },
          'Gerçek survival_days · Product-limit')
      ),
      React.createElement('div', { className: 'card-body' },
        loading
          ? React.createElement('div', { style: { padding: 30, textAlign: 'center', color: 'var(--text-muted)' } }, 'Yükleniyor...')
          : cohortCurves.length === 0
          ? React.createElement('div', { style: { padding: 30, textAlign: 'center', color: 'var(--text-muted)' } },
              'Bu filtrelerle hiç hasta yok.')
          : React.createElement(KaplanMeier, { curves: cohortCurves, height: 320,
              maxTime: kmData?.max_months || 36 })
      )
    ),

    // Calibration + Model Card side-by-side
    React.createElement('div', { className: 'grid-2col' },
      // Calibration
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'section-head' },
          React.createElement('div', { className: 'section-title' }, 'KALİBRASYON DİYAGRAMI'),
          React.createElement('span', { className: 'section-badge' },
            calib?.n ? `n=${calib.n}` : '0 örnek')
        ),
        React.createElement('div', { className: 'card-body' },
          !calib
            ? React.createElement('div', { style: { color: 'var(--text-muted)', padding: 20, textAlign: 'center' } }, 'Yükleniyor...')
            : calib.n === 0
            ? React.createElement('div', { style: { color: 'var(--text-muted)', padding: 20, textAlign: 'center', fontSize: 12.5 } },
                calib.note || 'Yeterli veri yok')
            : React.createElement(CalibrationPlot, { bins: calib.bins, brier: calib.brier_score, height: 320 })
        )
      ),
      // Model Card
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'section-head' },
          React.createElement('div', { className: 'section-title' }, 'MODEL KARTI'),
          card && React.createElement('span', { className: 'section-badge', style: { fontFamily: 'var(--mono)' } },
            card.model_version)
        ),
        React.createElement('div', { className: 'card-body', style: { fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.55 } },
          !card
            ? 'Yükleniyor...'
            : React.createElement(React.Fragment, null,
                React.createElement('div', { style: { marginBottom: 10 } },
                  React.createElement('div', { style: { fontWeight: 700, color: 'var(--text)' } }, 'Model Tipi'),
                  card.model_type
                ),
                React.createElement('div', { style: { marginBottom: 10 } },
                  React.createElement('div', { style: { fontWeight: 700, color: 'var(--text)' } },
                    `Eğitim Verisi (n=${card.training?.n_train || '?'})`),
                  card.training?.source
                ),
                React.createElement('div', { style: { marginBottom: 10 } },
                  React.createElement('div', { style: { fontWeight: 700, color: 'var(--text)' } }, 'Öznitelikler'),
                  React.createElement('div', { style: { fontSize: 11.5, color: 'var(--text-muted)' } },
                    (card.training?.features || []).join(' · '))
                ),
                React.createElement('div', { style: { marginBottom: 10 } },
                  React.createElement('div', { style: { fontWeight: 700, color: 'var(--text)' } }, 'Doğrulama'),
                  card.validation?.method
                ),
                React.createElement('div', { style: { marginBottom: 10 } },
                  React.createElement('div', { style: { fontWeight: 700, color: 'var(--text)' } }, 'Sınırlamalar'),
                  React.createElement('ul', { style: { margin: '4px 0 0 18px', padding: 0, fontSize: 12 } },
                    (card.limitations || []).map((l, i) => React.createElement('li', { key: i, style: { marginBottom: 2 } }, l))
                  )
                )
              )
        )
      )
    ),

    // Database stats footer
    card && React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' },
        React.createElement('div', { className: 'section-title' }, 'CANLI VERİTABANI İSTATİSTİKLERİ')),
      React.createElement('div', { className: 'card-body', style: { display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }
      },
        [
          { l: 'Toplam Hasta', v: card.database_stats?.total_patients },
          { l: 'Analiz Edilmiş', v: card.database_stats?.analyzed },
          { l: 'Bilinen Sonuç', v: card.database_stats?.with_known_outcome },
          { l: 'Vefat Eden', v: card.database_stats?.deceased },
        ].map((s, i) => React.createElement('div', { key: i, style: { textAlign: 'center', padding: 10, background: 'var(--surface-tint)', borderRadius: 6 } },
          React.createElement('div', { style: { fontSize: 22, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)' } }, s.v ?? '—'),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600, marginTop: 4 } }, s.l)
        ))
      )
    ),

    // References
    card?.references?.length > 0 && React.createElement('div', { className: 'card' },
      React.createElement('div', { className: 'section-head' },
        React.createElement('div', { className: 'section-title' }, 'KAYNAKLAR')),
      React.createElement('div', { className: 'card-body' },
        card.references.map(r => React.createElement('div', { key: r.pmid,
          style: { padding: '8px 0', borderBottom: '1px solid var(--border-light)', fontSize: 12.5 } },
          React.createElement('strong', { style: { color: 'var(--accent-dark)', fontFamily: 'var(--mono)', fontSize: 11 } },
            '[PMID: ' + r.pmid + '] '),
          React.createElement('span', null, r.title),
          React.createElement('span', { style: { color: 'var(--text-muted)', marginLeft: 6, fontSize: 11 } },
            '(' + r.year + ')')
        ))
      )
    )
  );
}

window.SciencePage = SciencePage;
window.RecordsPage = RecordsPage;
window.ReportsPage = ReportsPage;
window.CohortPage = CohortPage;
window.HelpPage = HelpPage;
