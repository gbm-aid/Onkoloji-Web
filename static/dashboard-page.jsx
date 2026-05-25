/* dashboard-page.jsx — New main landing dashboard */

function DashboardPage({ onNavigate, onViewReport, patients }) {
  const d = MOCK.dashboard;
  const cs = MOCK.cohortStats;
  const recentPatients = patients.slice(0, 5);

  // Date greeting
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar';
  const dateStr = now.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const RISK_COLORS = { low: 'var(--green)', medium: 'var(--yellow)', high: 'var(--red)' };
  const RISK_LABELS = { low: 'Düşük', medium: 'Orta', high: 'Yüksek' };

  return React.createElement('div', { className: 'page-fade' },
    // Hero
    React.createElement('div', { className: 'dash-hero' },
      React.createElement('div', { style: { position: 'relative', zIndex: 1 } },
        React.createElement('div', { className: 'dash-hero-title' }, greeting + ', Dr.'),
        React.createElement('div', { className: 'dash-hero-sub' },
          dateStr + '  ·  ', React.createElement('strong', null, cs.total_patients), ' hasta · ',
          React.createElement('strong', null, d.thisMonth.highRiskAlerts), ' yüksek risk uyarısı'
        ),
        React.createElement('div', { className: 'dash-hero-actions' },
          React.createElement('button', { className: 'btn primary', onClick: () => onNavigate('analysis') }, '+ Yeni Analiz'),
          React.createElement('button', { className: 'btn', onClick: () => onNavigate('records') }, 'Hasta Kayıtları'),
          React.createElement('button', { className: 'btn', onClick: () => onNavigate('compare') }, '⇆ Karşılaştır'),
          React.createElement('button', { className: 'btn', onClick: () => onNavigate('database') }, 'Kohort')
        )
      )
    ),

    React.createElement('div', { className: 'container' },
      // KPI row with sparklines
      React.createElement('div', { className: 'kpi-row' },
        React.createElement('div', { className: 'kpi-card accent' },
          React.createElement('div', { className: 'kpi-label' }, 'Toplam Hasta'),
          React.createElement('div', { className: 'kpi-value' }, cs.total_patients),
          React.createElement('div', { className: 'kpi-sub' },
            React.createElement('span', { className: 'kpi-delta up' }, '↑ +' + d.thisMonth.newPatients),
            ' bu ay'
          ),
          React.createElement('div', { className: 'kpi-spark' },
            React.createElement(Sparkline, { data: d.weeklyActivity, color: 'var(--accent)', width: 70, height: 28 })
          )
        ),
        React.createElement('div', { className: 'kpi-card' },
          React.createElement('div', { className: 'kpi-label' }, 'Analiz Tamamlandı'),
          React.createElement('div', { className: 'kpi-value' }, cs.analyzed),
          React.createElement('div', { className: 'kpi-sub' },
            React.createElement('span', { className: 'kpi-delta up' }, '↑ ' + d.thisMonth.completedAnalyses),
            ' son 30 gün'
          )
        ),
        React.createElement('div', { className: 'kpi-card' },
          React.createElement('div', { className: 'kpi-label' }, 'Ortalama Risk'),
          React.createElement('div', { className: 'kpi-value' }, cs.avg_risk, React.createElement('span', { className: 'kpi-unit' }, '/100')),
          React.createElement('div', { className: 'kpi-sub' }, 'Kohort ortalaması'),
          React.createElement('div', { className: 'kpi-spark' },
            React.createElement(Sparkline, { data: d.riskSparkline, color: 'var(--yellow)', width: 70, height: 28 })
          )
        ),
        React.createElement('div', { className: 'kpi-card' },
          React.createElement('div', { className: 'kpi-label' }, '6-Ay Sağkalım'),
          React.createElement('div', { className: 'kpi-value' }, '%' + cs.avg_surv),
          React.createElement('div', { className: 'kpi-sub' }, 'Model tahmini'),
          React.createElement('div', { className: 'kpi-spark' },
            React.createElement(Sparkline, { data: d.survivalSparkline, color: 'var(--green)', width: 70, height: 28 })
          )
        )
      ),

      // 2-col: KM curve | Risk donut
      React.createElement('div', { className: 'grid-2-1' },
        // Kaplan-Meier
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'section-head' },
            React.createElement('div', { className: 'section-title' }, 'KAPLAN-MEIER SAĞKALIM EĞRİSİ'),
            React.createElement('span', { className: 'section-badge' }, 'Kohort · 24 ay')
          ),
          React.createElement('div', { className: 'card-body' },
            React.createElement(KaplanMeier, { curves: MOCK.kmCurves, height: 260 })
          )
        ),
        // Risk distribution donut
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'section-head' },
            React.createElement('div', { className: 'section-title' }, 'RİSK DAĞILIMI')
          ),
          React.createElement('div', { className: 'card-body' },
            React.createElement(DonutChart, {
              data: { 'Düşük': cs.risk_dist.low, 'Orta': cs.risk_dist.medium, 'Yüksek': cs.risk_dist.high },
              colors: { 'Düşük': 'var(--green)', 'Orta': 'var(--yellow)', 'Yüksek': 'var(--red)' },
              size: 150, thickness: 24,
              centerLabel: 'Toplam', centerValue: cs.analyzed
            })
          )
        )
      ),

      // Recent patients
      React.createElement('div', { className: 'grid-2col' },
        React.createElement('div', { className: 'card' },
          React.createElement('div', { className: 'section-head' },
            React.createElement('div', { className: 'section-title' }, 'SON ANALİZLER'),
            React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => onNavigate('records') }, 'Tümü →')
          ),
          React.createElement('div', { style: { padding: '4px 0' } },
            recentPatients.map(p =>
              React.createElement('div', { key: p.patient_id,
                style: { padding: '12px 20px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', transition: 'background 0.15s', display: 'flex', alignItems: 'center', gap: 14 },
                onClick: () => onViewReport(p.patient_id),
                onMouseEnter: e => e.currentTarget.style.background = 'var(--surface-tint)',
                onMouseLeave: e => e.currentTarget.style.background = ''
              },
                React.createElement('div', { style: { fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--primary)', minWidth: 100 } }, p.patient_id),
                React.createElement('div', { style: { flex: 1 } },
                  React.createElement('div', { style: { fontSize: 13, fontWeight: 500, color: 'var(--text)' } },
                    p.age + ' yaş · ' + (p.gender === 'M' ? 'E' : 'K') + ' · KPS ' + p.kps_score),
                  React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)', marginTop: 2 } }, p.date)
                ),
                React.createElement('div', { style: { textAlign: 'right' } },
                  React.createElement('div', { style: { fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--mono)' } },
                    Math.round(p.risk_score)),
                  React.createElement('span', { className: 'risk-badge ' + p.risk_class, style: { marginTop: 4 } }, p.risk_label)
                )
              )
            )
          )
        ),

        // Aktivite & alerts
        React.createElement('div', null,
          // Activity
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title' }, 'HAFTALIK AKTİVİTE'),
              React.createElement('span', { className: 'section-badge' }, 'Son 12 hafta')
            ),
            React.createElement('div', { className: 'card-body' },
              React.createElement(ActivityHeatmap, { data: d.weeklyActivity }),
              React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 8 } },
                React.createElement('span', null, 'Az'),
                React.createElement('span', null,
                  d.weeklyActivity.reduce((a, b) => a + b, 0) + ' toplam analiz'),
                React.createElement('span', null, 'Çok')
              )
            )
          ),
          // High-risk alerts
          React.createElement('div', { className: 'card' },
            React.createElement('div', { className: 'section-head' },
              React.createElement('div', { className: 'section-title', style: { borderLeftColor: 'var(--red)' } }, 'YÜKSEK RİSK UYARILARI'),
              React.createElement('span', { className: 'section-badge' }, d.thisMonth.highRiskAlerts + ' aktif')
            ),
            React.createElement('div', { style: { padding: '4px 0' } },
              patients.filter(p => p.risk_class === 'high').slice(0, 3).map(p =>
                React.createElement('div', { key: p.patient_id,
                  style: { padding: '10px 20px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' },
                  onClick: () => onViewReport(p.patient_id)
                },
                  React.createElement('div', { style: { width: 8, height: 8, borderRadius: '50%', background: 'var(--red)', flexShrink: 0 } }),
                  React.createElement('div', { style: { flex: 1 } },
                    React.createElement('div', { style: { fontSize: 12.5, fontWeight: 600 } }, p.patient_id),
                    React.createElement('div', { style: { fontSize: 11, color: 'var(--text-muted)' } },
                      'Risk: ' + Math.round(p.risk_score) + '/100 · ' + p.tumor_location + ' · ' + p.surgery_type)
                  ),
                  React.createElement('span', { className: 'risk-badge high' }, Math.round(p.survival_6m_pct) + '%')
                )
              )
            )
          )
        )
      )
    )
  );
}

window.DashboardPage = DashboardPage;
