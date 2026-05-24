"""
LUMIERE dataset importer — reads 4 CSV files, imports into GBM-AID SQLite DB.
Handles: clinical data, RANO follow-up, PyRadiomics features.
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
from models import Patient, Analysis, Treatment

DATA_DIR = r"C:\Users\merte\Desktop"
FILE1 = os.path.join(DATA_DIR, "girecek1.csv")
FILE2 = os.path.join(DATA_DIR, "girecek2.csv")
FILE3 = os.path.join(DATA_DIR, "girecek3.csv")
FILE4 = os.path.join(DATA_DIR, "girecek4.csv")


def parse_idh(raw):
    if not raw or raw.strip().lower() == "na":
        return "unknown"
    low = raw.strip().lower()
    if low in ("wt", "wild type"):
        return "wildtype"
    if "mut" in low or "r132h" in low:
        return "mutant"
    if "neg" in low or "sequencing" in low:
        return "unknown"
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
    if low == "female":
        return "F"
    if low == "male":
        return "M"
    return None


def parse_survival_weeks(raw):
    if not raw or raw.strip().lower() == "na":
        return None
    try:
        weeks = float(raw.strip())
        return int(weeks * 7)
    except ValueError:
        return None


def extract_treatments_from_rano(patient_rows):
    treatments = []
    surgeries = 0
    has_avastin = False
    has_temodal = False
    last_rano = None
    first_pd_week = None
    surgery_types = []

    for row in patient_rows:
        rating = row.get("Rating (according to RANO, PD: Progressive disease, SD: Stable disease, PR: Partial response, CR: Complete response, Pre-Op: Pre-Operative, Post-Op: Post-Operative)", "").strip()
        rationale = row.get("Rating rationale (CRET: complete resection of the enhancing tumor, PRET: partial resection of the enhancing tumor, T2-Progr.: T2-Progression, L: Lesion)", "").strip()
        date_str = row.get("Date", "").strip()

        week_num = 0
        wk_match = re.search(r"week-(\d+)", date_str)
        if wk_match:
            week_num = int(wk_match.group(1))

        if "Post-Op" in rating:
            surgeries += 1
            if "CRET" in rationale:
                surgery_types.append("CRET")
            elif "PRET" in rationale:
                surgery_types.append("PRET")

        if "Avastin" in rationale or "avastin" in rationale.lower():
            has_avastin = True
        if "Temodal" in rationale or "temodal" in rationale.lower():
            has_temodal = True

        if rating in ("PD", "SD", "PR", "CR"):
            last_rano = rating
            if rating == "PD" and first_pd_week is None:
                first_pd_week = week_num

    if surgeries > 0:
        resection = "CRET" if "CRET" in surgery_types else "PRET" if "PRET" in surgery_types else "unknown"
        treatments.append({
            "drug_name": "Cerrahi Rezeksiyon",
            "protocol": resection,
            "cycles": surgeries,
            "notes": f"{surgeries}x ameliyat ({', '.join(surgery_types)})",
        })

    treatments.append({
        "drug_name": "Radyokemoterapi (Stupp)",
        "protocol": "stupp",
        "notes": "Standart Stupp protokolu (varsayilan)",
    })

    if has_avastin:
        treatments.append({
            "drug_name": "Bevacizumab (Avastin)",
            "protocol": "bevacizumab",
            "notes": "RANO verilerinden tespit edildi",
        })

    if has_temodal:
        treatments.append({
            "drug_name": "Temozolomide (Temodal)",
            "protocol": "tmz",
            "notes": "RANO verilerinden tespit edildi",
        })

    return treatments, last_rano, first_pd_week


def extract_baseline_radiomics(patient_id, radiomics_rows):
    baseline = {}
    for row in radiomics_rows:
        if row["Patient"] != patient_id:
            continue
        tp = row.get("Time point", "")
        if "week-000" not in tp:
            continue

        label_name = row.get("Label name", "")
        seq = row.get("Sequence", "")

        prefix = f"{seq}_{label_name}".replace(" ", "_").replace("-", "_").lower()

        key_features = {
            "volume": "original_shape_VoxelVolume",
            "surface": "original_shape_SurfaceArea",
            "sphericity": "original_shape_Sphericity",
            "elongation": "original_shape_Elongation",
            "mean": "original_firstorder_Mean",
            "std": "original_firstorder_RootMeanSquared",
            "entropy": "original_firstorder_Entropy",
            "skewness": "original_firstorder_Skewness",
            "kurtosis": "original_firstorder_Kurtosis",
            "contrast": "original_glcm_Contrast",
            "correlation": "original_glcm_Correlation",
            "homogeneity": "original_glcm_Idm",
            "energy": "original_firstorder_Energy",
        }

        for short_name, csv_col in key_features.items():
            val = row.get(csv_col, "")
            if val and val.strip():
                try:
                    baseline[f"{prefix}_{short_name}"] = float(val)
                except ValueError:
                    pass

    return baseline


def main():
    init_db()
    db = SessionLocal()

    # --- 1. Read clinical data ---
    print("=== Reading girecek1.csv (clinical) ===")
    clinical = {}
    with open(FILE1, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = row["Patient"].strip()
            clinical[pid] = {
                "age": int(row["Age at surgery (years)"]) if row.get("Age at surgery (years)") else None,
                "gender": parse_gender(row.get("Sex")),
                "survival_days": parse_survival_weeks(row.get("Survival time (weeks)")),
                "idh1_status": parse_idh(row.get("IDH (WT: wild type)")),
                "mgmt_status": parse_mgmt(row.get("MGMT qualitative")),
                "mgmt_quantitative": row.get("MGMT quantitative", "").strip(),
                "idh_method": row.get("IDH method", "").strip(),
            }
    print(f"  {len(clinical)} patients found")

    # --- 2. Read RANO follow-up ---
    print("=== Reading girecek2.csv (RANO) ===")
    rano_by_patient = {}
    with open(FILE2, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = row["Patient"].strip()
            if pid not in rano_by_patient:
                rano_by_patient[pid] = []
            rano_by_patient[pid].append(row)
    print(f"  {len(rano_by_patient)} patients with RANO data")

    # --- 3. Read radiomics (girecek3 — DeepBraTumIA) ---
    print("=== Reading girecek3.csv (radiomics DeepBraTumIA) ===")
    radiomics3 = []
    with open(FILE3, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            radiomics3.append(row)
    print(f"  {len(radiomics3)} rows")

    # --- 4. Read radiomics (girecek4 — HD-GLIO) ---
    print("=== Reading girecek4.csv (radiomics HD-GLIO) ===")
    radiomics4 = []
    with open(FILE4, encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            radiomics4.append(row)
    print(f"  {len(radiomics4)} rows")

    # --- 5. Import patients ---
    print("\n=== Importing patients ===")
    imported = 0
    updated = 0

    for pid, cdata in clinical.items():
        existing = db.query(Patient).filter(Patient.patient_id == pid).first()

        if existing:
            existing.age = cdata["age"]
            existing.gender = cdata["gender"]
            existing.survival_days = cdata["survival_days"]
            existing.idh1_status = cdata["idh1_status"]
            existing.mgmt_status = cdata["mgmt_status"]
            existing.treatment_protocol = "stupp"
            existing.dataset_source = "LUMIERE"
            existing.status = "deceased" if cdata["survival_days"] else "unknown"
            notes = []
            if cdata["mgmt_quantitative"] and cdata["mgmt_quantitative"] != "na":
                notes.append(f"MGMT quantitative: {cdata['mgmt_quantitative']}")
            if cdata["idh_method"] and cdata["idh_method"] != "na":
                notes.append(f"IDH method: {cdata['idh_method']}")
            existing.notes = "; ".join(notes) if notes else None
            updated += 1
            patient = existing
        else:
            notes = []
            if cdata["mgmt_quantitative"] and cdata["mgmt_quantitative"] != "na":
                notes.append(f"MGMT quantitative: {cdata['mgmt_quantitative']}")
            if cdata["idh_method"] and cdata["idh_method"] != "na":
                notes.append(f"IDH method: {cdata['idh_method']}")

            patient = Patient(
                patient_id=pid,
                age=cdata["age"],
                gender=cdata["gender"],
                kps_score=None,
                mgmt_status=cdata["mgmt_status"],
                idh1_status=cdata["idh1_status"],
                treatment_protocol="stupp",
                survival_days=cdata["survival_days"],
                status="deceased" if cdata["survival_days"] else "unknown",
                dataset_source="LUMIERE",
                notes="; ".join(notes) if notes else None,
            )
            db.add(patient)
            imported += 1

        db.flush()

        # --- Add treatments from RANO ---
        if pid in rano_by_patient:
            db.query(Treatment).filter(Treatment.patient_pk == patient.id).delete()

            treatments, last_rano, first_pd_week = extract_treatments_from_rano(rano_by_patient[pid])
            for t in treatments:
                treatment = Treatment(
                    patient_pk=patient.id,
                    drug_name=t["drug_name"],
                    protocol=t.get("protocol"),
                    cycles=t.get("cycles"),
                    notes=t.get("notes"),
                )
                db.add(treatment)

        # --- Add baseline radiomics as Analysis ---
        existing_analysis = db.query(Analysis).filter(Analysis.patient_pk == patient.id).first()
        if not existing_analysis:
            rad3 = extract_baseline_radiomics(pid, radiomics3)
            rad4 = extract_baseline_radiomics(pid, radiomics4)

            combined_radiomics = {**rad3}
            for k, v in rad4.items():
                combined_radiomics[f"hdglio_{k}"] = v

            necrosis_vol = rad3.get("ct1_necrosis_volume", 0)
            enhancing_vol = rad3.get("ct1_contrast_enhancing_volume", 0)
            edema_vol = rad3.get("ct1_edema_volume", 0)
            total_vol = necrosis_vol + enhancing_vol + edema_vol

            if total_vol > 0:
                total_vol_cm3 = total_vol / 1000
                enhancing_cm3 = enhancing_vol / 1000
                necrosis_cm3 = necrosis_vol / 1000
            else:
                total_vol_cm3 = enhancing_cm3 = necrosis_cm3 = 0

            analysis = Analysis(
                patient_pk=patient.id,
                session_id="LUMIERE",
                report_id=f"LUM-{pid.replace('Patient-', '')}",
                tumor_volume_cm3=round(total_vol_cm3, 2) if total_vol_cm3 > 0 else None,
                core_volume_cm3=round(necrosis_cm3, 2) if necrosis_cm3 > 0 else None,
                enhancing_volume_cm3=round(enhancing_cm3, 2) if enhancing_cm3 > 0 else None,
                results_json=json.dumps({
                    "radiomics_feature_count": len(combined_radiomics),
                    "segmentation_methods": ["DeepBraTumIA", "HD-GLIO-AUTO"],
                    "baseline_radiomics": {k: round(v, 6) for k, v in list(combined_radiomics.items())[:50]},
                    "rano_history": [
                        {
                            "date": r.get("Date", "").strip(),
                            "rating": r.get("Rating (according to RANO, PD: Progressive disease, SD: Stable disease, PR: Partial response, CR: Complete response, Pre-Op: Pre-Operative, Post-Op: Post-Operative)", "").strip(),
                        }
                        for r in rano_by_patient.get(pid, [])
                    ],
                }, ensure_ascii=False),
            )
            db.add(analysis)

    db.commit()
    print(f"\n=== DONE ===")
    print(f"  Imported: {imported} new patients")
    print(f"  Updated:  {updated} existing patients")
    print(f"  Total LUMIERE patients: {len(clinical)}")

    # Summary stats
    total = db.query(Patient).count()
    lumiere = db.query(Patient).filter(Patient.dataset_source == "LUMIERE").count()
    with_survival = db.query(Patient).filter(Patient.survival_days.isnot(None)).count()
    with_mgmt = db.query(Patient).filter(Patient.mgmt_status != "unknown", Patient.mgmt_status.isnot(None)).count()
    treatments_count = db.query(Treatment).count()
    analyses_count = db.query(Analysis).count()

    print(f"\n=== Database Summary ===")
    print(f"  Total patients:    {total}")
    print(f"  LUMIERE patients:  {lumiere}")
    print(f"  With survival:     {with_survival}")
    print(f"  With MGMT:         {with_mgmt}")
    print(f"  Total treatments:  {treatments_count}")
    print(f"  Total analyses:    {analyses_count}")

    db.close()


if __name__ == "__main__":
    main()
