/* dashboard-page.jsx — Klinik dashboard: gerçek API verisi */

function DashboardPage({ onNavigate, onViewReport, patients }) {
  const [dashData, setDashData] = React.useState(null);
  const [loading, setLoading]   = React.useState(true);

  React.useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && d.total_patients != null) setDashData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // ── Yerel hesaplamalar (API yüklenene kadar fallback) ──────────────────
  const analyzed    = patients.filter(p => p.risk_score != null);
  const highRiskLoc = analyzed.filter(p => p.risk_class === 'high');
  const medRiskLoc  = analyzed.filter(p => p.risk_class === 'medium');
  const lowRiskLoc  = analyzed.filter(p => p.risk_class === 'low');
  const avgRiskLoc  = analyzed.length
    ? Math.round(analyzed.reduce((s, p) => s + p.risk_score, 0) / analyzed.length) : '-';
  const survPts     = analyzed.filter(p => p.survival_6m_pct != null);
  const avgSurvLoc  = survPts.length
    ? Math.round(survPts.reduce((s, p) => s + p.survival_6m_pct, 0) / survPts.length) : '-';

  // ── API verisinden türetilen değerler ──────────────────────────────────
  const totalPatients = dashData ? dashData.total_patients       : patients.length;
  const analyzedCount = dashData ? dashData.analyzed             : analyzed.length;
  const apiAvgRisk    = dashData ? (dashData.avg_risk || avgRiskLoc) : avgRiskLoc;
  const apiAvgSurv    = dashData ? (dashData.avg_surv || avgSurvLoc) : avgSurvLoc;
  const riskDist      = (dashData && dashData.risk_dist)  ? dashData.risk_dist  : { low: lowRiskLoc.length, medium: medRiskLoc.length, high: highRiskLoc.length };
  const highRiskCount = (riskDist && riskDist.high) || 0;
  const ranoDist      = (dashData && dashData.rano_dist) ? dashData.rano_dist  : { CR: 0, PR: 0, SD: 0, PD: 0 };
  const molStats      = dashData ? dashData.mol_stats            : null;
  const thisMonth     = dashData ? dashData.this_month           : null;
  const upcomingMri   = dashData ? (dashData.upcoming_mri || []) : [];
  const progAlerts    = dashData ? (dashData.progression_alerts || []) : [];
  const recentPts     = dashData ? (dashData.recent_patients || []) : analyzed.slice(0, 6);

  // Moleküler / cerrahi: API > yerel
  const mgmtMet   = molStats ? molStats.mgmt_methylated   : patients.filter(p => p.mgmt_status === 'methylated').length;
  const mgmtUnmet = molStats ? molStats.mgmt_unmethylated : patients.filter(p => p.mgmt_status === 'unmethylated').length;
  const idhMut    = molStats ? molStats.idh_mutant        : patients.filter(p => p.idh1_status === 'mutant').length;
  const idhWt     = molStats ? molStats.idh_wildtype      : patients.filter(p => p.idh1_status === 'wildtype').length;
  const gtrCount  = molStats ? molStats.gtr               : patients.filter(p => p.surgery_type === 'GTR').length;
  const strCount  = molStats ? molStats.str               : patients.filter(p => p.surgery_type === 'STR').length;

  // Tarih
  const dateStr = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ── Yardımcı bileşenler ────────────────────────────────────────────────
  const MiniBar = ({ value, max, color }) => {
    const pct = max > 0 ? Math.round(value / max * 100) : 0;
    return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
      React.createElement('div', { style: { flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' } },
        React.createElement('div', { style: { width: pct + '%', height: '100%', background: color, borderRadius: 3, transition: 'width .5s' } })
      ),
      React.createElement('span', { style: { fontSize: 11, fontWeight: 700, minWidth: 28, color: 'var(--text-muted)' } }, value)
    );
  };

  const ranoBadge = (rano) => {
    const cfg = { CR: ['var(--green)', 'CR'], PR: ['var(--blue)', 'PR'], SD: ['var(--yellow)', 'SD'], PD: ['var(--red)', 'PD'] };
    const [c, label] = cfg[rano] || ['var(--text-muted)', rano || '-'];
    return React.createElement('span', { style: { fontSize: 10.5, fontWeight: 700, color: c, background: c + '22', borderRadius: 3, padding: '1px 5px' } }, label);
  };

  const mriDaysBadge = (days) => {
    const color = days < 0 ? 'var(--red)' : days <= 7 ? 'var(--orange, #f97316)' : 'var(--blue)';
    const label = days < 0 ? 'GECİKTİ ' + Math.abs(days) + 'g' : days === 0 ? 'BUGÜN' : days + ' gün';
    return React.createElement('span', {
      style: { fontSize: 10.5, fontWeight: 700, color, background: color + '22', borderRadius: 3, padding: '2px 6px', whiteSpace: 'nowrap' }
    }, label);
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return React.createElement('div', { className: 'page-fade' },

    // Kompakt başlık şeridi
    React.createElement('div', {
      style: { background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }
    },
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 } }, dateStr),
        React.createElement('div', { style: { fontSize: 12, color: 'var(--text-muted)' } },
          React.createElement('strong', { style: { color: 'var(--text)' } }, totalPatients), ' hasta  ·  ',
          React.createElement('strong', { style: { color: 'var(--text)' } }, analyzedCount), ' analiz  ·  ',
          React.createElement('strong', { style: { color: highRiskCount > 0 ? 'var(--red)' : 'var(--text)' } }, highRiskCount), ' yüksek risk',
          progAlerts.length > 0 && React.createElement('span', null,
            '  ·  ',
            React.createElement('span', { style: { color: 'var(--red)', fontWeight: 700 } }, progAlerts.length + ' progresyon uyarısı')
          )
        )
      ),
      React.createElement('div', { style: { display: 'flex', gap: 8, flexShrink: 0 } },
        React.createElement('button', { className: 'btn primary', onClick: () => onNavigate('analysis') }, '+ Yeni Analiz'),
        React.createElement('button', { className: 'btn', onClick: () => onNavigate('records') }, 'Hasta Kayıtları'),
        React.createElement('button', { className: 'btn', onClick: () => onNavigate('compare') }, '⇆ Karşılaştır')
      )
    ),

    React.createElement('div', { className: 'container' },

      // Son 30 Gün Özeti
      thisMonth && React.createElement('div', { style: { display: 'flex', gap: 12, marginBottom: 20 } },
        [
          ['Yeni Hasta', thisMonth.new_patients, 'son 30 gün', 'var(--primary)'],
          ['Tamamlanan Analiz', thisMonth.completed_analyses, 'son 30 gün', 'var(--green)'],
          ['Yüksek Risk Uyarısı', thisMonth.high_risk_alerts, 'aktif hasta', 'var(--red)'],
        ].map(([label, val, sub, color]) =>
          React.createElement('div', {
            key: label,
            style: { flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }
          },
            React.createElement('div', {
              style: { width: 40, height: 40, borderRadius: 8, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, color, fontFamily: 'var(--mono)', flexShrink: 0 }
            }, val),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 } }, label),
              React.createElement('div', { style: { fontSize: 11, color: 'var(--text-faint)' } }, sub)
            )
          )
        )
      ),

      // KPI satırı
      React.createElement('div', { className: 'kpi-row' },
        React.createElement('div', { className: 'kpi-card accent' },
          React.createElement('div', { className: 'kpi-label' }, 'Toplam Hasta'),
          React.createElement('div', { className: 'kpi-value' }, totalPatients),
          React.createElement('div', { className: 'kpi-sub' }, analyzedCount + ' analiz tamamlandı')
        ),
        React.createElement('div', { className: 'kpi-card' },
          React.createElement('div', { className: 'kpi-label' }, 'Yüksek Risk'),
          React.createElement('div', { className: 'kpi-value', style: { color: highRiskCount > 0 ? 'var(--red)' : 'var(--text)' } }, highRiskCount),
          React.createElement('div', { className: 'kpi-sub' },
            analyzedCount > 0 ? '%' + Math.round(highRiskCount / analyzedCount * 100) + ' analiz edilen' : '-')
        ),
        React.createElement('div', { className: 'kpi-card' },
          React.createElement('div', { className: 'kpi-label' }, 'Ort. Risk Skoru'),
          React.createElement('div', { className: 'kpi-value' }, apiAvgRisk, React.createElement('span', { className: 'kpi-unit' }, '/100')),
          React.createElement('div', { className: 'kpi-sub' }, 'Kohort ortalaması')
        ),
        React.createElement('div', { className: 'kpi-card' },
          React.createElement('div', { className: 'kpi-label' }, 'Ort. 6-Ay Sağkalım'),
          React.createElement('div', { className: 'kpi-value' }, apiAvgSurv !== '-' ? '%' + apiAvgSurv : '-'),
          React.createElement('div', { className: 'kpi-sub' }, 'Model tahmini')
        )
      ),

      // Ana 2:1 grid
      React.createElement('div', { className: 'grid-2-1', style: { alignItems: 'start' } },

        // SOL SÜTUN ────────────────────────────────────────────────────────
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } },

          // Son analizler tablosu
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title' }, 'SON ANALİZLER'),
              React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => onNavigate('records') }, 'Tümünü gör →')
            ),
            recentPts.length === 0
              ? React.createElement('div', { style: { padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 } },
                  loading ? 'Yükleniyor...' : 'Henüz analiz edilmiş hasta yok.')
              : React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: 13 } },
                  React.createElement('thead', null,
                    React.createElement('tr', { style: { borderBottom: '1px solid var(--border)' } },
                      ['Hasta', 'Yaş/C', 'Lokasyon', 'MGMT', 'Risk', '6-Ay Sağk.', ''].map(h =>
                        React.createElement('th', { key: h, style: { padding: '8px 12px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' } }, h)
                      )
                    )
                  ),
                  React.createElement('tbody', null,
                    recentPts.map(p =>
                      React.createElement('tr', {
                        key: p.patient_id,
                        style: { borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background .15s' },
                        onClick: () => onViewReport(p.patient_id),
                        onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-tint)',
                        onMouseLeave: e => e.currentTarget.style.background = ''
                      },
                        React.createElement('td', { style: { padding: '10px 12px', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--primary)' } }, p.patient_id),
                        React.createElement('td', { style: { padding: '10px 12px' } }, (p.age || '-') + ' / ' + (p.gender || '-')),
                        React.createElement('td', { style: { padding: '10px 12px', fontSize: 12, color: 'var(--text-muted)' } },
                          { frontal: 'Frontal', temporal: 'Temporal', parietal: 'Parietal', occipital: 'Oksipital', insular: 'İnsula', multifocal: 'Multifokal' }[p.tumor_location] || p.tumor_location || '-'
                        ),
                        React.createElement('td', { style: { padding: '10px 12px' } },
                          p.mgmt_status === 'methylated'   ? React.createElement('span', { style: { color: 'var(--green)', fontWeight: 700 } }, 'Met+') :
                          p.mgmt_status === 'unmethylated' ? React.createElement('span', { style: { color: 'var(--red)', fontWeight: 700 } }, 'Met−') :
                          React.createElement('span', { style: { color: 'var(--text-faint)' } }, '?')
                        ),
                        React.createElement('td', { style: { padding: '10px 12px' } },
                          p.risk_class
                            ? React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                                React.createElement('div', { style: { width: 28, height: 4, borderRadius: 2, background: 'var(--border)' } },
                                  React.createElement('div', { style: { width: Math.round(p.risk_score) + '%', height: '100%', borderRadius: 2, background: p.risk_class === 'high' ? 'var(--red)' : p.risk_class === 'medium' ? 'var(--yellow)' : 'var(--green)' } })
                                ),
                                React.createElement('span', { style: { fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 12 } }, Math.round(p.risk_score))
                              )
                            : '-'
                        ),
                        React.createElement('td', { style: { padding: '10px 12px', fontWeight: 700, fontFamily: 'var(--mono)' } },
                          p.survival_6m_pct != null ? '%' + Math.round(p.survival_6m_pct) : '-'
                        ),
                        React.createElement('td', { style: { padding: '10px 12px' } },
                          React.createElement('button', {
                            className: 'btn btn-sm btn-outline',
                            onClick: e => { e.stopPropagation(); onViewReport(p.patient_id); }
                          }, 'Rapor')
                        )
                      )
                    )
                  )
                )
          ),

          // Risk Dağılımı + RANO Tedavi Yanıtı
          React.createElement('div', { className: 'grid-2col' },

            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'RİSK DAĞILIMI')
              ),
              React.createElement('div', { className: 'card-body' },
                analyzedCount > 0
                  ? React.createElement('div', null,
                      React.createElement(DonutChart, {
                        data: { 'Düşük': riskDist.low || 0, 'Orta': riskDist.medium || 0, 'Yüksek': riskDist.high || 0 },
                        colors: { 'Düşük': 'var(--green)', 'Orta': 'var(--yellow)', 'Yüksek': 'var(--red)' },
                        size: 130, thickness: 22,
                        centerLabel: 'Analiz', centerValue: analyzedCount
                      }),
                      React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, fontSize: 12 } },
                        [['Düşük', 'var(--green)', riskDist.low || 0], ['Orta', 'var(--yellow)', riskDist.medium || 0], ['Yüksek', 'var(--red)', riskDist.high || 0]].map(([label, color, count]) =>
                          React.createElement('div', { key: label, style: { textAlign: 'center' } },
                            React.createElement('div', { style: { fontWeight: 700, color } }, count),
                            React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, label)
                          )
                        )
                      )
                    )
                  : React.createElement('div', { style: { textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 } }, 'Veri yok')
              )
            ),

            React.createElement('div', { className: 'card' },
              React.createElement('div', { className: 'section-head' },
                React.createElement('div', { className: 'section-title' }, 'TEDAVİ YANITI (RANO)')
              ),
              React.createElement('div', { className: 'card-body' },
                (ranoDist.CR || 0) + (ranoDist.PR || 0) + (ranoDist.SD || 0) + (ranoDist.PD || 0) > 0
                  ? React.createElement('div', null,
                      React.createElement(DonutChart, {
                        data: { 'CR': ranoDist.CR || 0, 'PR': ranoDist.PR || 0, 'SD': ranoDist.SD || 0, 'PD': ranoDist.PD || 0 },
                        colors: { 'CR': 'var(--green)', 'PR': 'var(--blue)', 'SD': 'var(--yellow)', 'PD': 'var(--red)' },
                        size: 130, thickness: 22,
                        centerLabel: 'RANO', centerValue: (ranoDist.CR || 0) + (ranoDist.PR || 0) + (ranoDist.SD || 0) + (ranoDist.PD || 0)
                      }),
                      React.createElement('div', { style: { display: 'flex', justifyContent: 'center', gap: 14, marginTop: 12, fontSize: 12 } },
                        [['CR', 'var(--green)'], ['PR', 'var(--blue)'], ['SD', 'var(--yellow)'], ['PD', 'var(--red)']].map(function(item) {
                          return React.createElement('div', { key: item[0], style: { textAlign: 'center' } },
                            React.createElement('div', { style: { fontWeight: 700, color: item[1] } }, ranoDist[item[0]] || 0),
                            React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: 11 } }, item[0])
                          );
                        })
                      )
                    )
                  : React.createElement('div', { style: { textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, padding: 20 } },
                      loading ? 'Yükleniyor...' : 'RANO verisi yok')
              )
            )
          )
        ),

        // SAĞ SÜTUN ────────────────────────────────────────────────────────
        React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } },

          // Yaklaşan Kontrol MR'ları
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title', style: { borderLeftColor: 'var(--blue)' } }, "YAKLAŞAN KONTROL MR'LARI"),
              upcomingMri.length > 0 && React.createElement('span', { className: 'section-badge', style: { background: '#dbeafe', color: 'var(--blue)' } }, upcomingMri.length + ' hasta')
            ),
            upcomingMri.length === 0
              ? React.createElement('div', { style: { padding: '20px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' } },
                  loading ? 'Yükleniyor...' : "Bu donem bekleyen kontrol MR yok")
              : upcomingMri.slice(0, 7).map(p =>
                  React.createElement('div', {
                    key: p.patient_id,
                    style: { padding: '10px 16px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 },
                    onClick: () => onViewReport(p.patient_id),
                    onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-tint)',
                    onMouseLeave: e => e.currentTarget.style.background = ''
                  },
                    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 } },
                        React.createElement('span', { style: { fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--primary)' } }, p.patient_id),
                        React.createElement('span', { style: { fontSize: 11, color: 'var(--text-muted)' } }, (p.age || '') + 'y ' + (p.gender || ''))
                      ),
                      React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 } },
                        new Date(p.next_mri_date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }),
                        p.last_rano && React.createElement('span', null, '·', ranoBadge(p.last_rano))
                      )
                    ),
                    mriDaysBadge(p.days_left)
                  )
                )
          ),

          // Progresyon Uyarıları
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title', style: { borderLeftColor: 'var(--red)' } }, 'PROGRESYON UYARILARI'),
              progAlerts.length > 0 && React.createElement('span', { className: 'section-badge', style: { background: 'var(--red-pale)', color: 'var(--red)' } }, progAlerts.length + ' hasta')
            ),
            progAlerts.length === 0
              ? React.createElement('div', { style: { padding: '20px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' } },
                  loading ? 'Yükleniyor...' : 'Aktif progresyon yok')
              : progAlerts.slice(0, 5).map(p =>
                  React.createElement('div', {
                    key: p.patient_id,
                    style: { padding: '10px 16px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 },
                    onClick: () => onViewReport(p.patient_id),
                    onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-tint)',
                    onMouseLeave: e => e.currentTarget.style.background = ''
                  },
                    React.createElement('div', { style: { width: 7, height: 7, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 } }),
                    React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                      React.createElement('div', { style: { fontSize: 12.5, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--primary)' } }, p.patient_id),
                      React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 1 } },
                        (p.age || '-') + 'y  ·  Risk: ' + (p.risk_score ? Math.round(p.risk_score) : '-') + '/100' +
                        (p.volume_change != null ? '  ·  Δ' + (p.volume_change > 0 ? '+' : '') + Math.round(p.volume_change) + '%' : '')
                      )
                    ),
                    React.createElement('button', {
                      style: { fontSize: 10, padding: '3px 8px', background: 'var(--red-pale)', color: 'var(--red)', border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 },
                      onClick: e => { e.stopPropagation(); onViewReport(p.patient_id); }
                    }, 'Rapor')
                  )
                )
          ),

          // Moleküler Profil
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title' }, 'MOLEKÜLER PROFİL')
            ),
            React.createElement('div', { className: 'card-body', style: { paddingTop: 8 } },
              React.createElement('div', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)', marginBottom: 8 } }, 'MGMT Durumu'),
              React.createElement('div', { style: { marginBottom: 6 } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 } },
                  React.createElement('span', null, 'Metile (iyi prognoz)'),
                  React.createElement('span', { style: { color: 'var(--text-muted)' } }, mgmtMet + ' hasta')
                ),
                React.createElement(MiniBar, { value: mgmtMet, max: totalPatients, color: 'var(--green)' })
              ),
              React.createElement('div', { style: { marginBottom: 14 } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 } },
                  React.createElement('span', null, 'Metile Değil'),
                  React.createElement('span', { style: { color: 'var(--text-muted)' } }, mgmtUnmet + ' hasta')
                ),
                React.createElement(MiniBar, { value: mgmtUnmet, max: totalPatients, color: 'var(--red)' })
              ),
              React.createElement('div', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)', marginBottom: 8 } }, 'IDH1 Durumu'),
              React.createElement('div', { style: { marginBottom: 6 } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 } },
                  React.createElement('span', null, 'Wildtype (primer GBM)'),
                  React.createElement('span', { style: { color: 'var(--text-muted)' } }, idhWt + ' hasta')
                ),
                React.createElement(MiniBar, { value: idhWt, max: totalPatients, color: 'var(--orange, #f97316)' })
              ),
              React.createElement('div', { style: { marginBottom: 14 } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 } },
                  React.createElement('span', null, 'Mutant (sekonder)'),
                  React.createElement('span', { style: { color: 'var(--text-muted)' } }, idhMut + ' hasta')
                ),
                React.createElement(MiniBar, { value: idhMut, max: totalPatients, color: 'var(--blue)' })
              ),
              React.createElement('div', { style: { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)', marginBottom: 8 } }, 'Cerrahi Rezeksiyon'),
              React.createElement('div', { style: { marginBottom: 6 } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 } },
                  React.createElement('span', null, 'Total (GTR)'),
                  React.createElement('span', { style: { color: 'var(--text-muted)' } }, gtrCount + ' hasta')
                ),
                React.createElement(MiniBar, { value: gtrCount, max: totalPatients, color: 'var(--primary)' })
              ),
              React.createElement('div', null,
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 12 } },
                  React.createElement('span', null, 'Parsiyel (STR)'),
                  React.createElement('span', { style: { color: 'var(--text-muted)' } }, strCount + ' hasta')
                ),
                React.createElement(MiniBar, { value: strCount, max: totalPatients, color: 'var(--purple, #a855f7)' })
              )
            )
          )
        )
      )
    )
  );
}

window.DashboardPage = DashboardPage;
