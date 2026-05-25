/* visualizations.jsx — SVG-based charts */

/* ── Sparkline ────────────────────────────────────────── */
function Sparkline({ data, color = 'var(--accent)', width = 80, height = 28, fill = true }) {
  if (!data || !data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const fillD = pathD + ` L${width},${height} L0,${height} Z`;
  return React.createElement('svg', { width, height, viewBox: `0 0 ${width} ${height}`, style: { overflow: 'visible' } },
    fill && React.createElement('path', { d: fillD, fill: color, opacity: 0.12 }),
    React.createElement('path', { d: pathD, stroke: color, fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    React.createElement('circle', { cx: points[points.length - 1][0], cy: points[points.length - 1][1], r: 2.5, fill: color })
  );
}

/* ── Donut Chart ──────────────────────────────────────── */
function DonutChart({ data, colors, size = 160, thickness = 28, centerLabel, centerValue }) {
  const entries = Object.entries(data || {}).filter(([, v]) => v > 0);
  if (!entries.length) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  const cx = size / 2, cy = size / 2;
  const r = (size - thickness) / 2;
  let startAngle = -Math.PI / 2;
  const arcs = entries.map(([key, val]) => {
    const angle = (val / total) * 2 * Math.PI;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const large = angle > Math.PI ? 1 : 0;
    const d = `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    const arc = { d, color: colors[key] || 'var(--accent)', key, val, pct: Math.round(val / total * 100) };
    startAngle = endAngle;
    return arc;
  });
  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' } },
    React.createElement('div', { style: { position: 'relative', flexShrink: 0 } },
      React.createElement('svg', { width: size, height: size },
        React.createElement('circle', { cx, cy, r, fill: 'none', stroke: 'var(--border-light)', strokeWidth: thickness }),
        arcs.map(a =>
          React.createElement('path', { key: a.key, d: a.d, stroke: a.color, strokeWidth: thickness, fill: 'none', strokeLinecap: 'butt' })
        )
      ),
      centerValue && React.createElement('div', { style: { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
        React.createElement('div', { style: { fontSize: 28, fontWeight: 800, letterSpacing: -1, color: 'var(--text)', lineHeight: 1 } }, centerValue),
        centerLabel && React.createElement('div', { style: { fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 } }, centerLabel)
      )
    ),
    React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 140 } },
      arcs.map(a =>
        React.createElement('div', { key: a.key, style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 } },
          React.createElement('div', { style: { width: 11, height: 11, background: a.color, borderRadius: 3, flexShrink: 0 } }),
          React.createElement('span', { style: { color: 'var(--text-secondary)', flex: 1 } }, a.key),
          React.createElement('span', { style: { fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' } }, a.val),
          React.createElement('span', { style: { color: 'var(--text-muted)', fontSize: 11, fontFamily: 'var(--mono)' } }, '%' + a.pct)
        )
      )
    )
  );
}

/* ── Kaplan-Meier Survival Curve ────────────────────────
   Gerçek Kaplan-Meier hesabı: product-limit, sansür çentikleri,
   medyan referans çizgileri, risk altındaki hasta sayısı tablosu. */
function _kmCompute(curve, maxTime) {
  // curve: ya { points } (eski format) ya { n0, events, censored }
  if (curve.points && !curve.events) {
    return { steps: curve.points.map(p => ({ t: p.time, s: p.survival, n: null })),
             censorTicks: [], median: null, n0: null };
  }
  const events = (curve.events || []).filter(t => t <= maxTime).slice();
  const censored = (curve.censored || []).filter(t => t <= maxTime).slice();
  // Olay zamanlarını topla, her zamanda kaç ölüm var
  const evMap = new Map();
  events.forEach(t => evMap.set(t, (evMap.get(t) || 0) + 1));
  const evTimes = [...evMap.keys()].sort((a, b) => a - b);

  let n = curve.n0;
  let s = 1.0;
  const steps = [{ t: 0, s: 1, n }];
  const allTimes = [...new Set([...events, ...censored])].sort((a, b) => a - b);
  for (const t of allTimes) {
    // Bu zamandan önce sansürlenenler n'i azaltır
    const d = evMap.get(t) || 0;
    if (d > 0 && n > 0) {
      s = s * (1 - d / n);
      steps.push({ t, s, n });
    }
    // Sansür sayısı bu zamanda
    const c = censored.filter(x => x === t).length;
    n -= d + c;
  }
  // Medyan sağkalım: S(t) ilk kez 0.5'in altına düştüğü zaman
  let median = null;
  for (const st of steps) {
    if (st.s <= 0.5) { median = st.t; break; }
  }
  return { steps, censorTicks: censored, median, n0: curve.n0 };
}

function KaplanMeier({ width = 720, height = 320, curves, maxTime = 24 }) {
  const pad = { l: 56, r: 16, t: 18, b: 78 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const computed = React.useMemo(
    () => curves.map(c => ({ ...c, _km: _kmCompute(c, maxTime) })),
    [curves, maxTime]
  );

  const xPos = t => pad.l + (Math.min(t, maxTime) / maxTime) * innerW;
  const yPos = s => pad.t + (1 - s) * innerH;
  const tickTimes = [];
  for (let t = 0; t <= maxTime; t += 3) tickTimes.push(t);

  // Hover state
  const [hoverT, setHoverT] = React.useState(null);
  const svgRef = React.useRef(null);
  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const px = (e.clientX - rect.left) * scaleX;
    if (px < pad.l || px > pad.l + innerW) { setHoverT(null); return; }
    setHoverT(((px - pad.l) / innerW) * maxTime);
  };
  const onLeave = () => setHoverT(null);

  // At-risk numbers per tick (n at risk = patients with time >= tick)
  const nAtRisk = computed.map(c => tickTimes.map(t => {
    if (c._km.n0 == null) return null;
    const dead = (c.events || []).filter(x => x < t).length;
    const cens = (c.censored || []).filter(x => x < t).length;
    return Math.max(0, c.n0 - dead - cens);
  }));

  return React.createElement('div', { style: { width: '100%' } },
    React.createElement('svg', {
      ref: svgRef,
      viewBox: `0 0 ${width} ${height}`,
      width: '100%',
      style: { fontFamily: 'var(--font)', display: 'block' },
      onMouseMove: onMove, onMouseLeave: onLeave
    },
      // Plot background
      React.createElement('rect', { x: pad.l, y: pad.t, width: innerW, height: innerH, fill: 'var(--surface, #fff)', opacity: 0.0 }),
      // Y-axis grid + labels (10% grid)
      [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1].map(y => {
        const yp = yPos(y);
        const major = (y * 10) % 2 === 0;
        return React.createElement('g', { key: y },
          React.createElement('line', {
            x1: pad.l, y1: yp, x2: pad.l + innerW, y2: yp,
            stroke: major ? 'var(--border-light)' : 'var(--border-light)',
            strokeWidth: 1,
            strokeDasharray: y === 0 || y === 1 ? '' : (major ? '4,4' : '2,4'),
            opacity: major ? 0.9 : 0.45
          }),
          major && React.createElement('text', {
            x: pad.l - 8, y: yp + 4, textAnchor: 'end',
            fontSize: 10.5, fill: 'var(--text-muted)', fontFamily: 'var(--mono)'
          }, Math.round(y * 100))
        );
      }),
      // % symbol on Y axis
      React.createElement('text', {
        x: pad.l - 8, y: pad.t - 4, textAnchor: 'end',
        fontSize: 9.5, fill: 'var(--text-faint)', fontWeight: 600
      }, '%'),
      // X-axis ticks + labels
      tickTimes.map(t => {
        const x = xPos(t);
        return React.createElement('g', { key: t },
          React.createElement('line', { x1: x, y1: pad.t + innerH, x2: x, y2: pad.t + innerH + 4, stroke: 'var(--border-strong)' }),
          React.createElement('text', { x, y: pad.t + innerH + 16, textAnchor: 'middle', fontSize: 10.5, fill: 'var(--text-muted)', fontFamily: 'var(--mono)' }, t)
        );
      }),
      // Axis lines
      React.createElement('line', { x1: pad.l, y1: pad.t + innerH, x2: pad.l + innerW, y2: pad.t + innerH, stroke: 'var(--border-strong)', strokeWidth: 1 }),
      React.createElement('line', { x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + innerH, stroke: 'var(--border-strong)', strokeWidth: 1 }),
      // X-axis title
      React.createElement('text', {
        x: pad.l + innerW / 2, y: pad.t + innerH + 30,
        textAnchor: 'middle', fontSize: 10.5, fill: 'var(--text-secondary)',
        fontWeight: 600, letterSpacing: 0.5
      }, 'AY'),
      // Y label
      React.createElement('text', {
        x: 14, y: pad.t + innerH / 2,
        transform: `rotate(-90, 14, ${pad.t + innerH / 2})`,
        textAnchor: 'middle', fontSize: 10.5, fill: 'var(--text-secondary)',
        fontWeight: 600, letterSpacing: 0.5
      }, 'KÜMÜLATİF SAĞKALIM'),
      // 50% reference line for median
      React.createElement('line', {
        x1: pad.l, y1: yPos(0.5), x2: pad.l + innerW, y2: yPos(0.5),
        stroke: 'var(--text-faint)', strokeWidth: 1, strokeDasharray: '4,3', opacity: 0.55
      }),
      // Median drop-down lines + labels
      computed.map((c, ci) => {
        if (c._km.median == null || c._km.median > maxTime) return null;
        const mx = xPos(c._km.median);
        return React.createElement('g', { key: 'med' + ci },
          React.createElement('line', {
            x1: mx, y1: yPos(0.5), x2: mx, y2: pad.t + innerH,
            stroke: c.color, strokeWidth: 1, strokeDasharray: '3,3', opacity: 0.6
          })
        );
      }),
      // Curves: step paths + censor ticks
      computed.map((c, ci) => {
        const steps = c._km.steps;
        let d = '';
        steps.forEach((st, i) => {
          const x = xPos(st.t), y = yPos(st.s);
          if (i === 0) {
            d += `M ${x.toFixed(2)} ${y.toFixed(2)}`;
          } else {
            const py = yPos(steps[i - 1].s);
            d += ` L ${x.toFixed(2)} ${py.toFixed(2)} L ${x.toFixed(2)} ${y.toFixed(2)}`;
          }
        });
        // Sağa doğru son segment uzat
        const last = steps[steps.length - 1];
        if (last.t < maxTime) {
          d += ` L ${xPos(maxTime).toFixed(2)} ${yPos(last.s).toFixed(2)}`;
        }
        // Censoring ticks
        const ticks = c._km.censorTicks.map((t, ti) => {
          if (t > maxTime) return null;
          // Sansür anında S(t) değerini bul
          let sAtT = 1;
          for (const st of steps) { if (st.t <= t) sAtT = st.s; else break; }
          const x = xPos(t), y = yPos(sAtT);
          return React.createElement('line', {
            key: ti, x1: x, y1: y - 5, x2: x, y2: y + 5,
            stroke: c.color, strokeWidth: 1.4, opacity: 0.85
          });
        });
        return React.createElement('g', { key: ci },
          React.createElement('path', {
            d, stroke: c.color, fill: 'none',
            strokeWidth: 2.2, strokeLinejoin: 'miter', strokeLinecap: 'butt'
          }),
          ticks
        );
      }),
      // Hover crosshair + values
      hoverT != null && React.createElement('g', null,
        React.createElement('line', {
          x1: xPos(hoverT), y1: pad.t, x2: xPos(hoverT), y2: pad.t + innerH,
          stroke: 'var(--text-faint)', strokeWidth: 1, strokeDasharray: '2,3', opacity: 0.6
        }),
        computed.map((c, ci) => {
          let s = 1;
          for (const st of c._km.steps) { if (st.t <= hoverT) s = st.s; else break; }
          return React.createElement('circle', {
            key: ci, cx: xPos(hoverT), cy: yPos(s), r: 3.2,
            fill: c.color, stroke: 'white', strokeWidth: 1.5
          });
        }),
        React.createElement('g', { transform: `translate(${Math.min(xPos(hoverT) + 8, pad.l + innerW - 130)}, ${pad.t + 4})` },
          React.createElement('rect', { x: 0, y: 0, width: 124, height: 14 + computed.length * 13, rx: 4,
            fill: 'rgba(15,23,42,0.92)', stroke: 'rgba(255,255,255,0.1)' }),
          React.createElement('text', { x: 8, y: 11, fontSize: 10, fill: 'rgba(255,255,255,0.7)', fontFamily: 'var(--mono)' },
            'Ay: ' + hoverT.toFixed(1)),
          computed.map((c, ci) => {
            let s = 1;
            for (const st of c._km.steps) { if (st.t <= hoverT) s = st.s; else break; }
            return React.createElement('g', { key: ci, transform: `translate(0, ${14 + ci * 13})` },
              React.createElement('rect', { x: 8, y: 1, width: 8, height: 8, fill: c.color, rx: 1 }),
              React.createElement('text', { x: 20, y: 9, fontSize: 10, fill: 'white' }, c.label),
              React.createElement('text', { x: 118, y: 9, textAnchor: 'end', fontSize: 10, fill: 'white', fontFamily: 'var(--mono)', fontWeight: 700 },
                '%' + (s * 100).toFixed(1))
            );
          })
        )
      )
    ),
    // Risk-altında tablosu + lejant
    React.createElement('div', { style: {
      marginTop: 8, fontSize: 10.5, color: 'var(--text-secondary)',
      fontFamily: 'var(--mono)'
    }},
      React.createElement('div', { style: {
        display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap',
        paddingLeft: pad.l - 4, marginBottom: 6
      }},
        computed.map((c, ci) => {
          const m = c._km.median;
          return React.createElement('div', { key: ci, style: { display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font)' } },
            React.createElement('span', { style: { width: 18, height: 3, background: c.color, borderRadius: 1 } }),
            React.createElement('span', { style: { fontWeight: 600, color: 'var(--text)', fontSize: 11.5 } }, c.label),
            c._km.n0 != null && React.createElement('span', { style: { color: 'var(--text-muted)', fontSize: 10.5, fontFamily: 'var(--mono)' } },
              '(n=' + c._km.n0 + ' · medyan ' + (m != null ? m.toFixed(1) + ' ay' : '>' + maxTime + ' ay') + ')')
          );
        })
      ),
      computed[0]._km.n0 != null && React.createElement('div', { style: {
        display: 'grid',
        gridTemplateColumns: `120px repeat(${tickTimes.length}, 1fr)`,
        rowGap: 2, columnGap: 0,
        paddingLeft: 4, paddingRight: pad.r,
        borderTop: '1px solid var(--border-light)', paddingTop: 4
      }},
        React.createElement('div', { style: { fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, letterSpacing: 0.4 } }, 'Risk altında'),
        tickTimes.map(t => React.createElement('div', { key: 't' + t, style: { textAlign: 'center', fontSize: 10, color: 'var(--text-faint)' } }, t)),
        ...computed.flatMap((c, ci) => [
          React.createElement('div', { key: 'lbl' + ci, style: { fontSize: 10.5, color: c.color, fontWeight: 600, fontFamily: 'var(--font)' } }, c.label),
          ...nAtRisk[ci].map((n, ti) => React.createElement('div', {
            key: 'n' + ci + '-' + ti,
            style: { textAlign: 'center', fontSize: 10, color: 'var(--text-secondary)' }
          }, n))
        ])
      )
    )
  );
}

/* ── Risk Waterfall ───────────────────────────────────── */
function RiskWaterfall({ factors }) {
  if (!factors || !factors.length) return null;
  const maxImpact = Math.max(...factors.map(f => Math.abs(f.impact)), 0.001);
  return React.createElement('div', null,
    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 8, paddingLeft: 192, paddingRight: 80 } },
      React.createElement('span', null, '← Koruyucu'),
      React.createElement('span', { style: { fontFamily: 'var(--mono)', color: 'var(--text-faint)' } }, '0'),
      React.createElement('span', null, 'Risk Artıran →')
    ),
    factors.map((f, i) => {
      const pct = (Math.abs(f.impact) / maxImpact) * 50;
      return React.createElement('div', { key: i, className: 'waterfall-row' },
        React.createElement('span', { className: 'waterfall-label' }, f.factor),
        React.createElement('div', { className: 'waterfall-bar-track' },
          React.createElement('div', { className: 'waterfall-axis' }),
          React.createElement('div', {
            className: 'waterfall-bar ' + (f.direction === 'high' ? 'up' : 'down'),
            style: { width: pct + '%' }
          })
        ),
        React.createElement('span', { className: 'waterfall-val', style: { color: f.direction === 'high' ? 'var(--red)' : 'var(--green)' } },
          (f.direction === 'high' ? '+' : '−') + (Math.abs(f.impact) * 100).toFixed(0))
      );
    })
  );
}

/* ── Radiomic Radar ───────────────────────────────────── */
function RadiomicRadar({ data, size = 220, label = 'Hasta', color = 'var(--accent)', compareData, compareLabel, compareColor = '#ec4899' }) {
  // data: { Sphericity: 0.72, Surface: 0.8, ... } normalized 0-1
  const keys = Object.keys(data);
  const N = keys.length;
  const cx = size / 2, cy = size / 2;
  const r = size / 2 - 30;

  const polarToXY = (angle, dist) => [cx + Math.cos(angle - Math.PI / 2) * dist, cy + Math.sin(angle - Math.PI / 2) * dist];

  const polygonPoints = (values) => keys.map((k, i) => polarToXY((i / N) * 2 * Math.PI, r * Math.max(0, Math.min(1, values[k] || 0)))).map(p => p.join(',')).join(' ');

  return React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' } },
    React.createElement('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}` },
      // Grid circles
      [0.25, 0.5, 0.75, 1].map(scale =>
        React.createElement('circle', { key: scale, cx, cy, r: r * scale, fill: 'none', stroke: 'var(--border-light)', strokeWidth: 1 })
      ),
      // Axes
      keys.map((k, i) => {
        const [x, y] = polarToXY((i / N) * 2 * Math.PI, r);
        return React.createElement('line', { key: i, x1: cx, y1: cy, x2: x, y2: y, stroke: 'var(--border-light)', strokeWidth: 1 });
      }),
      // Compare polygon
      compareData && React.createElement('polygon', { points: polygonPoints(compareData), fill: compareColor, fillOpacity: 0.15, stroke: compareColor, strokeWidth: 2 }),
      // Main polygon
      React.createElement('polygon', { points: polygonPoints(data), fill: color, fillOpacity: 0.25, stroke: color, strokeWidth: 2 }),
      // Labels
      keys.map((k, i) => {
        const [x, y] = polarToXY((i / N) * 2 * Math.PI, r + 15);
        return React.createElement('text', { key: k, x, y, textAnchor: 'middle', dominantBaseline: 'middle', fontSize: 10.5, fill: 'var(--text-secondary)', fontWeight: 600 }, k);
      })
    ),
    React.createElement('div', { style: { fontSize: 12 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 } },
        React.createElement('div', { style: { width: 12, height: 12, background: color, opacity: 0.7, borderRadius: 2 } }),
        React.createElement('span', { style: { fontWeight: 600 } }, label)
      ),
      compareData && React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement('div', { style: { width: 12, height: 12, background: compareColor, opacity: 0.7, borderRadius: 2 } }),
        React.createElement('span', { style: { fontWeight: 600 } }, compareLabel)
      )
    )
  );
}

/* ── Tumor Timeline (Line Chart with Events) ───────────── */
function TumorTimeline({ data, events, width = 700, height = 260 }) {
  // data = [{week: 0, volume: 34.8}, ...]
  // events = [{week: 4, label: "RT başladı", type: "treatment"}]
  const pad = { l: 50, r: 20, t: 16, b: 56 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const maxWeek = Math.max(...data.map(d => d.week));
  const maxVol = Math.max(...data.map(d => d.volume)) * 1.1;

  const xPos = w => pad.l + (w / maxWeek) * innerW;
  const yPos = v => pad.t + (1 - v / maxVol) * innerH;

  // Smooth path
  let pathD = '';
  data.forEach((d, i) => {
    const x = xPos(d.week), y = yPos(d.volume);
    if (i === 0) pathD += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    else pathD += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const fillD = pathD + ` L ${xPos(data[data.length - 1].week)} ${pad.t + innerH} L ${xPos(0)} ${pad.t + innerH} Z`;

  const eventColors = { treatment: 'var(--blue)', surgery: 'var(--red)', mri: 'var(--accent)', progression: 'var(--yellow)' };

  return React.createElement('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', style: { fontFamily: 'var(--font)' } },
    // Grid
    [0, 0.25, 0.5, 0.75, 1].map(g => {
      const y = pad.t + g * innerH;
      const val = (maxVol * (1 - g)).toFixed(0);
      return React.createElement('g', { key: g },
        React.createElement('line', { x1: pad.l, y1: y, x2: pad.l + innerW, y2: y, stroke: 'var(--border-light)', strokeWidth: 1, strokeDasharray: g === 0 || g === 1 ? '' : '3,3' }),
        React.createElement('text', { x: pad.l - 8, y: y + 4, textAnchor: 'end', fontSize: 11, fill: 'var(--text-muted)' }, val)
      );
    }),
    // X-axis ticks
    [0, 4, 8, 12, 16, 20, 24].filter(w => w <= maxWeek).map(w => {
      const x = xPos(w);
      return React.createElement('g', { key: w },
        React.createElement('line', { x1: x, y1: pad.t + innerH, x2: x, y2: pad.t + innerH + 4, stroke: 'var(--border-strong)' }),
        React.createElement('text', { x, y: pad.t + innerH + 18, textAnchor: 'middle', fontSize: 11, fill: 'var(--text-muted)' }, 'h' + w)
      );
    }),
    // Y label
    React.createElement('text', { x: 12, y: height / 2, transform: `rotate(-90, 12, ${height / 2})`, textAnchor: 'middle', fontSize: 11, fill: 'var(--text-muted)', fontWeight: 600 }, 'HACİM (cm³)'),
    // Area fill
    React.createElement('path', { d: fillD, fill: 'var(--accent)', opacity: 0.12 }),
    // Line
    React.createElement('path', { d: pathD, stroke: 'var(--accent)', fill: 'none', strokeWidth: 2.5, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    // Points
    data.map((d, i) => React.createElement('circle', { key: i, cx: xPos(d.week), cy: yPos(d.volume), r: 4, fill: 'var(--surface)', stroke: 'var(--accent)', strokeWidth: 2 })),
    // Events
    (events || []).map((e, i) => {
      const x = xPos(e.week);
      const color = eventColors[e.type] || 'var(--accent)';
      return React.createElement('g', { key: i },
        React.createElement('line', { x1: x, y1: pad.t, x2: x, y2: pad.t + innerH, stroke: color, strokeWidth: 1.5, strokeDasharray: '3,3', opacity: 0.5 }),
        React.createElement('circle', { cx: x, cy: pad.t - 5, r: 6, fill: color, stroke: 'var(--surface)', strokeWidth: 2 }),
        React.createElement('text', { x, y: pad.t + innerH + 38, textAnchor: 'middle', fontSize: 10, fill: color, fontWeight: 700 }, e.label)
      );
    })
  );
}

/* ── Activity Heatmap ─────────────────────────────────── */
function ActivityHeatmap({ weeks = 12, data }) {
  // data is array of values per week
  const max = Math.max(...data, 1);
  return React.createElement('div', { style: { display: 'flex', gap: 3 } },
    data.map((v, i) => {
      const opacity = v / max;
      return React.createElement('div', { key: i,
        style: {
          flex: 1, aspectRatio: '1', borderRadius: 3,
          background: opacity > 0 ? `rgba(13, 148, 136, ${0.15 + opacity * 0.85})` : 'var(--border-light)'
        },
        title: `Hafta ${i + 1}: ${v} analiz`
      });
    })
  );
}

/* ── Calibration Reliability Diagram ──────────────────── */
function CalibrationPlot({ bins, brier, width = 480, height = 360 }) {
  const pad = { l: 56, r: 16, t: 18, b: 56 };
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const xPos = v => pad.l + v * innerW;
  const yPos = v => pad.t + (1 - v) * innerH;

  const points = (bins || []).filter(b => b.observed_rate != null && b.n > 0);
  const maxN = Math.max(...points.map(p => p.n), 1);

  return React.createElement('div', null,
    React.createElement('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%',
      style: { fontFamily: 'var(--font)', display: 'block' } },
      // Grid + axes
      [0, 0.25, 0.5, 0.75, 1].map(v =>
        React.createElement('g', { key: 'g' + v },
          React.createElement('line', { x1: pad.l, y1: yPos(v), x2: pad.l + innerW, y2: yPos(v),
            stroke: 'var(--border-light)', strokeWidth: 1, strokeDasharray: v === 0 || v === 1 ? '' : '3,4', opacity: 0.7 }),
          React.createElement('line', { x1: xPos(v), y1: pad.t, x2: xPos(v), y2: pad.t + innerH,
            stroke: 'var(--border-light)', strokeWidth: 1, strokeDasharray: v === 0 || v === 1 ? '' : '3,4', opacity: 0.7 }),
          React.createElement('text', { x: pad.l - 8, y: yPos(v) + 4, textAnchor: 'end',
            fontSize: 10.5, fill: 'var(--text-muted)', fontFamily: 'var(--mono)' }, Math.round(v * 100) + '%'),
          React.createElement('text', { x: xPos(v), y: pad.t + innerH + 16, textAnchor: 'middle',
            fontSize: 10.5, fill: 'var(--text-muted)', fontFamily: 'var(--mono)' }, Math.round(v * 100) + '%')
        )
      ),
      // Perfect calibration diagonal
      React.createElement('line', { x1: xPos(0), y1: yPos(0), x2: xPos(1), y2: yPos(1),
        stroke: 'var(--text-faint)', strokeWidth: 1.5, strokeDasharray: '5,4' }),
      // Data points: size by n
      points.map((b, i) =>
        React.createElement('g', { key: i },
          React.createElement('line', {
            x1: xPos(b.mean_predicted), y1: yPos(b.mean_predicted),
            x2: xPos(b.mean_predicted), y2: yPos(b.observed_rate),
            stroke: '#0d9488', strokeWidth: 1, opacity: 0.4
          }),
          React.createElement('circle', { cx: xPos(b.mean_predicted), cy: yPos(b.observed_rate),
            r: 4 + Math.sqrt(b.n) * 1.5, fill: '#0d9488', fillOpacity: 0.7,
            stroke: 'white', strokeWidth: 1.5 }),
          React.createElement('text', { x: xPos(b.mean_predicted), y: yPos(b.observed_rate) - 8,
            textAnchor: 'middle', fontSize: 9.5, fill: 'var(--text-muted)', fontFamily: 'var(--mono)' },
            'n=' + b.n)
        )
      ),
      // Axis labels
      React.createElement('text', {
        x: pad.l + innerW / 2, y: pad.t + innerH + 36, textAnchor: 'middle',
        fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 600, letterSpacing: 0.5
      }, 'TAHMİN EDİLEN SAĞKALIM'),
      React.createElement('text', {
        x: 14, y: pad.t + innerH / 2,
        transform: `rotate(-90, 14, ${pad.t + innerH / 2})`,
        textAnchor: 'middle', fontSize: 11, fill: 'var(--text-secondary)',
        fontWeight: 600, letterSpacing: 0.5
      }, 'GÖZLEMLENEN SAĞKALIM')
    ),
    brier != null && React.createElement('div', {
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center',
               marginTop: 10, padding: '8px 12px', background: 'var(--surface-tint)',
               borderRadius: 6, fontSize: 12.5 }
    },
      React.createElement('span', { style: { color: 'var(--text-muted)' } },
        'Brier skoru:', React.createElement('strong', {
          style: { fontFamily: 'var(--mono)', color: 'var(--text)', marginLeft: 6 }
        }, brier.toFixed(4))),
      React.createElement('span', { style: { fontSize: 11, color: 'var(--text-muted)' } },
        'Mükemmel: 0 · Rastgele: 0.25')
    )
  );
}

window.Sparkline = Sparkline;
window.DonutChart = DonutChart;
window.CalibrationPlot = CalibrationPlot;
window.KaplanMeier = KaplanMeier;
window.RiskWaterfall = RiskWaterfall;
window.RadiomicRadar = RadiomicRadar;
window.TumorTimeline = TumorTimeline;
window.ActivityHeatmap = ActivityHeatmap;
