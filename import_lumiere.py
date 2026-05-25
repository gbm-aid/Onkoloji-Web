"""
LUMIERE dataset importer — reads 6 CSV files, imports into GBM-AID SQLite DB.
Handles: clinical data, RANO follow-up, MR acquisition info, data completeness,
         PyRadiomics features (baseline + all timepoints → TumorEvent).
"""

import csv
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from database import SessionLocal, init_db
from models import Patient, Analysis, Treatment, TumorEvent

LUMIERE_DIR = r"C:\Users\merte\Desktop\Lumiere"
FILE_DEMO   = os.path.join(LUMIERE_DIR, "LUMIERE-Demographics_Pathology.csv")
FILE_RANO   = os.path.join(LUMIERE_DIR, "LUMIERE-ExpertRating-v202211.csv")
FILE_MRINFO = os.path.join(LUMIERE_DIR, "LUMIERE-MRinfo.csv")
FILE_COMPL  = os.path.join(LUMIERE_DIR, "LUMIERE-datacompleteness.csv")
FILE_RAD3   = os.path.join(LUMIERE_DIR, "LUMIERE-pyradiomics-deepbratumia-features.csv")
FILE_RAD4   = os.path.join(LUMIERE_DIR, "LUMIERE-pyradiomics-hdglioauto-features.csv")

COL_RATING = (
    "Rating (according to RANO, PD: Progressive disease, SD: Stable disease, "
    "PR: Partial response, CR: Complete response, Pre-Op: Pre-Operative, Post-Op: Post-Operative)"
)
COL_RATIONALE = (
    "Rating rationale (CRET: complete resection of the enhancing tumor, "
    "PRET: partial resection of the enhancing tumor, T2-Progr.: T2-Progression, L: Lesion)"
)


# ── Parsers ────────────────────────────────────────────────────────────────

def parse_idh(raw):
    if not raw or raw.strip().lower() == "na":
        return "unknown"
    low = raw.strip().lower()
    if low in ("wt", "wild type"):
        return "wildtype"
    if "mut" in low or "r132h" in low:
        return "mutant"
    return "unknown"


def parse_mgmt(raw):
    if not raw or raw.strip().lower() == "na":
        return "unknown"
    low = raw.strip().lower()
    if low == "methylated":
        return "methylated"
    if "not" in low:
        return "unmethylated"
    return "unknown"


def parse_gender(raw):
    if not raw:
        return None
    low = raw.strip().lower()
    if low in ("female", "f"):
        return "F"
    if low in ("male", "m"):
        return "M"
    return None


def parse_survival_weeks(raw):
    if not raw or raw.strip().lower() == "na":
        return None
    try:
        return int(float(raw.strip()) * 7)
    except ValueError:
        return None


def parse_field_strength(raw):
    try:
        fs = float(str(raw).strip())
        return "3T" if fs >= 2.5 else ("1.5T" if fs >= 1.0 else None)
    except (ValueError, TypeError):
        return None


def week_to_int(tp_str):
    """'week-044' → 44, 'week-000-2' → 0, 'week-000-1' → 0"""
    m = re.search(r"week-(\d+)", tp_str)
    return int(m.group(1)) if m else -1


# ── RANO processing ────────────────────────────────────────────────────────

def extract_treatments_from_rano(patient_rows):
    surgeries, surgery_types = 0, []
    has_avastin = has_temodal = False
    last_rano = first_pd_week = surgery_type = None

    for row in patient_rows:
        rating    = row.get(COL_RATING, "").strip()
        rationale = row.get(COL_RATIONALE, "").strip()
        date_str  = row.get("Date", "").strip()

        wk = week_to_int(date_str)

        if "Post-Op" in rating:
            surgeries += 1
            if "CRET" in rationale:
                surgery_types.append("CRET")
            elif "PRET" in rationale:
                surgery_types.append("PRET")

        rat_low = rationale.lower()
        if "avastin" in rat_low or "bevacizumab" in rat_low:
            has_avastin = True
        if "temodal" in rat_low or "temozolomide" in rat_low:
            has_temodal = True

        if rating in ("PD", "SD", "PR", "CR"):
            last_rano = rating
            if rating == "PD" and first_pd_week is None:
                first_pd_week = wk

    treatments = []
    if surgeries > 0:
        resection = "CRET" if "CRET" in surgery_types else ("PRET" if surgery_types else "unknown")
        surgery_type = "GTR" if "CRET" in surgery_types else "STR"
        treatments.append({
            "drug_name": "Cerrahi Rezeksiyon",
            "protocol": resection,
            "cycles": surgeries,
            "notes": f"{surgeries}x ameliyat ({', '.join(surgery_types)})",
        })

    treatments.append({"drug_name": "Radyokemoterapi (Stupp)", "protocol": "stupp",
                        "notes": "Standart Stupp protokolu (varsayilan)"})
    if has_avastin:
        treatments.append({"drug_name": "Bevacizumab (Avastin)", "protocol": "bevacizumab",
                            "notes": "RANO verilerinden tespit edildi"})
    if has_temodal:
        treatments.append({"drug_name": "Temozolomide (Temodal)", "protocol": "tmz",
                            "notes": "RANO verilerinden tespit edildi"})

    return treatments, last_rano, first_pd_week, surgery_type


def build_rano_map(patient_rows):
    """Timepoint string → dominant RANO rating for that timepoint."""
    rano_map = {}
    for row in patient_rows:
        tp     = row.get("Date", "").strip()
        rating = row.get(COL_RATING, "").strip()
        if tp and rating:
            # Last rating wins if multiple rows for same tp
            rano_map[tp] = rating
    return rano_map


# ── Radiomics — all timepoints ─────────────────────────────────────────────

def extract_volumes_all_timepoints(patient_id, radiomics_rows):
    """
    Returns dict: { timepoint_str → { necrosis_mm3, enhancing_mm3, edema_mm3,
                                       total_mm3, sphericity } }
    Uses CT1 sequence only (most complete), DeepBraTumIA labels.
    """
    vols = {}  # tp → label → value

    for row in radiomics_rows:
        if row.get("Patient", "").strip() != patient_id:
            continue
        if row.get("Sequence", "").strip() != "CT1":
            continue

        tp    = row.get("Time point", "").strip()
        label = row.get("Label name", "").strip()

        raw_vol  = row.get("original_shape_VoxelVolume", "")
        raw_sph  = row.get("original_shape_Sphericity", "")

        try:
            vol = float(raw_vol) if raw_vol.strip() else 0.0
        except ValueError:
            vol = 0.0

        try:
            sph = float(raw_sph) if raw_sph.strip() else None
        except ValueError:
            sph = None

        if tp not in vols:
            vols[tp] = {}
        vols[tp][label] = {"volume": vol, "sphericity": sph}

    # Aggregate per timepoint
    result = {}
    for tp, labels in vols.items():
        necrosis  = labels.get("Necrosis", {}).get("volume", 0.0) or 0.0
        enhancing = labels.get("Contrast-enhancing", {}).get("volume", 0.0) or 0.0
        edema     = labels.get("Edema", {}).get("volume", 0.0) or 0.0
        total     = necrosis + enhancing + edema

        sph = (labels.get("Contrast-enhancing", {}).get("sphericity")
               or labels.get("Necrosis", {}).get("sphericity"))

        result[tp] = {
            "necrosis_mm3":  necrosis,
            "enhancing_mm3": enhancing,
            "edema_mm3":     edema,
            "total_mm3":     total,
            "sphericity":    sph,
        }

    return result


def extract_baseline_radiomics_features(patient_id, radiomics_rows):
    """Full feature dict for baseline (week-000), for results_json."""
    KEY_FEATURES = {
        "volume":      "original_shape_VoxelVolume",
        "surface":     "original_shape_SurfaceArea",
        "sphericity":  "original_shape_Sphericity",
        "elongation":  "original_shape_Elongation",
        "major_axis":  "original_shape_MajorAxisLength",
        "minor_axis":  "original_shape_MinorAxisLength",
        "mean":        "original_firstorder_Mean",
        "std":         "original_firstorder_RootMeanSquared",
        "entropy":     "original_firstorder_Entropy",
        "skewness":    "original_firstorder_Skewness",
        "kurtosis":    "original_firstorder_Kurtosis",
        "contrast":    "original_glcm_Contrast",
        "correlation": "original_glcm_Correlation",
        "homogeneity": "original_glcm_Idm",
        "energy":      "original_firstorder_Energy",
    }
    baseline = {}
    for row in radiomics_rows:
        if row.get("Patient", "").strip() != patient_id:
            continue
        if "week-000" not in row.get("Time point", ""):
            continue
        label  = row.get("Label name", "")
        seq    = row.get("Sequence", "")
        prefix = f"{seq}_{label}".replace(" ", "_").replace("-", "_").lower()
        for short, col in KEY_FEATURES.items():
            val = row.get(col, "")
            if val and val.strip():
                try:
                    baseline[f"{prefix}_{short}"] = float(val)
                except ValueError:
                    pass
    return baseline


# ── MRinfo + Completeness ──────────────────────────────────────────────────

def extract_mrinfo_baseline(patient_id, mrinfo_rows):
    for row in mrinfo_rows:
        if row.get("Patient", "").strip() != patient_id:
            continue
        if "week-000" not in row.get("Timepoint", ""):
            continue
        if row.get("Sequence", "").strip() != "CT1":
            continue
        fs = parse_field_strength(row.get("Field strength", ""))
        return {
            "field_strength":  fs,
            "manufacturer":    row.get("Manufacturer", "").strip(),
            "model":           row.get("Model", "").strip(),
            "spacing":         row.get("Spacing", "").strip(),
            "slice_thickness": row.get("Slice thickness", "").strip(),
            "voxel_size":      row.get("Voxel size", "").strip(),
            "slice_count":     row.get("Slice count", "").strip(),
        }
    return {}


def extract_completeness(patient_id, compl_rows):
    seqs = set()
    for row in compl_rows:
        if row.get("Patient", "").strip() != patient_id:
            continue
        if "week-000" not in row.get("Timepoint", ""):
            continue
        for col in ["CT1", "T1", "T2", "FLAIR", "DeepBraTumIA", "HD-GLIO-AUTO"]:
            if row.get(col, "").strip().lower() == "x":
                seqs.add(col)
    return list(seqs)


# ── Main ──────────────────────────────────────────────────────────────────

def main():
    init_db()
    db = SessionLocal()

    # 1. Clinical
    print("=== Reading Demographics_Pathology ===")
    clinical = {}
    with open(FILE_DEMO, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            pid = row["Patient"].strip()
            clinical[pid] = {
                "age":               int(row["Age at surgery (years)"]) if row.get("Age at surgery (years)", "").strip() else None,
                "gender":            parse_gender(row.get("Sex")),
                "survival_days":     parse_survival_weeks(row.get("Survival time (weeks)")),
                "idh1_status":       parse_idh(row.get("IDH (WT: wild type)")),
                "mgmt_status":       parse_mgmt(row.get("MGMT qualitative")),
                "mgmt_quantitative": row.get("MGMT quantitative", "").strip(),
                "idh_method":        row.get("IDH method", "").strip(),
            }
    print(f"  {len(clinical)} patients")

    # 2. RANO
    print("=== Reading ExpertRating ===")
    rano_by_patient = {}
    with open(FILE_RANO, encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            pid = row["Patient"].strip()
            rano_by_patient.setdefault(pid, []).append(row)
    print(f"  {len(rano_by_patient)} patients with RANO data")

    # 3. MRinfo
    print("=== Reading MRinfo ===")
    mrinfo_rows = []
    with open(FILE_MRINFO, encoding="utf-8-sig") as f:
        mrinfo_rows = list(csv.DictReader(f))
    print(f"  {len(mrinfo_rows)} rows")

    # 4. Completeness
    print("=== Reading Datacompleteness ===")
    compl_rows = []
    with open(FILE_COMPL, encoding="utf-8-sig") as f:
        compl_rows = list(csv.DictReader(f))
    print(f"  {len(compl_rows)} rows")

    # 5. Radiomics
    print("=== Reading Radiomics DeepBraTumIA ===")
    radiomics3 = []
    with open(FILE_RAD3, encoding="utf-8-sig") as f:
        radiomics3 = list(csv.DictReader(f))
    print(f"  {len(radiomics3)} rows")

    print("=== Reading Radiomics HD-GLIO-AUTO ===")
    radiomics4 = []
    with open(FILE_RAD4, encoding="utf-8-sig") as f:
        radiomics4 = list(csv.DictReader(f))
    print(f"  {len(radiomics4)} rows")

    # 6. Import
    print("\n=== Importing patients ===")
    imported = updated = events_created = 0

    for pid, cdata in clinical.items():
        existing = db.query(Patient).filter(Patient.patient_id == pid).first()

        # Notes
        notes_parts = []
        if cdata["mgmt_quantitative"] and cdata["mgmt_quantitative"] not in ("na", ""):
            notes_parts.append(f"MGMT kantitatif: {cdata['mgmt_quantitative']}")
        if cdata["idh_method"] and cdata["idh_method"] not in ("na", ""):
            notes_parts.append(f"IDH yontemi: {cdata['idh_method']}")
        mrinfo = extract_mrinfo_baseline(pid, mrinfo_rows)
        if mrinfo.get("field_strength"):
            notes_parts.append(f"MR alan gucu: {mrinfo['field_strength']}")
        if mrinfo.get("manufacturer"):
            notes_parts.append(f"MR cihazi: {mrinfo.get('manufacturer','')} {mrinfo.get('model','')}".strip())
        notes_str = "; ".join(notes_parts) if notes_parts else None

        # Treatments + surgery type
        treatments_data, last_rano, first_pd_week, surgery_type = extract_treatments_from_rano(
            rano_by_patient.get(pid, [])
        )

        if existing:
            existing.age               = cdata["age"]
            existing.gender            = cdata["gender"]
            existing.survival_days     = cdata["survival_days"]
            existing.idh1_status       = cdata["idh1_status"]
            existing.mgmt_status       = cdata["mgmt_status"]
            existing.surgery_type      = surgery_type
            existing.treatment_protocol = "stupp"
            existing.dataset_source    = "LUMIERE"
            existing.status            = "deceased" if cdata["survival_days"] else "unknown"
            existing.notes             = notes_str
            updated += 1
            patient = existing
        else:
            patient = Patient(
                patient_id          = pid,
                age                 = cdata["age"],
                gender              = cdata["gender"],
                mgmt_status         = cdata["mgmt_status"],
                idh1_status         = cdata["idh1_status"],
                surgery_type        = surgery_type,
                treatment_protocol  = "stupp",
                survival_days       = cdata["survival_days"],
                status              = "deceased" if cdata["survival_days"] else "unknown",
                dataset_source      = "LUMIERE",
                notes               = notes_str,
            )
            db.add(patient)
            imported += 1

        db.flush()

        # Treatments
        if rano_by_patient.get(pid):
            db.query(Treatment).filter(Treatment.patient_pk == patient.id).delete()
            for t in treatments_data:
                db.add(Treatment(
                    patient_pk = patient.id,
                    drug_name  = t["drug_name"],
                    protocol   = t.get("protocol"),
                    cycles     = t.get("cycles"),
                    notes      = t.get("notes"),
                ))

        # ── Radiomics — tüm timepoint'ler ─────────────────────────────────
        all_vols = extract_volumes_all_timepoints(pid, radiomics3)

        # Baseline: week-000-2 (post-op) tercih edilir, yoksa week-000-1
        baseline_tp = None
        baseline_vol = 0.0
        for candidate in ["week-000-2", "week-000-1"]:
            if candidate in all_vols and all_vols[candidate]["total_mm3"] > 0:
                baseline_tp  = candidate
                baseline_vol = all_vols[candidate]["total_mm3"]
                break

        # Analysis (baseline)
        base_feats = extract_baseline_radiomics_features(pid, radiomics3)
        base_feats4 = extract_baseline_radiomics_features(pid, radiomics4)
        combined = {**base_feats, **{f"hdglio_{k}": v for k, v in base_feats4.items()}}

        base_data = all_vols.get(baseline_tp, {}) if baseline_tp else {}
        total_cm3     = round(base_data.get("total_mm3", 0) / 1000, 2) or None
        enhancing_cm3 = round(base_data.get("enhancing_mm3", 0) / 1000, 2) or None
        necrosis_cm3  = round(base_data.get("necrosis_mm3", 0) / 1000, 2) or None
        edema_cm3     = round(base_data.get("edema_mm3", 0) / 1000, 2) or None
        sph_val       = base_data.get("sphericity")

        rano_history = [
            {"date": r.get("Date", "").strip(), "rating": r.get(COL_RATING, "").strip()}
            for r in rano_by_patient.get(pid, [])
        ]
        avail_seqs = extract_completeness(pid, compl_rows)

        results = {
            "radiomics_feature_count": len(combined),
            "segmentation_methods":    ["DeepBraTumIA", "HD-GLIO-AUTO"],
            "available_sequences":     avail_seqs,
            "mr_info":                 mrinfo,
            "last_rano":               last_rano,
            "first_pd_week":           first_pd_week,
            "baseline_tp":             baseline_tp,
            "baseline_radiomics":      {k: round(v, 6) for k, v in list(combined.items())[:80]},
            "rano_history":            rano_history,
        }

        existing_analysis = db.query(Analysis).filter(Analysis.patient_pk == patient.id).first()
        if existing_analysis:
            existing_analysis.tumor_volume_cm3     = total_cm3
            existing_analysis.core_volume_cm3      = necrosis_cm3
            existing_analysis.enhancing_volume_cm3 = enhancing_cm3
            existing_analysis.edema_volume_cm3     = edema_cm3
            existing_analysis.sphericity           = round(sph_val, 4) if sph_val else None
            existing_analysis.results_json         = json.dumps(results, ensure_ascii=False)
            analysis = existing_analysis
        else:
            analysis = Analysis(
                patient_pk             = patient.id,
                session_id             = "LUMIERE",
                report_id              = f"LUM-{pid.replace('Patient-', '')}",
                tumor_volume_cm3       = total_cm3,
                core_volume_cm3        = necrosis_cm3,
                enhancing_volume_cm3   = enhancing_cm3,
                edema_volume_cm3       = edema_cm3,
                sphericity             = round(sph_val, 4) if sph_val else None,
                results_json           = json.dumps(results, ensure_ascii=False),
            )
            db.add(analysis)
            db.flush()

        # ── TumorEvent — her timepoint ─────────────────────────────────────
        db.query(TumorEvent).filter(TumorEvent.patient_pk == patient.id).delete()

        rano_map = build_rano_map(rano_by_patient.get(pid, []))

        # Sıralı timepoint listesi (haftaya göre)
        sorted_tps = sorted(all_vols.keys(), key=lambda x: (week_to_int(x), x))

        for idx, tp in enumerate(sorted_tps):
            vol_data  = all_vols[tp]
            total_mm3 = vol_data["total_mm3"]
            total_cm3_tp = round(total_mm3 / 1000, 2) if total_mm3 > 0 else None

            # Volume change % — baseline post-op'a göre
            change_pct = None
            if baseline_vol > 0 and total_mm3 > 0 and tp != baseline_tp:
                change_pct = round((total_mm3 - baseline_vol) / baseline_vol * 100, 1)

            # RANO: bu tp veya yakın tp
            rano_rating = rano_map.get(tp)
            if not rano_rating:
                # Aynı hafta numarasında başka bir tp var mı?
                wk = week_to_int(tp)
                for k, v in rano_map.items():
                    if week_to_int(k) == wk:
                        rano_rating = v
                        break

            # Pre-Op/Post-Op → RANO class olarak kullanma
            if rano_rating in ("Pre-Op", "Post-Op") or not rano_rating:
                rano_class = None
            else:
                rano_class = rano_rating

            enhancing_cm3_tp = round(vol_data["enhancing_mm3"] / 1000, 2) if vol_data["enhancing_mm3"] > 0 else None
            sph_tp = round(vol_data["sphericity"], 4) if vol_data.get("sphericity") else None

            notes_tp = f"RANO: {rano_rating}" if rano_rating else None
            if sph_tp:
                notes_tp = (notes_tp + f" | Sphericity: {sph_tp}") if notes_tp else f"Sphericity: {sph_tp}"

            db.add(TumorEvent(
                patient_pk          = patient.id,
                analysis_id         = analysis.id if hasattr(analysis, "id") else None,
                timepoint           = idx,
                tumor_volume_cm3    = total_cm3_tp,
                enhancing_volume_cm3 = enhancing_cm3_tp,
                volume_change_pct   = change_pct,
                rano_class          = rano_class,
                notes               = notes_tp,
            ))
            events_created += 1

    db.commit()

    print(f"\n=== TAMAMLANDI ===")
    print(f"  Yeni hasta:        {imported}")
    print(f"  Guncellenen hasta: {updated}")
    print(f"  TumorEvent kaydi:  {events_created}")

    total   = db.query(Patient).count()
    lumiere = db.query(Patient).filter(Patient.dataset_source == "LUMIERE").count()
    events  = db.query(TumorEvent).count()
    analyses = db.query(Analysis).count()

    print(f"\n=== Veritabani Ozeti ===")
    print(f"  Toplam hasta:      {total}")
    print(f"  LUMIERE hastasi:   {lumiere}")
    print(f"  TumorEvent toplam: {events}")
    print(f"  Analiz kaydi:      {analyses}")

    # Ornek: Patient-001 events
    p001 = db.query(Patient).filter(Patient.patient_id == "Patient-001").first()
    if p001:
        evts = db.query(TumorEvent).filter(TumorEvent.patient_pk == p001.id).order_by(TumorEvent.timepoint).all()
        print(f"\n  Patient-001 TumorEvent ornegi ({len(evts)} kayit):")
        for e in evts:
            print(f"    tp={e.timepoint:2d}  vol={str(e.tumor_volume_cm3):8s} cm3  "
                  f"degisim={str(e.volume_change_pct):8s}%  RANO={e.rano_class or '-':4s}  {e.notes or ''}")

    db.close()


if __name__ == "__main__":
    main()
