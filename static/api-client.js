/**
 * GBM-AID API Client — Mock Fallback ile
 * API çağrıları başarısız olursa mock-data.js'teki verileri kullanır.
 */

// Fallback bayrağı — UI banner buna göre uyarı gösterir
window.GBM_FALLBACK_ACTIVE = false;
const _markFallback = (url, err) => {
  if (!window.GBM_FALLBACK_ACTIVE) {
    window.GBM_FALLBACK_ACTIVE = true;
    window.dispatchEvent(new CustomEvent('gbm-fallback', { detail: { url, err } }));
  }
};

// ─── Auth token management ──────────────────────────────
const _TOKEN_KEY = 'gbm_jwt';
const _getToken = () => localStorage.getItem(_TOKEN_KEY);
const _setToken = (t) => t ? localStorage.setItem(_TOKEN_KEY, t) : localStorage.removeItem(_TOKEN_KEY);

const _authHeaders = () => {
  const t = _getToken();
  return t ? { 'Authorization': 'Bearer ' + t } : {};
};

const _handle401 = () => {
  _setToken(null);
  window.dispatchEvent(new CustomEvent('gbm-auth-required'));
};

const GBM_API = {

  /** Generic GET with JSON parse */
  async _get(url) {
    try {
      const res = await fetch(url, { headers: _authHeaders() });
      if (res.status === 401) { _handle401(); throw new Error('HTTP 401'); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      window.GBM_FALLBACK_ACTIVE = false;
      return await res.json();
    } catch (err) {
      console.warn('[GBM-API] Fallback:', url, err.message);
      _markFallback(url, err.message);
      return null;
    }
  },

  /** Generic POST with JSON body */
  async _post(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._authHeaders() },
        body: JSON.stringify(body),
      });
      if (res.status === 401) { _handle401(); throw new Error('HTTP 401'); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      window.GBM_FALLBACK_ACTIVE = false;
      return await res.json();
    } catch (err) {
      console.warn('[GBM-API] POST error:', url, err.message);
      _markFallback(url, err.message);
      return null;
    }
  },

  // ─── Auth ───────────────────────────────────────────────

  async login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Giriş başarısız' }));
      return { ok: false, error: err.detail || ('HTTP ' + res.status) };
    }
    const data = await res.json();
    _setToken(data.access_token);
    return { ok: true, user: data.user };
  },

  async logout() {
    await this._post('/api/auth/logout', {});
    _setToken(null);
  },

  async getMe() {
    if (!_getToken()) return null;
    return await this._get('/api/auth/me');
  },

  isAuthenticated() {
    return !!_getToken();
  },

  // ─── Patients ───────────────────────────────────────────

  async getPatients() {
    const data = await this._get('/api/patients');
    if (data && data.patients) {
      // API patients'ı prototip formatına map'le
      return data.patients.map(p => ({
        patient_id: p.patient_id,
        age: p.age,
        gender: p.gender,
        kps_score: p.kps,
        mgmt_status: p.mgmt,
        idh1_status: p.idh1,
        treatment_protocol: p.treatment_protocol || '',
        diagnosis_date: p.diagnosis_date || null,
        tumor_location: p.tumor_location || '',
        surgery_type: p.surgery_type || '',
        risk_score: p.risk_score,
        risk_class: p.risk_class,
        risk_label: p.risk_label,
        survival_6m_pct: p.survival_6m,
        date: p.date || '',
        report_id: p.report_id || '',
        tumor_volume: null,
        core_volume: null,
        enhancing_volume: null,
        edema_volume: null,
        sphericity: null,
        treatments: [],
        ai_summary: '',
        notes: '',
      }));
    }
    return [...MOCK.patients]; // fallback
  },

  async getPatientDetail(patientId) {
    const data = await this._get('/api/patients/' + encodeURIComponent(patientId));
    if (data) {
      const c = data.clinical || {};
      const r = data.results || {};
      const rad = r.radiomics || {};
      return {
        patient_id: data.patient_id,
        age: c.age,
        gender: c.gender,
        kps_score: c.kps_score,
        mgmt_status: c.mgmt_status,
        idh1_status: c.idh1_status,
        treatment_protocol: c.treatment,
        diagnosis_date: c.diagnosis_date,
        tumor_location: c.tumor_location,
        surgery_type: c.surgery_type,
        risk_score: r.risk_score,
        risk_class: r.risk_class,
        risk_label: r.risk_label,
        survival_6m_pct: r.survival_6m_pct,
        tumor_volume: rad.tumor_volume_cm3,
        core_volume: rad.core_volume_cm3,
        enhancing_volume: rad.enhancing_volume_cm3,
        edema_volume: rad.edema_volume_cm3,
        sphericity: rad.sphericity,
        surface_area: rad.surface_area_cm2,
        date: data.date || '',
        report_id: r.report_id || '',
        treatments: data.treatments || [],
        ai_summary: r.ai_summary || '',
        notes: data.notes || '',
        session_id: data.session_id || '',
        files: data.files || [],
      };
    }
    // fallback: hasta bulunamadı (mock listesi boş)
    return null;
  },

  async updatePatient(patientId, updates) {
    const res = await fetch('/api/patients/' + encodeURIComponent(patientId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ..._authHeaders() },
      body: JSON.stringify(updates),
    });
    if (res.status === 401) _handle401();
    return res.ok;
  },

  async deletePatient(patientId) {
    const res = await fetch('/api/patients/' + encodeURIComponent(patientId), {
      method: 'DELETE',
      headers: _authHeaders(),
    });
    if (res.status === 401) _handle401();
    return res.ok;
  },

  // ─── Treatments ─────────────────────────────────────────

  async addTreatment(patientId, treatment) {
    return await this._post(
      '/api/patients/' + encodeURIComponent(patientId) + '/treatments',
      treatment
    );
  },

  // ─── Dashboard ──────────────────────────────────────────

  async getDashboard() {
    const data = await this._get('/api/dashboard');
    if (data) {
      return {
        totalPatients: data.total_patients,
        analyzed: data.analyzed,
        avgRisk: data.avg_risk,
        avgSurv: data.avg_surv,
        thisMonth: {
          newPatients: data.this_month?.new_patients || 0,
          completedAnalyses: data.this_month?.completed_analyses || 0,
          highRiskAlerts: data.this_month?.high_risk_alerts || 0,
        },
        riskDist: data.risk_dist || {},
        recentPatients: data.recent_patients || [],
        weeklyActivity: data.weekly_activity || [],
        highRiskPatients: data.high_risk_patients || [],
      };
    }
    // fallback — boş hasta listesi (gerçek DB zorunlu)
    return {
      totalPatients: MOCK.cohortStats.total_patients,
      analyzed: MOCK.cohortStats.analyzed,
      avgRisk: MOCK.cohortStats.avg_risk,
      avgSurv: MOCK.cohortStats.avg_surv,
      thisMonth: MOCK.dashboard.thisMonth,
      riskDist: MOCK.cohortStats.risk_dist,
      recentPatients: [],
      weeklyActivity: MOCK.dashboard.weeklyActivity,
      highRiskPatients: [],
    };
  },

  // ─── Cohort Stats ───────────────────────────────────────

  async getCohortStats() {
    const data = await this._get('/api/cohort-stats');
    if (data) return data;
    return MOCK.cohortStats; // fallback
  },

  // ─── Timeline ───────────────────────────────────────────

  async getTimeline(patientId) {
    const data = await this._get('/api/patients/' + encodeURIComponent(patientId) + '/timeline');
    if (data) return data;
    // fallback
    return {
      patient_id: patientId,
      timeline: [],
      volume_data: MOCK.tumorTimeline.data,
    };
  },

  // ─── Analysis ───────────────────────────────────────────

  async uploadFiles(fileList) {
    const form = new FormData();
    for (const f of fileList) form.append('files', f);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: form, headers: _authHeaders() });
      if (res.status === 401) { _handle401(); throw new Error('HTTP 401'); }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (err) {
      console.warn('[GBM-API] Upload fallback:', err.message);
      return null;
    }
  },

  async runAnalysis(payload) {
    const data = await this._post('/api/analyze', payload);
    if (data) return data;
    return null;
  },

  // ─── MRI Slice URL ──────────────────────────────────────

  getSliceUrl(sessionId, filename, axis, index, overlays) {
    let url = `/api/slice/${encodeURIComponent(sessionId)}/${encodeURIComponent(filename)}?axis=${axis}&index=${index}`;
    if (overlays && overlays.length) {
      url += '&overlays=' + overlays.map(f => encodeURIComponent(f)).join(',');
    }
    // <img src> Authorization header gönderemez → token query param ile geçir
    const t = _getToken();
    if (t) url += '&token=' + encodeURIComponent(t);
    return url;
  },

  // ─── CSV ────────────────────────────────────────────────

  async importCSV(file) {
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/import-csv', {
        method: 'POST', body: form, headers: _authHeaders(),
      });
      if (res.status === 401) { _handle401(); throw new Error('HTTP 401'); }
      return await res.json();
    } catch (err) {
      return { imported: 0, updated: 0, errors: [err.message] };
    }
  },

  csvTemplateUrl() {
    const t = _getToken();
    return '/api/csv-template' + (t ? '?token=' + encodeURIComponent(t) : '');
  },

  reportPdfUrl(patientId) {
    const t = _getToken();
    return `/api/patients/${encodeURIComponent(patientId)}/report.pdf` +
           (t ? '?token=' + encodeURIComponent(t) : '');
  },

  // ─── RANO follow-up ─────────────────────────────────────
  async getRano(patientId) {
    return await this._get('/api/patients/' + encodeURIComponent(patientId) + '/rano');
  },

  // ─── Bilim / yayın ──────────────────────────────────────
  async getCohortKM(params) {
    const qs = new URLSearchParams(Object.entries(params || {})
      .filter(([_, v]) => v != null && v !== '')).toString();
    return await this._get('/api/cohort/km' + (qs ? '?' + qs : ''));
  },
  async getCalibration() {
    return await this._get('/api/calibration');
  },
  async getModelCard() {
    return await this._get('/api/model-card');
  },
  async getSciencePerformance() {
    return await this._get('/api/science/performance');
  },
  async getScienceROC() {
    return await this._get('/api/science/roc');
  },
  async getScienceFeatureEffects() {
    return await this._get('/api/science/feature-effects');
  },

  // ─── Case notes ─────────────────────────────────────────
  async listNotes(patientId) {
    return await this._get('/api/patients/' + encodeURIComponent(patientId) + '/notes');
  },
  async addNote(patientId, body) {
    return await this._post(
      '/api/patients/' + encodeURIComponent(patientId) + '/notes', { body });
  },
  async deleteNote(patientId, noteId) {
    const res = await fetch(
      `/api/patients/${encodeURIComponent(patientId)}/notes/${noteId}`,
      { method: 'DELETE', headers: _authHeaders() });
    if (res.status === 401) _handle401();
    return res.ok;
  },

  exportCSVUrl: '/api/export-csv',

  // ─── Lumiere ────────────────────────────────────────────

  async getLumierePatients() {
    const data = await this._get('/api/lumiere-patients');
    return data?.patients || [];
  },

  async getLumiereFiles(patientId, timepoint) {
    let url = '/api/lumiere-files/' + encodeURIComponent(patientId);
    if (timepoint) url += '?timepoint=' + encodeURIComponent(timepoint);
    return await this._get(url);
  },
};

window.GBM_API = GBM_API;
