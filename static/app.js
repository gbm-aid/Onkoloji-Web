/* =================================================================
   GBM-AID v5.0 — Frontend Application Logic
   ================================================================= */

const API = '';
let state = {
  sessionId: '',
  files: [],
  currentStep: 1,
  currentPage: 'analysis',
  analysisResult: null,
  viewerAxis: 'axial',
  viewerSlice: 0,
  viewerMaxSlice: 0,
};

/* ── Init ─────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupUploadZone();
  setupStepperClicks();
  switchPage('analysis');
});

/* ── Navigation ───────────────────────────────────────────── */

function setupNavigation() {
  document.querySelectorAll('.topbar-nav a').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      switchPage(a.dataset.page);
    });
  });
}

function switchPage(id) {
  state.currentPage = id;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.topbar-nav a').forEach(a => a.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  const link = document.querySelector(`.topbar-nav a[data-page="${id}"]`);
  if (page) page.classList.add('active');
  if (link) link.classList.add('active');

  // Update breadcrumb
  const labels = { analysis: 'Analiz', records: 'Hasta Kayitlari', database: 'Kohort Istatistikleri', reports: 'Raporlar', help: 'Yardim' };
  const bc = document.getElementById('breadcrumb-current');
  if (bc) bc.textContent = labels[id] || id;

  const ph = document.getElementById('page-title');
  const titles = { analysis: 'Yeni Analiz Baslat', records: 'Hasta Kayitlari', database: 'Kohort Analizi', reports: 'Raporlar', help: 'Yardim' };
  if (ph) ph.textContent = titles[id] || '';

  if (id === 'records') loadPatients();
  if (id === 'reports') loadReportsList();
  if (id === 'database') loadCohortStats();
}

/* ── Stepper ──────────────────────────────────────────────── */

function setStep(n) {
  state.currentStep = n;
  document.querySelectorAll('.step').forEach((el, i) => {
    el.classList.remove('active', 'done');
    if (i + 1 < n) el.classList.add('done');
    else if (i + 1 === n) el.classList.add('active');
  });
  document.querySelectorAll('.step-line').forEach((el, i) => {
    el.classList.toggle('done', i + 1 < n);
  });
}

function setupStepperClicks() {
  // Steps are informational, not clickable
}

/* ── Upload ───────────────────────────────────────────────── */

function setupUploadZone() {
  const zone = document.getElementById('upload-zone');
  const input = document.getElementById('file-input');
  if (!zone || !input) return;

  zone.addEventListener('click', e => {
    if (e.target.closest('button')) return;
    input.click();
  });
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleUpload(e.dataTransfer.files);
  });
  input.addEventListener('change', () => { if (input.files.length) handleUpload(input.files); });
}

function triggerFileSelect() {
  document.getElementById('file-input')?.click();
}

async function handleUpload(fileList) {
  showLoader('Dosyalar yukleniyor...');
  const form = new FormData();
  for (const f of fileList) form.append('files', f);
  try {
    const res = await fetch(API + '/api/upload', { method: 'POST', body: form });
    const data = await res.json();
    state.sessionId = data.session_id;
    state.files = data.files;
    setStep(2);
    renderMatchTable();
    renderFileCount();
    showClinicalForm();
  } catch (err) {
    alert('Yukleme hatasi: ' + err.message);
  } finally {
    hideLoader();
  }
}

function renderFileCount() {
  const el = document.getElementById('file-count');
  if (el) el.textContent = state.files.length + ' dosya';
}

function renderMatchTable() {
  const tbody = document.getElementById('match-tbody');
  if (!tbody) return;

  const mods = state.files.map(f => f.modality).filter(m => m !== 'UNKNOWN');
  const needed = ['T1', 'T1ce', 'T2', 'FLAIR'];
  const found = needed.filter(n => mods.includes(n));

  // Info banner
  const banner = document.getElementById('match-info-banner');
  if (banner) {
    let html = found.map(m => `<span class="mod-badge ${m}">${m}</span>`).join(' ');
    const missing = needed.filter(n => !mods.includes(n));
    if (missing.length) html += `<br><span style="color:var(--orange);font-size:11px;margin-top:4px;display:inline-block">Eksik: ${missing.join(', ')}</span>`;
    banner.innerHTML = `<strong>${found.length}/4</strong> modalite tanimlandi: ${html}`;
    banner.style.display = 'block';
  }

  const allOptions = ['T1', 'T1ce', 'T2', 'FLAIR', 'MASK (Core)', 'MASK (Whole)', 'MASK (Enh)', 'Diger'];
  const modToOption = {
    'T1': 'T1', 'T1ce': 'T1ce', 'T2': 'T2', 'FLAIR': 'FLAIR',
    'MASK-Core': 'MASK (Core)', 'MASK-Whole': 'MASK (Whole)', 'MASK-Enh': 'MASK (Enh)',
    'SEG': 'MASK (Whole)', 'UNKNOWN': 'Diger'
  };

  tbody.innerHTML = state.files.map((f, i) => {
    const confClass = f.confidence >= 90 ? '' : 'low';
    const selectedOpt = modToOption[f.modality] || 'Diger';
    const options = allOptions.map(o =>
      `<option value="${o}" ${o === selectedOpt ? 'selected' : ''}>${o}</option>`
    ).join('');
    return `
      <tr>
        <td style="font-weight:500">${esc(f.filename)}</td>
        <td><span class="mod-badge ${f.modality}">${f.modality === 'UNKNOWN' ? 'UNKNOWN' : f.modality}</span></td>
        <td><span class="conf"><span class="conf-dot ${confClass}"></span>${f.confidence}%</span></td>
        <td><select class="seq-select" data-idx="${i}" onchange="updateFileModality(${i}, this.value)">${options}</select></td>
      </tr>`;
  }).join('');

  document.getElementById('match-empty')?.remove();
}

function updateFileModality(idx, val) {
  const map = { 'T1': 'T1', 'T1ce': 'T1ce', 'T2': 'T2', 'FLAIR': 'FLAIR', 'MASK (Core)': 'MASK-Core', 'MASK (Whole)': 'MASK-Whole', 'MASK (Enh)': 'MASK-Enh', 'Diger': 'UNKNOWN' };
  state.files[idx].modality = map[val] || 'UNKNOWN';
}

function showClinicalForm() {
  const el = document.getElementById('clinical-section');
  if (el) el.style.display = 'block';
  setStep(3);
}

/* ── Lumiere Patient Selection ────────────────────────────── */

let lumiereData = [];

async function openLumiereModal() {
  const modal = document.getElementById('lumiere-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  showLoader('Lumiere hastalari yukleniyor...');
  try {
    const res = await fetch(API + '/api/lumiere-patients');
    const data = await res.json();
    lumiereData = data.patients || [];
    document.getElementById('lumiere-count').textContent = lumiereData.length + ' hasta';
    renderLumiereList(lumiereData);
  } catch (err) {
    document.getElementById('lumiere-list').innerHTML = '<div style="padding:20px;color:var(--red)">Yuklenemedi: ' + err.message + '</div>';
  } finally {
    hideLoader();
  }
}

function closeLumiereModal() {
  const modal = document.getElementById('lumiere-modal');
  if (modal) modal.style.display = 'none';
}

function filterLumiereList() {
  const q = (document.getElementById('lumiere-search')?.value || '').toLowerCase();
  const filtered = lumiereData.filter(p => p.patient_id.toLowerCase().includes(q));
  renderLumiereList(filtered);
}

function renderLumiereList(patients) {
  const el = document.getElementById('lumiere-list');
  if (!el) return;
  if (!patients.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">Hasta bulunamadi</div>';
    return;
  }
  el.innerHTML = patients.map(p => `
    <div class="lum-item" onclick="selectLumierePatient('${esc(p.patient_id)}','${esc(p.default_timepoint)}')">
      <span class="lum-pid">${esc(p.patient_id)}</span>
      <span class="lum-info">${p.timepoints.length} zaman noktasi</span>
      <span class="lum-badge">${p.mri_count}/4 MR</span>
    </div>
  `).join('');
}

async function selectLumierePatient(patientId, defaultTp) {
  closeLumiereModal();
  showLoader('MR dosyalari yukleniyor...');
  try {
    const res = await fetch(API + '/api/lumiere-files/' + encodeURIComponent(patientId) + '?timepoint=' + encodeURIComponent(defaultTp));
    const data = await res.json();
    if (!data.files || data.files.length === 0) {
      alert('Bu hasta icin MR dosyasi bulunamadi.');
      hideLoader();
      return;
    }

    const tp = data.timepoint || defaultTp;
    state.sessionId = patientId + ':' + tp;
    state.lumierePatientId = patientId;
    state.lumiereTimepoint = tp;
    state.lumiereTimepoints = data.timepoints || [];

    state.files = data.files.map(f => ({
      filename: f.filename,
      safe_name: f.filename,
      size_mb: f.size_mb || 0,
      modality: f.modality,
      modality_label: f.modality_label || f.modality,
      confidence: 99,
      shape: f.shape || [182, 218, 182],
      voxel_size: f.voxel_size || [1, 1, 1],
    }));

    setStep(2);
    renderMatchTable();
    renderFileCount();

    const pidInput = document.getElementById('inp-pid');
    if (pidInput) pidInput.value = patientId;

    showClinicalForm();
  } catch (err) {
    alert('Dosya yuklenemedi: ' + err.message);
  } finally {
    hideLoader();
  }
}

/* ── Analysis ─────────────────────────────────────────────── */

async function runAnalysis() {
  const pid = document.getElementById('inp-pid')?.value.trim() || undefined;
  const age = parseInt(document.getElementById('inp-age')?.value) || 60;
  const gender = document.getElementById('inp-gender')?.value || 'unknown';
  const kps = parseInt(document.getElementById('inp-kps')?.value) || 70;
  const treatment = document.getElementById('inp-treatment')?.value || 'stupp';
  const mgmt = document.getElementById('inp-mgmt')?.value || 'unknown';
  const idh1 = document.getElementById('inp-idh1')?.value || 'unknown';

  setStep(4);
  showLoader('Analiz calistiriliyor...');

  try {
    const res = await fetch(API + '/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        patient_id: pid,
        session_id: state.sessionId,
        clinical: { age, gender, kps_score: kps, treatment, mgmt_status: mgmt, idh1_status: idh1 },
        files: state.files,
      }),
    });
    const data = await res.json();
    state.analysisResult = data;
    setStep(5);
    showResults(data);
  } catch (err) {
    alert('Analiz hatasi: ' + err.message);
    setStep(3);
  } finally {
    hideLoader();
  }
}

/* ── Results ──────────────────────────────────────────────── */

function showResults(data) {
  const r = data.results;
  document.getElementById('analysis-input-area').style.display = 'none';
  document.getElementById('analysis-results-area').style.display = 'block';

  // Banner
  document.getElementById('res-report-id').textContent = r.report_id + '  ·  ' + new Date().toLocaleDateString('tr-TR');

  // KPIs
  document.getElementById('kpi-surv').textContent = '%' + Math.round(r.survival_6m_pct);
  document.getElementById('kpi-vol').innerHTML = r.radiomics.tumor_volume_cm3.toFixed(1) + '<span class="kpi-unit"> cm³</span>';
  document.getElementById('kpi-risk').textContent = Math.round(r.risk_score);

  // Survival bar
  const survFill = document.getElementById('surv-fill');
  if (survFill) {
    survFill.style.width = r.survival_6m_pct + '%';
    survFill.style.background = r.survival_6m_pct > 50 ? 'var(--green)' : r.survival_6m_pct > 25 ? 'var(--yellow)' : 'var(--red)';
  }
  document.getElementById('surv-val').textContent = '%' + Math.round(r.survival_6m_pct);

  // Risk slider
  const marker = document.getElementById('risk-marker');
  if (marker) marker.style.left = r.risk_score + '%';
  const riskBadge = document.getElementById('risk-badge');
  if (riskBadge) {
    riskBadge.textContent = r.risk_label;
    riskBadge.className = 'risk-badge ' + r.risk_class;
  }

  // Tumor volumes
  document.getElementById('vol-whole').textContent = r.radiomics.tumor_volume_cm3.toFixed(1);
  document.getElementById('vol-core').textContent = r.radiomics.core_volume_cm3.toFixed(1);
  document.getElementById('vol-enh').textContent = r.radiomics.enhancing_volume_cm3.toFixed(1);

  // Viewer
  setupViewer();

  // AI summary
  document.getElementById('ai-text').textContent = r.ai_summary;

  // Cohort
  renderCohort(r.similar_patients);

  // Literature
  renderLiterature(r.literature);

  // Projection
  renderProjection(r.projection, r.radiomics.tumor_volume_cm3);
}

/* ── MRI Viewer ───────────────────────────────────────────── */

function setupViewer() {
  const imgFiles = state.files.filter(f => ['T1', 'T1ce', 'T2', 'FLAIR'].includes(f.modality));
  const segFiles = state.files.filter(f => f.modality.startsWith('MASK') || f.modality === 'SEG');
  const mainFile = imgFiles.find(f => f.modality === 'T1ce') || imgFiles.find(f => f.modality === 'FLAIR') || imgFiles[0];

  if (!mainFile) {
    document.getElementById('viewer-img').alt = 'Goruntu bulunamadi';
    return;
  }

  const shape = mainFile.shape || [155, 240, 240];
  const axisMax = { axial: shape[2] - 1, coronal: shape[1] - 1, sagittal: shape[0] - 1 };
  state.viewerMaxSlice = axisMax[state.viewerAxis] || 0;
  state.viewerSlice = Math.floor(state.viewerMaxSlice / 2);

  const slider = document.getElementById('slice-slider');
  if (slider) {
    slider.max = state.viewerMaxSlice;
    slider.value = state.viewerSlice;
  }

  const dimEl = document.getElementById('viewer-dim');
  if (dimEl) dimEl.textContent = shape.join('x');

  updateViewerImage(mainFile, segFiles);
  updateSliceReadout();

  // Axis buttons
  document.querySelectorAll('.axis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.axis-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.viewerAxis = btn.dataset.axis;
      const newMax = axisMax[state.viewerAxis] || 0;
      state.viewerMaxSlice = newMax;
      state.viewerSlice = Math.floor(newMax / 2);
      if (slider) { slider.max = newMax; slider.value = state.viewerSlice; }
      updateViewerImage(mainFile, segFiles);
      updateSliceReadout();
    });
  });

  // Slice slider
  if (slider) {
    slider.addEventListener('input', () => {
      state.viewerSlice = parseInt(slider.value);
      updateViewerImage(mainFile, segFiles);
      updateSliceReadout();
    });
  }
}

function updateViewerImage(mainFile, segFiles) {
  const img = document.getElementById('viewer-img');
  if (!img) return;
  let url = `${API}/api/slice/${encodeURIComponent(state.sessionId)}/${encodeURIComponent(mainFile.filename)}?axis=${state.viewerAxis}&index=${state.viewerSlice}`;
  if (segFiles.length) {
    url += '&overlays=' + segFiles.map(f => encodeURIComponent(f.filename)).join(',');
  }
  img.src = url;
  const label = document.getElementById('viewer-axis-label');
  const axisLabels = { axial: 'AXIAL', coronal: 'CORONAL', sagittal: 'SAGITTAL' };
  if (label) label.textContent = (axisLabels[state.viewerAxis] || 'AXIAL') + ' Z=' + state.viewerSlice;
}

function updateSliceReadout() {
  const el = document.getElementById('slice-readout');
  if (el) el.textContent = state.viewerSlice + '/' + state.viewerMaxSlice;
}

/* ── Cohort ───────────────────────────────────────────────── */

function renderCohort(patients) {
  const tbody = document.getElementById('cohort-tbody');
  if (!tbody || !patients) return;
  tbody.innerHTML = patients.map(p => `
    <tr>
      <td style="font-weight:600;font-family:var(--mono);font-size:12px">${esc(p.id)}</td>
      <td>${(p.similarity * 100).toFixed(1)}%</td>
      <td>${p.tumor_volume_cm3 ? p.tumor_volume_cm3.toFixed(1) + ' cm³' : '-'}</td>
      <td>${p.core_volume_cm3 ? p.core_volume_cm3.toFixed(1) + ' cm³' : '-'}</td>
      <td style="font-size:11px">${p.available_modalities ? p.available_modalities.join(', ') : '-'}</td>
    </tr>`
  ).join('');
}

/* ── Literature ───────────────────────────────────────────── */

function renderLiterature(lit) {
  if (!lit) return;
  const el = document.getElementById('lit-content');
  if (!el) return;

  const srcLabel = lit.source === 'pubmed'
    ? '<span style="color:var(--green);font-size:11px;font-weight:600">PubMed canli sorgu</span>'
    : '<span style="color:var(--orange);font-size:11px">Statik referanslar (PubMed ulasılamadı)</span>';

  let html = `
    <div style="margin-bottom:10px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div>
        <span style="font-size:12px;color:var(--text-muted)">Sorgu terimleri: </span>
        ${lit.terms.map(t => `<span style="background:var(--bg);padding:2px 8px;border-radius:3px;font-size:11px;margin-right:3px;font-family:var(--mono)">${esc(t)}</span>`).join('')}
      </div>
      ${srcLabel}
    </div>
    <div class="lit-summary">${esc(lit.summary)}</div>
  `;

  lit.refs.forEach(r => {
    html += `<div class="lit-ref"><strong>[PMID: ${esc(r.pmid)}]</strong> ${esc(r.title)}<br><span class="ref-journal">${esc(r.journal)} (${r.year})</span></div>`;
  });

  el.innerHTML = html;
}

/* ── Projection ───────────────────────────────────────────── */

function renderProjection(proj, baseVol) {
  const el = document.getElementById('proj-content');
  if (!el || !proj) return;

  const maxVol = Math.max(...proj.map(p => p.volume_cm3));
  let html = `<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Baslangic hacmi: <strong>${baseVol.toFixed(1)} cm³</strong></div>`;
  html += `<div style="display:flex;align-items:flex-end;gap:10px;height:130px;padding-bottom:4px;border-bottom:1px solid var(--border-light)">`;

  proj.forEach(p => {
    const pct = (p.volume_cm3 / maxVol) * 100;
    const color = p.change_pct < 25 ? 'var(--green)' : p.change_pct < 50 ? 'var(--yellow)' : 'var(--red)';
    html += `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
        <span style="font-size:10px;font-weight:600;color:var(--text)">${p.volume_cm3.toFixed(0)}</span>
        <div style="width:100%;height:${pct}%;background:${color};border-radius:4px 4px 0 0;min-height:4px;transition:height .4s"></div>
        <span style="font-size:10px;color:var(--text-muted)">${p.week}h</span>
        <span style="font-size:9px;font-weight:700;color:${color}">${p.rano}</span>
      </div>`;
  });

  html += `</div>`;
  html += `<div style="font-size:11px;color:var(--text-faint);margin-top:6px">RANO kriterleri ile 6 aylik hacim projeksiyonu (LUMIERE kalibrasyonu)</div>`;
  el.innerHTML = html;
}

/* ── Patient records ──────────────────────────────────────── */

async function loadPatients() {
  try {
    const res = await fetch(API + '/api/patients');
    const data = await res.json();
    const count = document.getElementById('patients-count');
    if (count) count.textContent = (data.patients || []).length + ' hasta';
    renderPatientTable(data.patients);
  } catch (err) { console.error(err); }
}

function renderPatientTable(patients) {
  const tbody = document.getElementById('patients-tbody');
  const empty = document.getElementById('patients-empty');
  if (!tbody) return;

  if (!patients || patients.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  tbody.innerHTML = patients.map(p => `
    <tr>
      <td style="font-weight:600;font-family:var(--mono);font-size:12px">${esc(p.patient_id)}</td>
      <td>${p.date || '-'}</td>
      <td>${p.age || '-'}</td>
      <td>${p.kps || '-'}</td>
      <td>${p.mgmt || '-'}</td>
      <td>${p.idh1 || '-'}</td>
      <td>${p.risk_score != null ? p.risk_score.toFixed(0) : '-'}</td>
      <td>${p.risk_class ? `<span class="risk-badge ${p.risk_class}">${p.risk_label}</span>` : '-'}</td>
      <td>${p.survival_6m != null ? '%' + p.survival_6m.toFixed(0) : '-'}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="viewPatientReport('${esc(p.patient_id)}')">Detay</button>
        <button class="btn btn-sm btn-danger-outline" onclick="deletePatient('${esc(p.patient_id)}')">Sil</button>
      </td>
    </tr>
  `).join('');
}

async function deletePatient(pid) {
  if (!confirm(pid + ' kaydini silmek istediginize emin misiniz?')) return;
  await fetch(API + '/api/patients/' + encodeURIComponent(pid), { method: 'DELETE' });
  loadPatients();
}

/* ── Reports ──────────────────────────────────────────────── */

async function loadReportsList() {
  try {
    const res = await fetch(API + '/api/patients');
    const data = await res.json();
    const sel = document.getElementById('report-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Hasta secin --</option>';
    (data.patients || []).forEach(p => {
      sel.innerHTML += `<option value="${esc(p.patient_id)}">${esc(p.patient_id)} (${p.date})</option>`;
    });
  } catch (err) { console.error(err); }
}

async function viewPatientReport(pid) {
  switchPage('reports');
  await loadReportsList();
  const sel = document.getElementById('report-select');
  if (sel) sel.value = pid;
  loadReport(pid);
}

async function loadReport(pid) {
  const el = document.getElementById('report-body');
  if (!pid || !el) { if (el) el.innerHTML = '<div class="empty"><p>Hasta secin.</p></div>'; return; }

  try {
    const res = await fetch(API + '/api/patients/' + encodeURIComponent(pid));
    const d = await res.json();
    const c = d.clinical || {};
    const r = d.results || {};
    const rad = r.radiomics || {};

    el.innerHTML = `
      <div class="banner-success" style="margin-top:12px">
        <div class="banner-left">
          <div class="banner-check">&#10003;</div>
          <div>
            <div class="banner-title">${esc(d.patient_id)}</div>
            <div class="banner-sub">${r.report_id || ''} · ${d.date || ''}</div>
          </div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.print()">Yazdir</button>
      </div>

      <div class="grid-2col">
        <div class="card"><div class="section-head"><div class="section-title">Klinik Bilgiler</div></div>
          <div class="card-body">
            <table style="width:100%;font-size:13px">
              <tr><td style="color:var(--text-muted);padding:5px 0;width:140px">Yas</td><td style="font-weight:600">${c.age || '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">Cinsiyet</td><td style="font-weight:600">${c.gender || '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">KPS Skoru</td><td style="font-weight:600">${c.kps_score || '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">MGMT</td><td style="font-weight:600">${c.mgmt_status || '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">IDH1</td><td style="font-weight:600">${c.idh1_status || '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">Tedavi</td><td style="font-weight:600">${c.treatment || '-'}</td></tr>
            </table>
          </div>
        </div>
        <div class="card"><div class="section-head"><div class="section-title">Prognostik Sonuclar</div></div>
          <div class="card-body">
            <table style="width:100%;font-size:13px">
              <tr><td style="color:var(--text-muted);padding:5px 0;width:160px">Risk Skoru</td><td style="font-weight:700">${r.risk_score != null ? r.risk_score.toFixed(1) + ' / 100' : '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">Risk Sinifi</td><td>${r.risk_class ? `<span class="risk-badge ${r.risk_class}">${r.risk_label}</span>` : '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">6 Aylik Sagkalim</td><td style="font-weight:700">${r.survival_6m_pct != null ? '%' + r.survival_6m_pct.toFixed(1) : '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">Tumor Hacmi</td><td style="font-weight:700">${rad.tumor_volume_cm3 ? rad.tumor_volume_cm3.toFixed(1) + ' cm³' : '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">Nekrotik Cekirdek</td><td style="font-weight:700">${rad.core_volume_cm3 ? rad.core_volume_cm3.toFixed(1) + ' cm³' : '-'}</td></tr>
              <tr><td style="color:var(--text-muted);padding:5px 0">Enhancing</td><td style="font-weight:700">${rad.enhancing_volume_cm3 ? rad.enhancing_volume_cm3.toFixed(1) + ' cm³' : '-'}</td></tr>
            </table>
          </div>
        </div>
      </div>

      ${r.ai_summary ? `
      <div class="card"><div class="section-head"><div class="section-title">Yapay Zeka Degerlendirmesi</div><span class="ai-engine-badge">GBM-AID Motor</span></div>
        <div class="card-body"><p class="ai-text">${esc(r.ai_summary)}</p></div>
      </div>` : ''}

      ${d.treatments && d.treatments.length ? `
      <div class="card"><div class="section-head"><div class="section-title">Tedaviler</div></div>
        <div class="card-body">
          <table style="width:100%;font-size:13px;border-collapse:collapse">
            <thead><tr style="border-bottom:2px solid var(--border)">
              <th style="text-align:left;padding:6px 8px;color:var(--text-muted)">Ilac / Tedavi</th>
              <th style="text-align:left;padding:6px 8px;color:var(--text-muted)">Protokol</th>
              <th style="text-align:left;padding:6px 8px;color:var(--text-muted)">Siklus</th>
              <th style="text-align:left;padding:6px 8px;color:var(--text-muted)">Not</th>
            </tr></thead>
            <tbody>
              ${d.treatments.map(t => `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:6px 8px;font-weight:600">${esc(t.drug_name)}</td>
                <td style="padding:6px 8px">${esc(t.protocol || '-')}</td>
                <td style="padding:6px 8px">${t.cycles || '-'}</td>
                <td style="padding:6px 8px;font-size:12px;color:var(--text-muted)">${esc(t.notes || '')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : ''}

      <div id="report-timeline-container"></div>
      <div id="report-viewer-container"></div>
    `;

    loadTimeline(d.patient_id);
    loadReportViewer(d.patient_id);
  } catch (err) {
    el.innerHTML = '<p style="color:var(--red)">Rapor yuklenemedi.</p>';
  }
}

async function loadReportViewer(patientId) {
  const container = document.getElementById('report-viewer-container');
  if (!container) return;

  try {
    const res = await fetch(API + '/api/lumiere-files/' + encodeURIComponent(patientId));
    const data = await res.json();

    if (!data.files || data.files.length === 0) {
      container.innerHTML = '';
      return;
    }

    const imgFiles = data.files.filter(f => f.modality !== 'SEG');
    const segFiles = data.files.filter(f => f.modality === 'SEG');
    const mainFile = imgFiles.find(f => f.modality === 'T1ce') || imgFiles.find(f => f.modality === 'FLAIR') || imgFiles[0];

    if (!mainFile) return;

    const shape = mainFile.shape || [182, 218, 182];
    const tpOptions = (data.timepoints || []).map(tp =>
      `<option value="${esc(tp)}" ${tp === (data.timepoint || 'week-000') ? 'selected' : ''}>${esc(tp)}</option>`
    ).join('');

    container.innerHTML = `
      <div class="card">
        <div class="section-head">
          <div class="section-title">Tumor Goruntuleme</div>
          <div style="display:flex;gap:8px;align-items:center">
            <select id="rv-timepoint" class="select-small" style="font-size:12px;padding:3px 6px" onchange="changeReportTimepoint('${esc(patientId)}')">
              ${tpOptions}
            </select>
            <span style="font-size:11px;color:var(--text-muted)">${shape.join('x')}</span>
          </div>
        </div>
        <div class="card-body" style="padding:0">
          <div class="viewer-wrap" style="background:#0a0a12;border-radius:0 0 8px 8px;padding:12px;text-align:center">
            <div style="position:relative;display:inline-block">
              <img id="rv-img" src="" style="max-width:100%;height:320px;border-radius:4px" />
              <div id="rv-axis-label" style="position:absolute;top:8px;left:12px;color:#8af;font-size:12px;font-weight:700">AXIAL Z=91</div>
            </div>
            <div style="display:flex;justify-content:center;gap:6px;margin-top:10px">
              <button class="btn btn-sm rv-axis-btn active" data-axis="axial" onclick="rvSetAxis(this,'${esc(patientId)}')">Aksiyel</button>
              <button class="btn btn-sm rv-axis-btn" data-axis="coronal" onclick="rvSetAxis(this,'${esc(patientId)}')">Koronal</button>
              <button class="btn btn-sm rv-axis-btn" data-axis="sagittal" onclick="rvSetAxis(this,'${esc(patientId)}')">Sagittal</button>
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:8px;padding:0 12px">
              <span style="color:#8af;font-size:12px;font-weight:600">DILIM</span>
              <input type="range" id="rv-slider" min="0" max="${shape[2]-1}" value="${Math.floor(shape[2]/2)}" style="flex:1" oninput="rvSliceChange('${esc(patientId)}')"/>
              <span id="rv-readout" style="color:#aaa;font-size:12px">${Math.floor(shape[2]/2)}/${shape[2]-1}</span>
            </div>
            <div style="display:flex;justify-content:center;gap:16px;margin-top:8px;font-size:11px">
              <span style="color:rgb(220,50,50)">&#9632; Enhancing</span>
              <span style="color:rgb(180,120,30)">&#9632; Necrotic</span>
              <span style="color:rgb(230,230,50)">&#9632; Edema</span>
            </div>
          </div>
        </div>
      </div>
    `;

    window._rvState = {
      patientId: patientId,
      axis: 'axial',
      mainFile: mainFile.filename,
      segFiles: segFiles.map(f => f.filename),
      shape: shape,
      timepoint: data.timepoint || (data.timepoints && data.timepoints[0]) || '',
    };
    rvUpdateImage();
  } catch (err) {
    container.innerHTML = '';
  }
}

function rvUpdateImage() {
  const s = window._rvState;
  if (!s) return;
  const img = document.getElementById('rv-img');
  const slider = document.getElementById('rv-slider');
  if (!img || !slider) return;
  const idx = parseInt(slider.value);
  const sessionKey = s.patientId + ':' + s.timepoint;
  let url = `${API}/api/slice/${encodeURIComponent(sessionKey)}/${encodeURIComponent(s.mainFile)}?axis=${s.axis}&index=${idx}`;
  if (s.segFiles.length) {
    url += '&overlays=' + s.segFiles.map(f => encodeURIComponent(f)).join(',');
  }
  img.src = url;
  const label = document.getElementById('rv-axis-label');
  const axisNames = {axial:'AXIAL',coronal:'CORONAL',sagittal:'SAGITTAL'};
  if (label) label.textContent = (axisNames[s.axis]||'AXIAL') + ' Z=' + idx;
  const readout = document.getElementById('rv-readout');
  if (readout) readout.textContent = idx + '/' + slider.max;
}

function rvSetAxis(btn, patientId) {
  document.querySelectorAll('.rv-axis-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const s = window._rvState;
  if (!s) return;
  s.axis = btn.dataset.axis;
  const axisIdx = {axial:2, coronal:1, sagittal:0};
  const maxVal = s.shape[axisIdx[s.axis]] - 1;
  const slider = document.getElementById('rv-slider');
  if (slider) { slider.max = maxVal; slider.value = Math.floor(maxVal / 2); }
  rvUpdateImage();
}

function rvSliceChange(patientId) {
  rvUpdateImage();
}

async function changeReportTimepoint(patientId) {
  const sel = document.getElementById('rv-timepoint');
  if (!sel) return;
  const tp = sel.value;
  const res = await fetch(API + '/api/lumiere-files/' + encodeURIComponent(patientId) + '?timepoint=' + encodeURIComponent(tp));
  const data = await res.json();
  const imgFiles = data.files.filter(f => f.modality !== 'SEG');
  const segFiles = data.files.filter(f => f.modality === 'SEG');
  const mainFile = imgFiles.find(f => f.modality === 'T1ce') || imgFiles[0];
  if (!mainFile) return;
  const shape = mainFile.shape || [182, 218, 182];
  window._rvState = {
    patientId: patientId,
    axis: 'axial',
    mainFile: mainFile.filename,
    segFiles: segFiles.map(f => f.filename),
    shape: shape,
    timepoint: tp,
  };
  const slider = document.getElementById('rv-slider');
  if (slider) { slider.max = shape[2]-1; slider.value = Math.floor(shape[2]/2); }
  rvUpdateImage();
}

/* ── Reset ────────────────────────────────────────────────── */

function resetAnalysis() {
  state.sessionId = '';
  state.files = [];
  state.analysisResult = null;
  state.viewerSlice = 0;
  setStep(1);
  document.getElementById('analysis-input-area').style.display = 'block';
  document.getElementById('analysis-results-area').style.display = 'none';
  document.getElementById('clinical-section').style.display = 'none';
  document.getElementById('match-info-banner').style.display = 'none';

  const tbody = document.getElementById('match-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="match-empty">Dosya yuklenince gorunecek</td></tr>';

  const fc = document.getElementById('file-count');
  if (fc) fc.textContent = '0 dosya';

  // Reset form
  ['inp-pid','inp-age','inp-gender','inp-kps','inp-treatment','inp-mgmt','inp-idh1'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = el.defaultValue || '';
  });
}

function goToNewAnalysis() {
  resetAnalysis();
  switchPage('analysis');
}

function goToRecords() {
  switchPage('records');
}

/* ── Utilities ────────────────────────────────────────────── */

function esc(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(String(s)));
  return d.innerHTML;
}

function showLoader(text) {
  const o = document.getElementById('loader');
  const t = document.getElementById('loader-label');
  if (t) t.textContent = text || 'Yukleniyor...';
  if (o) o.classList.add('active');
}

function hideLoader() {
  const o = document.getElementById('loader');
  if (o) o.classList.remove('active');
}

/* ── CSV Import / Export ─────────────────────────────────── */

async function importCSV(input) {
  if (!input.files.length) return;
  showLoader('CSV import ediliyor...');
  const form = new FormData();
  form.append('file', input.files[0]);
  try {
    const res = await fetch(API + '/api/import-csv', { method: 'POST', body: form });
    const data = await res.json();
    const banner = document.getElementById('csv-result-banner');
    const title = document.getElementById('csv-result-title');
    const sub = document.getElementById('csv-result-sub');
    if (banner && title && sub) {
      title.textContent = 'CSV Import Tamamlandi';
      let msg = `${data.imported} yeni hasta eklendi, ${data.updated} hasta guncellendi.`;
      if (data.errors && data.errors.length) msg += ` ${data.errors.length} hata.`;
      sub.textContent = msg;
      banner.style.display = 'flex';
    }
    loadPatients();
  } catch (err) {
    alert('CSV import hatasi: ' + err.message);
  } finally {
    hideLoader();
    input.value = '';
  }
}

function exportCSV() {
  window.location.href = API + '/api/export-csv';
}

function downloadCSVTemplate() {
  const header = 'patient_id,age,gender,kps_score,mgmt_status,idh1_status,treatment_protocol,survival_days,status,notes';
  const example = 'Patient-001,55,M,80,methylated,wildtype,stupp,420,deceased,ornek kayit';
  const blob = new Blob([header + '\n' + example + '\n'], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hasta_sablonu.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ── Kohort İstatistikleri ───────────────────────────────── */

const RISK_COLORS = { low: 'var(--green)', medium: 'var(--yellow)', high: 'var(--red)' };
const RISK_LABELS = { low: 'Dusuk', medium: 'Orta', high: 'Yuksek' };
const MGMT_COLORS = { methylated: 'var(--green)', unmethylated: 'var(--red)', bilinmiyor: 'var(--text-faint)', unknown: 'var(--text-faint)' };
const IDH1_COLORS = { mutant: 'var(--blue)', wildtype: 'var(--orange)', 'wild-type': 'var(--orange)', bilinmiyor: 'var(--text-faint)', unknown: 'var(--text-faint)' };

async function loadCohortStats() {
  try {
    const res = await fetch(API + '/api/cohort-stats');
    const s = await res.json();

    document.getElementById('cs-total').textContent = s.total_patients;
    document.getElementById('cs-analyzed').textContent = s.analyzed;
    document.getElementById('cs-avg-risk').textContent = s.avg_risk || '-';
    document.getElementById('cs-avg-surv').textContent = s.avg_surv ? '%' + s.avg_surv : '-';

    renderStatBars('cs-risk-chart', s.risk_dist, RISK_COLORS, RISK_LABELS);
    renderStatBars('cs-age-chart', s.age_bins, {});
    renderStatBars('cs-mgmt-chart', s.mgmt_dist, MGMT_COLORS);
    renderStatBars('cs-idh1-chart', s.idh1_dist, IDH1_COLORS);
  } catch (err) {
    console.error('Cohort stats error:', err);
  }
}

function renderStatBars(containerId, data, colorMap, labelMap) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  if (!entries.length) {
    el.innerHTML = '<div class="empty" style="padding:24px 0"><p>Henuz veri yok</p></div>';
    return;
  }
  const total = entries.reduce((s, [, v]) => s + v, 0);
  entries.sort((a, b) => b[1] - a[1]);
  el.innerHTML = entries.map(([label, count]) => {
    const pct = Math.round(count / total * 100);
    const color = colorMap[label] || 'var(--blue)';
    const displayLabel = (labelMap && labelMap[label]) || label;
    return `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px">
          <span style="font-weight:600;color:var(--text)">${esc(displayLabel)}</span>
          <span style="color:var(--text-muted)">${count} hasta &middot; %${pct}</span>
        </div>
        <div style="height:10px;background:var(--border-light);border-radius:5px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:5px;transition:width .6s ease"></div>
        </div>
      </div>`;
  }).join('');
}

/* ── Hasta Zaman Çizelgesi ───────────────────────────────── */

async function loadTimeline(patientId) {
  const container = document.getElementById('report-timeline-container');
  if (!container) return;
  try {
    const res = await fetch(API + '/api/patients/' + encodeURIComponent(patientId) + '/timeline');
    const data = await res.json();
    renderTimeline(data.timeline || []);
  } catch (err) {
    container.innerHTML = '';
  }
}

function renderTimeline(timeline) {
  const container = document.getElementById('report-timeline-container');
  if (!container || timeline.length < 2) {
    if (container) container.innerHTML = '';
    return;
  }
  const items = timeline.map((t, i) => {
    const riskColor = RISK_COLORS[t.risk_class] || 'var(--blue)';
    return `
      <div class="tl-item">
        <div class="tl-dot" style="background:${riskColor}"></div>
        ${i < timeline.length - 1 ? '<div class="tl-line"></div>' : ''}
        <div class="tl-card">
          <div class="tl-date">${esc(t.created_at)}</div>
          <div class="tl-risk" style="color:${riskColor}">Risk ${t.risk_score != null ? Math.round(t.risk_score) : '-'}/100</div>
          <div class="tl-detail">
            ${t.tumor_volume_cm3 ? t.tumor_volume_cm3.toFixed(1) + ' cm³' : ''}
            ${t.survival_6m_pct != null ? ' · %' + Math.round(t.survival_6m_pct) + ' sagkalim' : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div class="card" style="margin-top:12px">
      <div class="section-head">
        <div class="section-title">HASTALIK SEYRI</div>
        <span class="section-badge">${timeline.length} analiz</span>
      </div>
      <div class="card-body">
        <div class="tl-wrap">${items}</div>
      </div>
    </div>`;
}
