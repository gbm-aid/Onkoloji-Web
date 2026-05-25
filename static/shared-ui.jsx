/* shared-ui.jsx — Modals and shared UI primitives */

/* ── CTCAE v5 yan etki terim listesi (sık kullanılan) ── */
const CTCAE_TERMS = [
  'Bulantı', 'Kusma', 'Lökopeni', 'Nötropeni', 'Trombositopeni',
  'Anemi', 'Yorgunluk', 'Halsizlik', 'Baş ağrısı', 'Konvülziyon',
  'Diare', 'Konstipasyon', 'Karaciğer enzim yüksekliği', 'Hipertansiyon',
  'Proteinüri', 'Cilt döküntüsü', 'Hipersensitivite', 'Trombotik olay',
  'Yara iyileşme bozukluğu', 'Stomatit', 'Saç dökülmesi', 'Diğer',
];
const CTCAE_GRADES = [
  { v: 1, label: 'G1 · Hafif', color: '#65a30d' },
  { v: 2, label: 'G2 · Orta', color: '#ca8a04' },
  { v: 3, label: 'G3 · Şiddetli', color: '#ea580c' },
  { v: 4, label: 'G4 · Hayatı tehdit', color: '#dc2626' },
  { v: 5, label: 'G5 · Ölüm', color: '#7f1d1d' },
];

/* ── Treatment Modal ─────────────────────────────────── */
function TreatmentModal({ patientId, onClose, onSave }) {
  const [drug, setDrug] = React.useState('');
  const [drugOther, setDrugOther] = React.useState('');
  const [startDate, setStartDate] = React.useState('');
  const [endDate, setEndDate] = React.useState('');
  const [dosage, setDosage] = React.useState('');
  const [response, setResponse] = React.useState('');
  const [sideEffects, setSideEffects] = React.useState([]); // [{term, grade}]
  const [newTerm, setNewTerm] = React.useState('');
  const [newGrade, setNewGrade] = React.useState(1);
  const [newTermOther, setNewTermOther] = React.useState('');

  const addSideEffect = () => {
    const term = newTerm === 'Diğer' ? newTermOther.trim() : newTerm;
    if (!term) return;
    setSideEffects(prev => [...prev, { term, grade: newGrade }]);
    setNewTerm(''); setNewGrade(1); setNewTermOther('');
  };
  const removeSideEffect = (idx) => setSideEffects(prev => prev.filter((_, i) => i !== idx));

  const handleSave = () => {
    const drugName = drug === 'Diger' ? drugOther : drug;
    if (!drugName || !startDate) return;
    onSave({
      drug_name: drugName, start_date: startDate, end_date: endDate || null,
      dosage: dosage || null, response: response || null,
      ctcae: sideEffects.length ? sideEffects : null,
    });
  };

  const drugs = ['Temozolomid (TMZ)', 'Radyoterapi 60Gy', 'Stupp Protokolü (RT+TMZ)', 'Bevacizumab', 'Lomustine (CCNU)', 'Cerrahi Rezeksiyon', 'Diger'];

  return React.createElement('div', { className: 'modal-overlay', onClick: e => { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'modal-box' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('div', { style: { fontSize: 14, fontWeight: 700 } }, 'Tedavi Kaydı Ekle'),
        React.createElement('button', { className: 'modal-close', onClick: onClose }, '×')
      ),
      React.createElement('div', { className: 'modal-body' },
        React.createElement('div', { style: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)', padding: '6px 10px', background: 'var(--bg)', borderRadius: 4 } }, 'Hasta: ' + patientId),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'İlaç / Tedavi *'),
          React.createElement('select', { className: 'form-select', value: drug, onChange: e => setDrug(e.target.value) },
            React.createElement('option', { value: '' }, 'Seçin'), drugs.map(d => React.createElement('option', { key: d, value: d }, d))
          )
        ),
        drug === 'Diger' && React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Tedavi Adı'),
          React.createElement('input', { className: 'form-input', value: drugOther, onChange: e => setDrugOther(e.target.value) })
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Başlangıç Tarihi *'),
            React.createElement('input', { type: 'date', className: 'form-input', value: startDate, onChange: e => setStartDate(e.target.value) })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Bitiş Tarihi'),
            React.createElement('input', { type: 'date', className: 'form-input', value: endDate, onChange: e => setEndDate(e.target.value) })
          )
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Doz / Protokol'),
          React.createElement('input', { className: 'form-input', value: dosage, onChange: e => setDosage(e.target.value), placeholder: 'Örn: 150 mg/m², 60Gy/30fr' })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Tedavi Yanıtı'),
          React.createElement('select', { className: 'form-select', value: response, onChange: e => setResponse(e.target.value) },
            React.createElement('option', { value: '' }, 'Bilinmiyor'),
            React.createElement('option', { value: 'complete' }, 'Tam Yanıt (CR)'),
            React.createElement('option', { value: 'partial' }, 'Parsiyel Yanıt (PR)'),
            React.createElement('option', { value: 'stable' }, 'Stabil Hastalık (SD)'),
            React.createElement('option', { value: 'progression' }, 'Progresyon (PD)')
          )
        ),
        // CTCAE v5 yan etki bölümü
        React.createElement('div', { className: 'form-group', style: { borderTop: '1px solid var(--border-light)', paddingTop: 14, marginTop: 10 } },
          React.createElement('label', { className: 'form-label', style: { display: 'flex', alignItems: 'center', gap: 8 } },
            React.createElement('span', null, 'Yan Etkiler'),
            React.createElement('span', { style: { fontSize: 10, fontWeight: 600, padding: '2px 6px', background: 'var(--surface-tint)', borderRadius: 4, color: 'var(--text-muted)' } }, 'CTCAE v5')
          ),
          // Mevcut yan etki çipleri
          sideEffects.length > 0 && React.createElement('div', {
            style: { display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }
          },
            sideEffects.map((se, i) => {
              const cg = CTCAE_GRADES.find(g => g.v === se.grade) || CTCAE_GRADES[0];
              return React.createElement('span', { key: i,
                style: { display: 'inline-flex', alignItems: 'center', gap: 6,
                         padding: '4px 8px 4px 10px', background: cg.color + '22',
                         color: cg.color, borderRadius: 12, fontSize: 12, fontWeight: 600 }
              },
                se.term, ' · G', se.grade,
                React.createElement('button', {
                  onClick: () => removeSideEffect(i),
                  style: { background: 'transparent', border: 'none', color: 'inherit',
                           cursor: 'pointer', fontSize: 13, padding: 0, marginLeft: 2 }
                }, '×')
              );
            })
          ),
          // Ekleme satırı
          React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1.5fr 1.2fr auto', gap: 6 } },
            React.createElement('select', {
              className: 'form-select', value: newTerm, onChange: e => setNewTerm(e.target.value)
            },
              React.createElement('option', { value: '' }, 'Yan etki seçin...'),
              CTCAE_TERMS.map(t => React.createElement('option', { key: t, value: t }, t))
            ),
            React.createElement('select', {
              className: 'form-select', value: newGrade, onChange: e => setNewGrade(parseInt(e.target.value))
            },
              CTCAE_GRADES.map(g => React.createElement('option', { key: g.v, value: g.v }, g.label))
            ),
            React.createElement('button', {
              className: 'btn btn-outline btn-sm', onClick: addSideEffect,
              disabled: !newTerm || (newTerm === 'Diğer' && !newTermOther.trim()),
              style: { whiteSpace: 'nowrap' },
            }, '+ Ekle')
          ),
          newTerm === 'Diğer' && React.createElement('input', {
            className: 'form-input', style: { marginTop: 6 },
            value: newTermOther, onChange: e => setNewTermOther(e.target.value),
            placeholder: 'Yan etki adını yazın',
          })
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10, justifyContent: 'flex-end' } },
          React.createElement('button', { className: 'btn btn-outline', onClick: onClose }, 'İptal'),
          React.createElement('button', { className: 'btn btn-green', onClick: handleSave }, 'Kaydet')
        )
      )
    )
  );
}

/* ── Edit Patient Modal ──────────────────────────────── */
function EditPatientModal({ patient, onClose, onSave }) {
  const c = patient || {};
  const [age, setAge] = React.useState(c.age || '');
  const [gender, setGender] = React.useState(c.gender || '');
  const [kps, setKps] = React.useState(c.kps_score || '');
  const [diagDate, setDiagDate] = React.useState(c.diagnosis_date || '');
  const [tumorLoc, setTumorLoc] = React.useState(c.tumor_location || '');
  const [surgType, setSurgType] = React.useState(c.surgery_type || '');
  const [mgmt, setMgmt] = React.useState(c.mgmt_status || 'unknown');
  const [idh1, setIdh1] = React.useState(c.idh1_status || 'unknown');
  const [notes, setNotes] = React.useState(c.notes || '');

  const handleSave = () => {
    onSave({ age: age ? parseInt(age) : null, gender: gender || null, kps_score: kps ? parseInt(kps) : null, diagnosis_date: diagDate || null, tumor_location: tumorLoc || null, surgery_type: surgType || null, mgmt_status: mgmt, idh1_status: idh1, notes: notes || null });
  };

  const selField = (label, value, onChange, options) =>
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-label' }, label),
      React.createElement('select', { className: 'form-select', value, onChange: e => onChange(e.target.value) },
        options.map(([v, l]) => React.createElement('option', { key: v, value: v }, l))
      )
    );

  return React.createElement('div', { className: 'modal-overlay', onClick: e => { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'modal-box', style: { width: 560 } },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('div', { style: { fontSize: 14, fontWeight: 700 } }, 'Hasta Bilgilerini Düzenle'),
        React.createElement('button', { className: 'modal-close', onClick: onClose }, '×')
      ),
      React.createElement('div', { className: 'modal-body' },
        React.createElement('div', { style: { fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--mono)', padding: '6px 10px', background: 'var(--bg)', borderRadius: 4 } }, 'Hasta: ' + c.patient_id),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Yaş'),
            React.createElement('input', { type: 'number', className: 'form-input', value: age, onChange: e => setAge(e.target.value), min: 0, max: 120 })
          ),
          selField('Cinsiyet', gender, setGender, [['', 'Seçin'], ['M', 'Erkek'], ['F', 'Kadın']])
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
          selField('KPS Skoru', kps, setKps, [['', 'Seçin'], ...['100','90','80','70','60','50','40','30'].map(v => [v, v])]),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', { className: 'form-label' }, 'Tanı Tarihi'),
            React.createElement('input', { type: 'date', className: 'form-input', value: diagDate, onChange: e => setDiagDate(e.target.value) })
          )
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
          selField('Tümör Lokalizasyonu', tumorLoc, setTumorLoc, [['', 'Seçin'], ['frontal', 'Frontal Lob'], ['temporal', 'Temporal Lob'], ['parietal', 'Parietal Lob'], ['occipital', 'Oksipital Lob'], ['insular', 'İnsula'], ['multifocal', 'Multifokal']]),
          selField('Cerrahi Tipi', surgType, setSurgType, [['', 'Seçin'], ['GTR', 'GTR (Gross Total Rezeksiyon)'], ['STR', 'STR (Subtotal Rezeksiyon)'], ['biopsy', 'Sadece Biyopsi'], ['none', 'Cerrahi Yok']])
        ),
        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 } },
          selField('MGMT', mgmt, setMgmt, [['unknown', 'Bilinmiyor'], ['methylated', 'Metile'], ['unmethylated', 'Metile Değil']]),
          selField('IDH1', idh1, setIdh1, [['unknown', 'Bilinmiyor'], ['mutant', 'Mutant'], ['wildtype', 'Wildtype']])
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Notlar'),
          React.createElement('input', { className: 'form-input', value: notes, onChange: e => setNotes(e.target.value), placeholder: 'Klinik notlar...' })
        ),
        React.createElement('div', { style: { display: 'flex', gap: 10, justifyContent: 'flex-end' } },
          React.createElement('button', { className: 'btn btn-outline', onClick: onClose }, 'İptal'),
          React.createElement('button', { className: 'btn btn-green', onClick: handleSave }, 'Kaydet')
        )
      )
    )
  );
}

/* ── Legacy Projection Chart (kept for compatibility) ─── */
function ProjectionChart({ projection, baseVolume }) {
  if (!projection || !projection.length) return null;
  const maxVol = Math.max(...projection.map(p => p.volume_cm3));
  return React.createElement('div', null,
    React.createElement('div', { style: { fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 } },
      'Başlangıç hacmi: ', React.createElement('strong', null, baseVolume.toFixed(1) + ' cm³')),
    React.createElement('div', { style: { display: 'flex', alignItems: 'flex-end', gap: 10, height: 130, paddingBottom: 4, borderBottom: '1px solid var(--border-light)' } },
      projection.map((p, i) => {
        const pct = (p.volume_cm3 / maxVol) * 100;
        const color = p.change_pct < 25 ? 'var(--green)' : p.change_pct < 50 ? 'var(--yellow)' : 'var(--red)';
        return React.createElement('div', { key: i, style: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 } },
          React.createElement('span', { style: { fontSize: 10, fontWeight: 600 } }, p.volume_cm3.toFixed(0)),
          React.createElement('div', { style: { width: '100%', height: pct + '%', background: color, borderRadius: '4px 4px 0 0', minHeight: 4, transition: 'height .4s' } }),
          React.createElement('span', { style: { fontSize: 10, color: 'var(--text-muted)' } }, p.week + 'h'),
          React.createElement('span', { style: { fontSize: 9, fontWeight: 700, color } }, p.rano)
        );
      })
    ),
    React.createElement('div', { style: { fontSize: 11, color: 'var(--text-faint)', marginTop: 6 } },
      'RANO kriterleri ile 6 aylık hacim projeksiyonu')
  );
}

/* ── Stat Bar Chart (kept) ───────────────────────────── */
function StatBarChart({ data, colorMap, labelMap }) {
  const entries = Object.entries(data || {}).filter(([, v]) => v > 0);
  if (!entries.length) return React.createElement('div', { className: 'empty', style: { padding: '24px 0' } },
    React.createElement('p', null, 'Henüz veri yok'));
  entries.sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return React.createElement('div', null, entries.map(([label, count]) => {
    const pct = Math.round(count / total * 100);
    const color = (colorMap && colorMap[label]) || 'var(--accent)';
    const displayLabel = (labelMap && labelMap[label]) || label;
    return React.createElement('div', { key: label, className: 'stat-bar-group' },
      React.createElement('div', { className: 'stat-bar-header' },
        React.createElement('span', { style: { fontWeight: 600 } }, displayLabel),
        React.createElement('span', { style: { color: 'var(--text-muted)' } }, `${count} hasta · %${pct}`)
      ),
      React.createElement('div', { className: 'stat-bar-track' },
        React.createElement('div', { className: 'stat-bar-fill', style: { width: `${pct}%`, background: color } })
      )
    );
  }));
}

window.TreatmentModal = TreatmentModal;
window.EditPatientModal = EditPatientModal;
window.ProjectionChart = ProjectionChart;
window.StatBarChart = StatBarChart;
