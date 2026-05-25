/* compare-page.jsx — Patient side-by-side comparison */

function ComparePage({ patients, onViewReport, preselectedIds }) {
  // Yalnızca patients listesinde gerçekten var olan ID'leri başlat
  const validInitial = (preselectedIds || []).filter(id => patients.some(p => p.patient_id === id));
  const [selectedIds, setSelectedIds] = React.useState(validInitial);
  const [showPicker, setShowPicker] = React.useState(validInitial.length < 2);

  // Update when preselectedIds change (coming from Records page)
  React.useEffect(() => {
    if (preselectedIds && preselectedIds.length >= 2) {
      setSelectedIds(preselectedIds);
    }
  }, [preselectedIds]);

  const selected = selectedIds.map(id => patients.find(p => p.patient_id === id)).filter(Boolean);

  const togglePatient = (pid) => {
    setSelectedIds(prev => {
      if (prev.includes(pid)) return prev.filter(x => x !== pid);
      if (prev.length >= 3) return prev;
      return [...prev, pid];
    });
  };

  const removePatient = (pid) => {
    setSelectedIds(prev => prev.filter(x => x !== pid));
  };

  // Comparison rows
  const rows = [
    { label: 'Yaş', get: p => p.age },
    { label: 'Cinsiyet', get: p => p.gender === 'M' ? 'Erkek' : p.gender === 'F' ? 'Kadın' : '-' },
    { label: 'KPS Skoru', get: p => p.kps_score },
    { label: 'Tümör Lokalizasyonu', get: p => ({ frontal:'Frontal',temporal:'Temporal',parietal:'Parietal',occipital:'Oksipital',insular:'İnsula',multifocal:'Multifokal' }[p.tumor_location] || '-') },
    { label: 'Cerrahi Tipi', get: p => p.surgery_type || '-' },
    { label: 'MGMT', get: p => p.mgmt_status === 'methylated' ? '✓ Metile' : p.mgmt_status === 'unmethylated' ? '✗ Metile Değil' : '-', color: p => p.mgmt_status === 'methylated' ? 'var(--green)' : p.mgmt_status === 'unmethylated' ? 'var(--red)' : null },
    { label: 'IDH1', get: p => p.idh1_status === 'mutant' ? '✓ Mutant' : p.idh1_status === 'wildtype' ? '○ Wildtype' : '-', color: p => p.idh1_status === 'mutant' ? 'var(--blue)' : null },
    { label: 'Tanı Tarihi', get: p => p.diagnosis_date || '-' },
    { label: 'Tedavi Protokolü', get: p => p.treatment_protocol || '-' },
  ];

  const fmt = (v, d = 1, unit = '') => v != null && !isNaN(v) ? v.toFixed(d) + unit : '-';
  const prognosticRows = [
    { label: 'Risk Skoru', get: p => p.risk_score != null ? Math.round(p.risk_score) + '/100' : '-', bold: true },
    { label: 'Risk Sınıfı', get: p => p.risk_class ? React.createElement('span', { className: 'risk-badge ' + p.risk_class }, p.risk_label) : '-' },
    { label: '6 Aylık Sağkalım', get: p => p.survival_6m_pct != null ? '%' + p.survival_6m_pct.toFixed(1) : '-', bold: true },
    { label: 'Whole Tümör', get: p => fmt(p.tumor_volume, 1, ' cm³') },
    { label: 'Necrotic Core', get: p => fmt(p.core_volume, 1, ' cm³') },
    { label: 'Enhancing', get: p => fmt(p.enhancing_volume, 1, ' cm³') },
    { label: 'Sferiklik', get: p => fmt(p.sphericity, 2) },
  ];

  // Radar comparison data (normalized features) — null-safe
  const radarFeatures = {};
  selected.forEach(p => {
    const tv = p.tumor_volume || 0;
    radarFeatures[p.patient_id] = {
      'Hacim': tv ? Math.min(1, tv / 80) : 0,
      'Nekroz': tv && p.core_volume != null ? p.core_volume / tv : 0,
      'Enhancing': tv && p.enhancing_volume != null ? p.enhancing_volume / tv : 0,
      'Sferiklik': p.sphericity || 0.7,
      'Yaş Risk': (p.age || 0) / 90,
      'KPS': p.kps_score != null ? 1 - (p.kps_score / 100) : 0,
    };
  });

  const compareColors = ['var(--accent)', '#ec4899', '#8b5cf6'];

  return React.createElement('div', { className: 'page-fade' },
    React.createElement('div', { className: 'container' },

      // Patient selection toolbar
      React.createElement('div', { className: 'card' },
        React.createElement('div', { className: 'section-head' },
          React.createElement('div', { className: 'section-title' }, 'HASTA KARŞILAŞTIRMASI'),
          React.createElement('span', { className: 'section-badge' }, 'En fazla 3 hasta')
        ),
        React.createElement('div', { style: { padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)' } },
          React.createElement('span', { style: { fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 } }, 'SEÇİLİ:'),
          selected.length === 0 && React.createElement('span', { style: { fontSize: 13, color: 'var(--text-muted)' } }, 'Karşılaştırmak için hasta seçin...'),
          selected.map((p, i) =>
            React.createElement('div', { key: p.patient_id, className: 'patient-picker-chip', style: { borderColor: compareColors[i], background: compareColors[i] + '22', color: compareColors[i] } },
              p.patient_id,
              React.createElement('button', { onClick: () => removePatient(p.patient_id) }, '×')
            )
          ),
          selected.length < 3 && React.createElement('button', {
            className: 'btn btn-outline btn-sm',
            onClick: () => setShowPicker(!showPicker)
          }, showPicker ? 'Kapat' : '+ Hasta Ekle')
        ),
        showPicker && React.createElement('div', { style: { padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8, maxHeight: 280, overflowY: 'auto' } },
          patients.map(p => {
            const isSelected = selectedIds.includes(p.patient_id);
            return React.createElement('div', { key: p.patient_id,
              onClick: () => togglePatient(p.patient_id),
              style: {
                padding: '10px 12px', border: '1px solid ' + (isSelected ? 'var(--accent)' : 'var(--border)'),
                borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: isSelected ? 'var(--accent-light)' : 'var(--surface)',
                fontSize: 12, transition: 'all 0.15s'
              }
            },
              React.createElement('div', { style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12 } }, p.patient_id),
              React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } },
                [
                  p.age != null ? p.age + 'y' : null,
                  p.gender === 'M' ? 'E' : p.gender === 'F' ? 'K' : null,
                  p.risk_score != null ? 'Risk ' + Math.round(p.risk_score) : null
                ].filter(Boolean).join(' · ') || 'Veri eksik')
            );
          })
        )
      ),

      selected.length < 2
        ? React.createElement('div', { className: 'empty' },
            React.createElement('div', { className: 'empty-icon' }, '⇆'),
            React.createElement('p', null, 'Karşılaştırma yapmak için en az 2 hasta seçin.'))
        : React.createElement('div', null,
            // Risk comparison cards
            React.createElement('div', { className: 'compare-grid' },
              selected.map((p, i) =>
                React.createElement('div', { key: p.patient_id, className: 'compare-col', style: { borderTop: '4px solid ' + compareColors[i] } },
                  React.createElement('div', { className: 'compare-pid', style: { color: compareColors[i] } }, p.patient_id),
                  React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 } },
                    [
                      p.age != null ? p.age + ' yaş' : null,
                      p.gender === 'M' ? 'Erkek' : p.gender === 'F' ? 'Kadın' : null,
                      p.kps_score != null ? 'KPS ' + p.kps_score : null
                    ].filter(Boolean).join(' · ') || 'Klinik bilgi yok'),

                  // Big risk display
                  React.createElement('div', { style: { textAlign: 'center', padding: '12px 0', marginBottom: 14, borderRadius: 'var(--radius-sm)', background: 'var(--surface-tint)' } },
                    React.createElement('div', { style: { fontSize: 40, fontWeight: 800, color: 'var(--text)', letterSpacing: -1.5, lineHeight: 1, fontFamily: 'var(--mono)' } },
                      p.risk_score != null ? Math.round(p.risk_score) : '—'),
                    React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4, fontWeight: 600 } }, 'Risk Skoru'),
                    React.createElement('div', { style: { marginTop: 8 } },
                      p.risk_class
                        ? React.createElement('span', { className: 'risk-badge ' + p.risk_class }, p.risk_label)
                        : React.createElement('span', { style: { fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' } }, 'Analiz yok'))
                  ),

                  // Survival bar
                  React.createElement('div', { style: { marginBottom: 14 } },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 } },
                      React.createElement('span', { style: { color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 } }, '6-Ay Sağkalım'),
                      React.createElement('span', { style: { fontWeight: 700, fontFamily: 'var(--mono)' } },
                        p.survival_6m_pct != null ? '%' + p.survival_6m_pct.toFixed(0) : '—')
                    ),
                    React.createElement('div', { className: 'progress-bar' },
                      React.createElement('div', { className: 'progress-fill', style: {
                        width: (p.survival_6m_pct != null ? p.survival_6m_pct : 0) + '%',
                        background: (p.survival_6m_pct || 0) > 50 ? 'var(--green)' : 'var(--yellow)'
                      } })
                    )
                  ),

                  React.createElement('button', { className: 'btn btn-outline btn-sm', style: { width: '100%', justifyContent: 'center' }, onClick: () => onViewReport(p.patient_id) },
                    'Detaylı Rapor →')
                )
              )
            ),

            // Side-by-side parameter comparison
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'KLİNİK PARAMETRELER')
              ),
              React.createElement('div', { style: { padding: '4px 20px 16px' } },
                rows.map((row, ri) =>
                  React.createElement('div', { key: ri, style: { display: 'grid', gridTemplateColumns: '180px ' + selected.map(() => '1fr').join(' '), padding: '10px 0', borderBottom: ri < rows.length - 1 ? '1px solid var(--border-light)' : 'none', alignItems: 'center', fontSize: 13 } },
                    React.createElement('span', { style: { color: 'var(--text-muted)', fontWeight: 500 } }, row.label),
                    selected.map((p, pi) =>
                      React.createElement('span', { key: p.patient_id, style: { fontWeight: 600, color: row.color ? row.color(p) || 'var(--text)' : 'var(--text)' } }, row.get(p))
                    )
                  )
                )
              )
            ),

            // Prognostic comparison
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'PROGNOSTİK & RADYOMİK')
              ),
              React.createElement('div', { style: { padding: '4px 20px 16px' } },
                prognosticRows.map((row, ri) =>
                  React.createElement('div', { key: ri, style: { display: 'grid', gridTemplateColumns: '180px ' + selected.map(() => '1fr').join(' '), padding: '10px 0', borderBottom: ri < prognosticRows.length - 1 ? '1px solid var(--border-light)' : 'none', alignItems: 'center', fontSize: 13 } },
                    React.createElement('span', { style: { color: 'var(--text-muted)', fontWeight: 500 } }, row.label),
                    selected.map((p, pi) =>
                      React.createElement('span', { key: p.patient_id, style: { fontWeight: row.bold ? 800 : 600, color: 'var(--text)' } }, row.get(p))
                    )
                  )
                )
              )
            ),

            // Radar comparison
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'RADYOMİK PROFİL KARŞILAŞTIRMASI'),
                React.createElement('span', { className: 'section-badge' }, 'Normalize edilmiş özellikler')
              ),
              React.createElement('div', { className: 'card-body' },
                React.createElement(RadiomicRadar, {
                  data: radarFeatures[selected[0].patient_id],
                  label: selected[0].patient_id,
                  color: compareColors[0],
                  compareData: selected[1] ? radarFeatures[selected[1].patient_id] : null,
                  compareLabel: selected[1] ? selected[1].patient_id : null,
                  compareColor: compareColors[1],
                  size: 280
                })
              )
            ),

            // Treatments comparison
            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'TEDAVİ KARŞILAŞTIRMASI')),
              React.createElement('div', { style: { padding: '4px 20px 16px' } },
                React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(' + selected.length + ', 1fr)', gap: 12 } },
                  selected.map((p, pi) =>
                    React.createElement('div', { key: p.patient_id },
                      React.createElement('div', { style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12, color: compareColors[pi], marginBottom: 10, paddingBottom: 8, borderBottom: '2px solid ' + compareColors[pi] } }, p.patient_id),
                      (p.treatments || []).map((t, ti) =>
                        React.createElement('div', { key: ti, style: { padding: '8px 0', borderBottom: '1px solid var(--border-light)' } },
                          React.createElement('div', { style: { fontSize: 12.5, fontWeight: 600, color: 'var(--text)' } }, t.drug_name),
                          React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } },
                            t.start_date + (t.dosage ? ' · ' + t.dosage : '')
                          ),
                          t.response && React.createElement('span', { className: 'risk-badge', style: { marginTop: 4, display: 'inline-block', background: 'var(--blue-pale)', color: 'var(--blue)' } },
                            { complete:'Tam Yanıt',partial:'Parsiyel',stable:'Stabil',progression:'Progresyon' }[t.response] || t.response)
                        )
                      )
                    )
                  )
                )
              )
            )
          )
    )
  );
}

window.ComparePage = ComparePage;
