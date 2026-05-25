/* app.jsx — Main App with API integration + mock fallback */

const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "showStepper": true,
  "density": "comfortable",
  "accent": "#0d9488"
}/*EDITMODE-END*/;

/* ── Login Modal ─────────────────────────────────────── */
function LoginModal({ onLogin }) {
  const [username, setUsername] = React.useState('admin');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await GBM_API.login(username.trim(), password);
    setBusy(false);
    if (r.ok) onLogin(r.user);
    else setErr(r.error || 'Giriş başarısız');
  };

  return React.createElement('div', {
    style: {
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)',
      zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--font)'
    }
  },
    React.createElement('form', {
      onSubmit: submit,
      style: {
        background: 'white', borderRadius: 12, padding: '32px 36px',
        width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', gap: 16
      }
    },
      React.createElement('div', { style: { textAlign: 'center', marginBottom: 8 } },
        React.createElement('div', {
          style: { width: 48, height: 48, background: 'var(--accent)',
                   color: 'white', borderRadius: 12, display: 'inline-flex',
                   alignItems: 'center', justifyContent: 'center',
                   fontWeight: 800, fontSize: 18, marginBottom: 12 }
        }, 'GA'),
        React.createElement('div', { style: { fontSize: 18, fontWeight: 700 } }, 'GBM-AID Giriş'),
        React.createElement('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginTop: 4 } },
          'Hekim Paneli — Klinik Karar Destek')
      ),
      React.createElement('div', null,
        React.createElement('label', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Kullanıcı Adı'),
        React.createElement('input', {
          type: 'text', value: username, onChange: e => setUsername(e.target.value),
          autoFocus: true, required: true,
          style: { width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14,
                   border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'var(--mono)' }
        })
      ),
      React.createElement('div', null,
        React.createElement('label', { style: { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 } }, 'Parola'),
        React.createElement('input', {
          type: 'password', value: password, onChange: e => setPassword(e.target.value),
          required: true,
          style: { width: '100%', marginTop: 4, padding: '10px 12px', fontSize: 14,
                   border: '1px solid var(--border)', borderRadius: 6 }
        })
      ),
      err && React.createElement('div', {
        style: { background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
                 padding: '8px 12px', borderRadius: 6, fontSize: 12.5 }
      }, '⚠ ' + err),
      React.createElement('button', {
        type: 'submit', disabled: busy,
        style: { background: 'var(--accent)', color: 'white', border: 'none',
                 padding: '11px', borderRadius: 6, fontSize: 14, fontWeight: 700,
                 cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 }
      }, busy ? 'Giriş yapılıyor...' : 'Giriş Yap'),
      React.createElement('div', {
        style: { fontSize: 11, color: 'var(--text-muted)', textAlign: 'center',
                 borderTop: '1px solid var(--border-light)', paddingTop: 10 }
      }, 'Demo: ', React.createElement('code', null, 'admin/admin'), ' veya ',
         React.createElement('code', null, 'dr.demo/demo123'))
    )
  );
}

function App() {
  const [page, setPage] = React.useState('dashboard');
  const [patients, setPatients] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedReportPatient, setSelectedReportPatient] = React.useState('');
  const [treatmentModal, setTreatmentModal] = React.useState(null);
  const [editModal, setEditModal] = React.useState(null);
  const [comparePreselect, setComparePreselect] = React.useState(null);
  const [fallbackActive, setFallbackActive] = React.useState(false);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [authChecked, setAuthChecked] = React.useState(false);
  const [tweaks, setTweak] = useTweaks(TWEAKS_DEFAULTS);

  // API fallback bayrağı — api-client.js emit ediyor
  React.useEffect(() => {
    const onFb = () => setFallbackActive(true);
    const onAuthReq = () => { setCurrentUser(null); setAuthChecked(true); };
    window.addEventListener('gbm-fallback', onFb);
    window.addEventListener('gbm-auth-required', onAuthReq);
    return () => {
      window.removeEventListener('gbm-fallback', onFb);
      window.removeEventListener('gbm-auth-required', onAuthReq);
    };
  }, []);

  // Auth check on mount
  React.useEffect(() => {
    (async () => {
      if (GBM_API.isAuthenticated()) {
        const me = await GBM_API.getMe();
        if (me) setCurrentUser(me);
      }
      setAuthChecked(true);
    })();
  }, []);

  // Load patients only after auth is confirmed
  React.useEffect(() => {
    if (currentUser) loadPatients();
    else setPatients([]);
  }, [currentUser]);

  const _patientsCacheRef = React.useRef({ at: 0, force: false });
  const loadPatients = async (force = false) => {
    const now = Date.now();
    const fresh = !force && (now - _patientsCacheRef.current.at < 30000) && patients.length > 0;
    if (fresh) return;
    setLoading(true);
    const data = await GBM_API.getPatients();
    setPatients(data);
    _patientsCacheRef.current.at = now;
    setLoading(false);
  };

  const handleLogout = async () => {
    await GBM_API.logout();
    setCurrentUser(null);
    setPage('dashboard');
  };

  // Apply accent color
  React.useEffect(() => {
    if (tweaks.accent) document.documentElement.style.setProperty('--accent', tweaks.accent);
  }, [tweaks.accent]);

  // Apply density
  React.useEffect(() => {
    document.body.dataset.density = tweaks.density || 'comfortable';
  }, [tweaks.density]);

  const pageLabels = {
    dashboard: 'Ana Sayfa', analysis: 'Analiz', records: 'Hasta Kayıtları',
    compare: 'Hasta Karşılaştır', database: 'Kohort İstatistikleri',
    reports: 'Raporlar', science: 'Bilim & Doğrulama', help: 'Yardım'
  };
  const pageTitles = {
    dashboard: 'Genel Bakış', analysis: 'Yeni Analiz Başlat',
    records: 'Hasta Kayıtları', compare: 'Hasta Karşılaştırma',
    database: 'Kohort Analizi', reports: 'Detaylı Hasta Raporu',
    science: 'Bilim & Model Doğrulama', help: 'Yardım'
  };
  const navItems = [
    { id: 'dashboard', label: 'Ana Sayfa' },
    { id: 'analysis', label: 'Analiz' },
    { id: 'records', label: 'Kayıtlar' },
    { id: 'compare', label: 'Karşılaştır' },
    { id: 'database', label: 'Kohort' },
    { id: 'reports', label: 'Raporlar' },
    { id: 'science', label: 'Bilim' },
    { id: 'help', label: 'Yardım' },
  ];

  const switchPage = (id) => {
    setPage(id);
    if (id === 'records' || id === 'dashboard') loadPatients();
  };
  const viewReport = (pid) => { setSelectedReportPatient(pid); setPage('reports'); };
  const handleCompareSelected = (pids) => { setComparePreselect(pids); setPage('compare'); };

  const handleDeletePatient = async (pid) => {
    if (!confirm(pid + ' kaydını silmek istediğinize emin misiniz?')) return;
    const ok = await GBM_API.deletePatient(pid);
    if (ok) setPatients(prev => prev.filter(p => p.patient_id !== pid));
    else alert('Silme başarısız');
  };

  const handleSaveTreatment = async (treatment) => {
    const result = await GBM_API.addTreatment(treatmentModal, treatment);
    if (result) {
      setPatients(prev => prev.map(p => p.patient_id === treatmentModal
        ? { ...p, treatments: [...(p.treatments || []), treatment] } : p));
      // CSV/analyze/delete sonrasında listeyi tazele
      loadPatients(true);
    }
    setTreatmentModal(null);
  };

  const handleSaveEdit = async (updates) => {
    if (!editModal) return;
    const ok = await GBM_API.updatePatient(editModal.patient_id, updates);
    if (ok) {
      setPatients(prev => prev.map(p => p.patient_id === editModal.patient_id ? { ...p, ...updates } : p));
    }
    setEditModal(null);
  };

  // Page content
  let pageContent;
  switch (page) {
    case 'dashboard':
      pageContent = React.createElement(DashboardPage, { patients, onNavigate: switchPage, onViewReport: viewReport });
      break;
    case 'analysis':
      pageContent = React.createElement(AnalysisPage, { onViewReport: viewReport });
      break;
    case 'records':
      pageContent = React.createElement('div', { className: 'container' },
        React.createElement(RecordsPage, {
          patients, onViewReport: viewReport,
          onEditPatient: p => setEditModal(p),
          onAddTreatment: pid => setTreatmentModal(pid),
          onDeletePatient: handleDeletePatient,
          onCompareSelected: handleCompareSelected,
          onReloadPatients: loadPatients,
        })
      );
      break;
    case 'compare':
      pageContent = React.createElement(ComparePage, { patients, onViewReport: viewReport, preselectedIds: comparePreselect });
      break;
    case 'reports':
      pageContent = React.createElement('div', { className: 'container' },
        React.createElement(ReportsPage, {
          patients, selectedPatientId: selectedReportPatient,
          onSelectPatient: setSelectedReportPatient,
          onEditPatient: p => setEditModal(p),
          onAddTreatment: pid => setTreatmentModal(pid)
        })
      );
      break;
    case 'database':
      pageContent = React.createElement('div', { className: 'container' }, React.createElement(CohortPage, null));
      break;
    case 'science':
      pageContent = React.createElement('div', { className: 'container' }, React.createElement(SciencePage, null));
      break;
    case 'help':
      pageContent = React.createElement('div', { className: 'container' }, React.createElement(HelpPage, null));
      break;
    default:
      pageContent = null;
  }

  // Auth henüz kontrol edilmediyse loading
  if (!authChecked) {
    return React.createElement('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }
    }, 'Yükleniyor...');
  }

  // Kullanıcı yoksa login modal'ı göster
  if (!currentUser) {
    return React.createElement(LoginModal, { onLogin: (u) => setCurrentUser(u) });
  }

  return React.createElement('div', { id: 'app-root' },
    // Backend fallback uyarı banner'ı
    fallbackActive && React.createElement('div', {
      style: {
        background: '#fef3c7', borderBottom: '1px solid #fbbf24',
        color: '#92400e', padding: '8px 20px', fontSize: 12.5,
        fontWeight: 600, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12
      }
    },
      React.createElement('span', null,
        '⚠ Backend bağlantısı yok veya bir endpoint başarısız oldu. ' +
        'Bazı bölümler boş veya örnek veri gösterebilir. Sunucuyu başlatın: python main.py'),
      React.createElement('button', {
        onClick: () => setFallbackActive(false),
        style: { background: 'transparent', border: 'none', color: '#92400e',
                 fontSize: 16, cursor: 'pointer', fontWeight: 700 }
      }, '×')
    ),
    // Top bar
    React.createElement('header', { className: 'topbar' },
      React.createElement('div', { className: 'topbar-brand' },
        React.createElement('div', { className: 'topbar-logo' }, 'GA'),
        React.createElement('span', null, 'GBM-AID'),
        React.createElement('span', { className: 'topbar-sub' }, 'Hekim Paneli')
      ),
      React.createElement('nav', { className: 'topbar-nav' },
        navItems.map(item =>
          React.createElement('button', {
            key: item.id,
            className: page === item.id ? 'active' : '',
            onClick: () => switchPage(item.id)
          }, item.label)
        )
      ),
      // Kullanıcı menüsü
      React.createElement('div', {
        style: { display: 'flex', alignItems: 'center', gap: 10, marginLeft: 14, paddingLeft: 14, borderLeft: '1px solid rgba(255,255,255,0.15)' }
      },
        React.createElement('div', { style: { textAlign: 'right', lineHeight: 1.2 } },
          React.createElement('div', { style: { fontSize: 12.5, fontWeight: 600, color: 'white' } },
            currentUser.full_name || currentUser.username),
          React.createElement('div', { style: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.4 } },
            currentUser.role)
        ),
        React.createElement('button', {
          onClick: handleLogout,
          title: 'Çıkış yap',
          style: { background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.3)',
                   borderRadius: 6, padding: '6px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }
        }, 'Çıkış')
      )
    ),

    // Page header
    page !== 'dashboard' && React.createElement('div', { className: 'page-header' },
      React.createElement('div', null,
        React.createElement('div', { className: 'breadcrumb' },
          React.createElement('a', { onClick: () => switchPage('dashboard') }, 'Ana Sayfa'),
          React.createElement('span', { className: 'sep' }, '/'),
          React.createElement('span', null, pageLabels[page])
        ),
        React.createElement('div', { className: 'page-title' }, pageTitles[page])
      ),
      React.createElement('div', { className: 'page-meta' },
        React.createElement('span', { className: 'version-badge' }, 'v5.0.0')
      )
    ),

    // Loading overlay
    loading && patients.length === 0 && React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: 14 }
    },
      React.createElement('div', { style: { width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' } }),
      React.createElement('div', { style: { fontSize: 14, color: 'var(--text-secondary)' } }, 'Veriler yükleniyor...')
    ),

    // Page content
    (!loading || patients.length > 0) && pageContent,

    // Disclaimer
    React.createElement('div', { className: 'disclaimer' },
      React.createElement('strong', null, 'Uyarı: '),
      'Bu sistem klinik karar destek aracıdır. Nihai tanı ve tedavi kararı yetkili sağlık profesyoneline aittir.'
    ),

    React.createElement('footer', { className: 'footer' },
      'GBM-AID Klinik Karar Destek Sistemi v5.0  ·  Glioblastoma Multiforme  ·  SQLite DB'
    ),

    // Modals
    treatmentModal && React.createElement(TreatmentModal, {
      patientId: treatmentModal,
      onClose: () => setTreatmentModal(null),
      onSave: handleSaveTreatment
    }),
    editModal && React.createElement(EditPatientModal, {
      patient: editModal,
      onClose: () => setEditModal(null),
      onSave: handleSaveEdit
    }),

    // Tweaks panel
    React.createElement(TweaksPanel, { title: 'Tweaks · GBM-AID' },
      React.createElement(TweakSection, { label: 'Görünüm' },
        React.createElement(TweakColor, {
          label: 'Vurgu Rengi',
          value: tweaks.accent,
          onChange: v => setTweak('accent', v),
          options: ['#0d9488', '#0891b2', '#2563eb', '#7c3aed', '#be185d']
        }),
        React.createElement(TweakRadio, {
          label: 'Yoğunluk',
          value: tweaks.density,
          onChange: v => setTweak('density', v),
          options: ['compact', 'comfortable']
        })
      )
    )
  );
}

const rootEl = document.getElementById('root');
const root = ReactDOM.createRoot(rootEl);
root.render(React.createElement(App));
