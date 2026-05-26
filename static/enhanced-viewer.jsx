/* enhanced-viewer.jsx — Advanced MRI viewer with window/level, multi-axis */

// Brain rendering function (used by viewer and thumbnails)
function renderBrainSlice(ctx, W, H, opts) {
  const { axis, slice, maxSlice, modality, segOverlay, windowLevel, brightness, showCrosshair } = opts;
  ctx.fillStyle = '#080810';
  ctx.fillRect(0, 0, W, H);

  const cx = W / 2, cy = H / 2;
  const norm = slice / Math.max(maxSlice, 1);

  let brainRx, brainRy, skullRx, skullRy;
  if (axis === 'axial') {
    const depth = Math.sin(norm * Math.PI);
    brainRx = (W * 0.28) * depth + (W * 0.10);
    brainRy = (H * 0.33) * depth + (H * 0.08);
    skullRx = brainRx + 12; skullRy = brainRy + 12;
  } else if (axis === 'coronal') {
    const depth = Math.sin(norm * Math.PI);
    brainRx = (W * 0.30) * depth + (W * 0.08);
    brainRy = (H * 0.27) * depth + (H * 0.10);
    skullRx = brainRx + 14; skullRy = brainRy + 14;
  } else {
    const depth = Math.sin(norm * Math.PI);
    brainRx = (W * 0.23) * depth + (W * 0.08);
    brainRy = (H * 0.28) * depth + (H * 0.10);
    skullRx = brainRx + 12; skullRy = brainRy + 14;
  }

  // Modality-specific colors with window/level adjustment
  const wl = windowLevel || { window: 1.0, level: 0.5 };
  const baseColors = {
    'T1': [74, 74, 90],
    'T1ce': [80, 80, 96],
    'T2': [58, 74, 90],
    'FLAIR': [74, 74, 85],
  };
  const adjustColor = (rgb) => {
    return rgb.map(c => Math.max(0, Math.min(255, (c - 128) * wl.window + 128 * wl.level * 2 + (brightness || 0))));
  };
  const toRGB = ([r, g, b]) => `rgb(${r|0}, ${g|0}, ${b|0})`;
  const brain = adjustColor(baseColors[modality] || baseColors['T1ce']);
  const skull = brain.map(c => c * 0.55);
  const csf = brain.map(c => c * 0.4);

  // Skull
  ctx.beginPath();
  ctx.ellipse(cx, cy - 5, skullRx, skullRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = toRGB(skull);
  ctx.fill();

  // Brain parenchyma
  ctx.beginPath();
  ctx.ellipse(cx, cy - 5, brainRx, brainRy, 0, 0, Math.PI * 2);
  ctx.fillStyle = toRGB(brain);
  ctx.fill();

  // Midline fissure (axial)
  if (axis === 'axial' && brainRx > 40) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - brainRy + 8);
    ctx.lineTo(cx, cy + brainRy - 8);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Ventricles
  if (brainRx > 40) {
    const vSize = brainRx * 0.18;
    ctx.beginPath();
    ctx.ellipse(cx - brainRx * 0.15, cy - 5, vSize * 0.5, vSize, 0, 0, Math.PI * 2);
    ctx.fillStyle = toRGB(csf);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + brainRx * 0.15, cy - 5, vSize * 0.5, vSize, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sulci texture
  if (brainRx > 50) {
    const seed = Math.floor(norm * 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI / 5) + seed * 0.1;
      const r1 = brainRx * 0.55;
      const r2 = brainRx * 0.96;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * r1, cy - 5 + Math.sin(angle) * r1 * (brainRy / brainRx));
      ctx.quadraticCurveTo(
        cx + Math.cos(angle + 0.3) * (r1 + r2) / 2,
        cy - 5 + Math.sin(angle + 0.3) * (r1 + r2) / 2 * (brainRy / brainRx),
        cx + Math.cos(angle + 0.1) * r2,
        cy - 5 + Math.sin(angle + 0.1) * r2 * (brainRy / brainRx)
      );
      ctx.stroke();
    }
  }

  // Tumor overlay
  if (segOverlay && brainRx > 40) {
    const tumorCx = cx + brainRx * 0.25;
    const tumorCy = cy - brainRy * 0.15;
    const tumorR = brainRx * 0.22;
    ctx.beginPath();
    ctx.ellipse(tumorCx, tumorCy, tumorR * 1.6, tumorR * 1.4, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(234,179,8,0.25)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(tumorCx, tumorCy, tumorR, tumorR * 0.9, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(220,38,38,0.55)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(tumorCx, tumorCy, tumorR * 0.55, tumorR * 0.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(180,83,9,0.6)';
    ctx.fill();
  }

  // Crosshair
  if (showCrosshair) {
    ctx.strokeStyle = 'rgba(13, 148, 136, 0.7)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, cy); ctx.lineTo(W, cy);
    ctx.moveTo(cx, 0); ctx.lineTo(cx, H);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ── Enhanced MRI Viewer ──────────────────────────────── */
function MRIViewer({ axis, slice, maxSlice, segOverlay, onAxisChange, onSliceChange, sessionId, files }) {
  const canvasRef = React.useRef(null);
  const [activeMod, setActiveMod] = React.useState('T1ce');
  const [windowVal, setWindowVal] = React.useState(1.0);
  const [levelVal, setLevelVal] = React.useState(0.5);
  const [showCrosshair, setShowCrosshair] = React.useState(false);
  const [showLabels, setShowLabels] = React.useState(true);
  const [layout, setLayout] = React.useState('single'); // 'single' | 'multi'
  const [segOn, setSegOn] = React.useState(segOverlay !== false);
  const [realImgErr, setRealImgErr] = React.useState({});

  // Gerçek NIfTI dosyası varsa /api/slice ile PNG çek; yoksa sentetik fallback.
  const hasReal = !!sessionId && Array.isArray(files) && files.length > 0;
  const findFile = (mod) => {
    if (!hasReal) return null;
    const wanted = mod.toLowerCase();
    return files.find(f => (f.modality || '').toLowerCase() === wanted)
        || files.find(f => (f.filename || '').toLowerCase().includes(wanted))
        || null;
  };
  // Modality-aware seg picker: prefer native-space per-modality seg so the
  // overlay aligns voxel-wise with the MR being shown. Falls back to any seg.
  // E.g., viewing CT1.nii.gz → ct1_seg_mask.nii.gz; T1.nii.gz → t1_seg_mask, etc.
  const isSegFile = (f) => {
    const m = (f.modality || '').toUpperCase();
    const n = (f.filename || '').toLowerCase();
    return m === 'SEG' || m.startsWith('MASK')
        || n.includes('seg') || n.includes('mask')
        || n.includes('whole') || n.includes('core') || n.includes('enh');
  };
  const allSegs = hasReal ? files.filter(isSegFile) : [];

  const pickSegFor = (mainFilename) => {
    if (!allSegs.length) return null;
    const main = (mainFilename || '').toLowerCase();
    // LUMIERE convention: ct1_seg_mask.nii.gz ↔ CT1.nii.gz, t1_seg_mask ↔ T1.nii.gz...
    const wantedPrefix = (
      main.startsWith('ct1')   ? 'ct1_' :
      main.startsWith('flair') ? 'flair_' :
      main.startsWith('t1c')   ? 'ct1_' :
      main.startsWith('t1')    ? 't1_' :
      main.startsWith('t2')    ? 't2_' : null
    );
    if (wantedPrefix) {
      const match = allSegs.find(s => (s.filename || '').toLowerCase().startsWith(wantedPrefix));
      if (match) return match;
    }
    return allSegs[0];
  };
  const segFile = hasReal ? pickSegFor(findFile(activeMod)?.filename) : null;

  const buildRealUrl = (mod, ax, sl) => {
    const f = findFile(mod);
    if (!f) return null;
    const seg = pickSegFor(f.filename);
    const overlays = segOn && seg && seg.filename !== f.filename ? [seg.filename] : [];
    return window.GBM_API
      ? window.GBM_API.getSliceUrl(sessionId, f.filename, ax, sl, overlays)
      : null;
  };

  const multiRefs = { axial: React.useRef(), coronal: React.useRef(), sagittal: React.useRef() };
  const maxSlices = { axial: 154, coronal: 239, sagittal: 239 };

  const axisLabel = { axial: 'AX', coronal: 'COR', sagittal: 'SAG' }[axis] || 'AX';

  // Window/Level CSS filtreleri — backend perscent ölçeklemesi yaptığı için
  // ek kontrast/parlaklık ayarı görsel ince ayar olarak uygulanır
  const wlFilter = `contrast(${(windowVal * 100).toFixed(0)}%) brightness(${(40 + levelVal * 120).toFixed(0)}%)`;

  const realActive = hasReal && !realImgErr[activeMod];
  const singleUrl = realActive ? buildRealUrl(activeMod, axis, slice) : null;

  // "MRI yok" placeholder
  const NoMriPlaceholder = React.createElement('div', {
    style: {
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: 340, background: '#0a0a12', borderRadius: 6, gap: 14, padding: 32
    }
  },
    React.createElement('div', {
      style: {
        width: 72, height: 72, borderRadius: '50%',
        border: '2px dashed rgba(255,255,255,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, color: 'rgba(255,255,255,0.2)'
      }
    }, '⊘'),
    React.createElement('div', { style: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 600, textAlign: 'center' } },
      'MRI dosyası yüklenmemiş'),
    React.createElement('div', { style: { color: 'rgba(255,255,255,0.3)', fontSize: 11.5, textAlign: 'center', maxWidth: 260, lineHeight: 1.6 } },
      'Analiz formundan T1, T2, FLAIR ve T1c NIfTI dosyalarını yükleyerek gerçek MRI görüntülemeyi etkinleştirin.')
  );

  return React.createElement('div', { className: 'viewer-container' },
    layout === 'single'
      ? React.createElement('div', { className: 'viewer-image-wrap', style: { position: 'relative' } },
          !hasReal
            ? NoMriPlaceholder
            : singleUrl
              ? React.createElement('img', {
                  src: singleUrl,
                  alt: 'MRI slice',
                  draggable: false,
                  onError: () => setRealImgErr(s => ({ ...s, [activeMod]: true })),
                  style: {
                    width: '100%', height: '100%', objectFit: 'contain',
                    background: '#000', filter: wlFilter,
                    imageRendering: 'auto', userSelect: 'none'
                  }
                })
              : React.createElement('div', {
                  style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 340, background: '#0a0a12', color: 'rgba(255,255,255,0.4)', fontSize: 12 }
                }, activeMod + ' verisi yüklenemedi'),
          hasReal && showLabels && React.createElement(React.Fragment, null,
            React.createElement('span', { className: 'viewer-overlay tl' }, `${axisLabel} ${slice} / ${maxSlice}`),
            React.createElement('span', { className: 'viewer-overlay tr' },
              realActive ? (findFile(activeMod)?.filename || 'NIfTI') : ''),
            React.createElement('span', { className: 'viewer-overlay bl' },
              `W ${(windowVal * 100).toFixed(0)} · L ${(levelVal * 100).toFixed(0)}`),
            segOn && segFile && React.createElement('span', { className: 'viewer-overlay br' },
              'SEG: ' + segFile.filename)
          )
        )
      : React.createElement('div', { className: 'multi-axis-grid' },
          !hasReal
            ? React.createElement('div', { style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: 'rgba(255,255,255,0.35)', fontSize: 13 } },
                'MRI dosyası yüklenmemiş')
            : ['axial', 'coronal', 'sagittal'].map(ax => {
                const s = ax === axis ? slice : Math.floor(maxSlices[ax] / 2);
                const url = realActive ? buildRealUrl(activeMod, ax, s) : null;
                return React.createElement('div', { key: ax,
                  className: 'multi-axis-cell ' + (axis === ax ? 'active' : ''),
                  onClick: () => onAxisChange(ax)
                },
                  url
                    ? React.createElement('img', {
                        src: url, alt: ax,
                        onError: () => setRealImgErr(st => ({ ...st, [activeMod]: true })),
                        style: { width: '100%', height: '100%', objectFit: 'contain', background: '#000', filter: wlFilter }
                      })
                    : React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 11 } }, 'Yüklenemedi'),
                  React.createElement('div', { className: 'multi-axis-label' },
                    { axial: 'AKSİYEL', coronal: 'KORONAL', sagittal: 'SAGİTTAL' }[ax],
                    ' · ', s + '/' + maxSlices[ax])
                );
              }),
          React.createElement('div', { className: 'multi-axis-cell', style: { background: '#050510' } },
            React.createElement('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.4)', fontSize: 11, fontFamily: 'var(--mono)', gap: 6 } },
              React.createElement('div', { style: { fontWeight: 700, fontSize: 13, color: 'rgba(255,255,255,0.6)' } }, activeMod),
              React.createElement('div', null, realActive ? (findFile(activeMod)?.filename || 'NIfTI') : '155 × 240 × 240'),
              React.createElement('div', { style: { fontSize: 10, opacity: 0.7 } }, realActive ? 'Kaynak: yüklenen NIfTI' : 'Voxel: 1.0 × 1.0 × 1.0 mm')
            )
          )
        ),
    hasReal && React.createElement('div', { className: 'viewer-controls' },
      // Row 1: Axis + Modality
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 } },
        layout === 'single' && React.createElement('div', { className: 'viewer-axis-btns' },
          ['axial', 'coronal', 'sagittal'].map(a =>
            React.createElement('button', {
              key: a, className: `axis-btn ${axis === a ? 'active' : ''}`,
              onClick: () => onAxisChange(a)
            }, a === 'axial' ? 'Aksiyel' : a === 'coronal' ? 'Koronal' : 'Sagittal')
          )
        ),
        layout === 'multi' && React.createElement('span', { style: { fontFamily: 'var(--mono)', fontSize: 11, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.4 } }, 'ÇOK EKSENLİ GÖRÜNÜM'),
        React.createElement('div', { style: { display: 'flex', gap: 4 } },
          ['T1ce', 'T1', 'T2', 'FLAIR'].map(m =>
            React.createElement('button', {
              key: m, className: `vmod-btn ${activeMod === m ? 'active' : ''}`,
              onClick: () => setActiveMod(m)
            }, m)
          )
        )
      ),
      // Row 2: Slider
      React.createElement('div', { className: 'viewer-slider-row' },
        React.createElement('label', null, 'DİLİM'),
        React.createElement('input', {
          type: 'range', min: 0, max: maxSlice, value: slice,
          onChange: e => onSliceChange(parseInt(e.target.value))
        }),
        React.createElement('span', { className: 'slice-readout' }, `${slice} / ${maxSlice}`)
      ),
      // Row 3: Window/Level
      React.createElement('div', { style: { display: 'flex', gap: 14, alignItems: 'center' } },
        React.createElement('div', { className: 'viewer-slider-row', style: { flex: 1 } },
          React.createElement('label', null, 'W'),
          React.createElement('input', {
            type: 'range', min: 0.1, max: 2.0, step: 0.05, value: windowVal,
            onChange: e => setWindowVal(parseFloat(e.target.value))
          }),
          React.createElement('span', { className: 'slice-readout', style: { minWidth: 36 } }, windowVal.toFixed(2))
        ),
        React.createElement('div', { className: 'viewer-slider-row', style: { flex: 1 } },
          React.createElement('label', null, 'L'),
          React.createElement('input', {
            type: 'range', min: 0, max: 1, step: 0.02, value: levelVal,
            onChange: e => setLevelVal(parseFloat(e.target.value))
          }),
          React.createElement('span', { className: 'slice-readout', style: { minWidth: 36 } }, levelVal.toFixed(2))
        )
      ),
      // Tools row
      React.createElement('div', { className: 'viewer-tools' },
        React.createElement('button', { className: 'tool-btn ' + (segOn ? 'active' : ''), onClick: () => setSegOn(!segOn) },
          '◐ Segmentasyon'),
        React.createElement('button', { className: 'tool-btn ' + (showCrosshair ? 'active' : ''), onClick: () => setShowCrosshair(!showCrosshair) },
          '+ Crosshair'),
        React.createElement('button', { className: 'tool-btn ' + (showLabels ? 'active' : ''), onClick: () => setShowLabels(!showLabels) },
          'Aa Etiketler'),
        React.createElement('button', { className: 'tool-btn ' + (layout === 'multi' ? 'active' : ''), onClick: () => setLayout(layout === 'single' ? 'multi' : 'single') },
          '⊞ Çok Eksen'),
        React.createElement('button', { className: 'tool-btn', onClick: () => { setWindowVal(1.0); setLevelVal(0.5); } },
          '↺ Sıfırla')
      )
    ),
    hasReal && segOn && layout === 'single' && React.createElement('div', { className: 'viewer-legend' },
      React.createElement('div', { className: 'legend-item' },
        React.createElement('div', { className: 'legend-swatch', style: { background: '#dc2626' } }), 'Enhancing'),
      React.createElement('div', { className: 'legend-item' },
        React.createElement('div', { className: 'legend-swatch', style: { background: '#b45309' } }), 'Nekrotik Core'),
      React.createElement('div', { className: 'legend-item' },
        React.createElement('div', { className: 'legend-swatch', style: { background: '#eab308' } }), 'Ödem')
    )
  );
}

window.MRIViewer = MRIViewer;
window.renderBrainSlice = renderBrainSlice;
