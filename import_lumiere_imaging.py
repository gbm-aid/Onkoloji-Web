"""
LUMIERE Imaging batch importer — reads NIfTI files directly from disk,
computes real radiomics, updates existing DB records. No upload needed.
"""

import json
import logging
import os
import sys
import time
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage, stats

sys.path.insert(0, str(Path(__file__).resolve().parent))

from database import SessionLocal, init_db
from models import Patient, Analysis

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger("lumiere_imaging")

LUMIERE_DIR = Path(r"C:\Users\merte\Desktop\Lumiere\Imaging")

# DeepBraTumIA labels
LABEL_ENHANCING = 1
LABEL_NECROTIC = 2
LABEL_EDEMA = 3


def compute_volumes_from_seg(seg_data, voxel_vol_mm3):
    enhancing = np.count_nonzero(seg_data == LABEL_ENHANCING) * voxel_vol_mm3
    necrotic = np.count_nonzero(seg_data == LABEL_NECROTIC) * voxel_vol_mm3
    edema = np.count_nonzero(seg_data == LABEL_EDEMA) * voxel_vol_mm3
    core = enhancing + necrotic
    whole = core + edema
    return {
        "tumor_volume_cm3": round(whole / 1000, 2),
        "core_volume_cm3": round(core / 1000, 2),
        "enhancing_volume_cm3": round(enhancing / 1000, 2),
        "necrotic_volume_cm3": round(necrotic / 1000, 2),
        "edema_volume_cm3": round(edema / 1000, 2),
    }


def compute_shape(seg_data, voxel_vol_mm3):
    binary = seg_data > 0
    n_voxels = np.count_nonzero(binary)
    if n_voxels == 0:
        return {"surface_area_cm2": 0, "sphericity": 0, "compactness": 0}

    eroded = ndimage.binary_erosion(binary)
    surface_voxels = np.count_nonzero(binary & ~eroded)
    sa_mm2 = surface_voxels * voxel_vol_mm3 ** (2 / 3)
    vol_mm3 = n_voxels * voxel_vol_mm3

    sphericity = 0.0
    if sa_mm2 > 0:
        sphericity = min((np.pi ** (1 / 3) * (6 * vol_mm3) ** (2 / 3)) / sa_mm2, 1.0)

    return {
        "surface_area_cm2": round(sa_mm2 / 100, 2),
        "sphericity": round(sphericity, 4),
        "compactness": round(sphericity ** 2, 4),
    }


def compute_intensity(image_data, mask, modality):
    vals = image_data[mask].astype(np.float64)
    if len(vals) == 0:
        return {}
    prefix = modality.lower()

    hist, edges = np.histogram(vals, bins=64, density=True)
    bw = edges[1] - edges[0]
    hn = hist * bw
    hp = hn[hn > 0]
    entropy = -float(np.sum(hp * np.log2(hp + 1e-12)))
    energy = float(np.sum(hn ** 2))

    return {
        f"{prefix}_mean": round(float(np.mean(vals)), 2),
        f"{prefix}_std": round(float(np.std(vals)), 2),
        f"{prefix}_skewness": round(float(stats.skew(vals)), 4),
        f"{prefix}_kurtosis": round(float(stats.kurtosis(vals)), 4),
        f"{prefix}_entropy": round(entropy, 4),
        f"{prefix}_energy": round(energy, 6),
        f"{prefix}_p10": round(float(np.percentile(vals, 10)), 2),
        f"{prefix}_p90": round(float(np.percentile(vals, 90)), 2),
    }


def compute_glcm(image_data, mask):
    vals = image_data[mask].astype(np.float64)
    if len(vals) < 100:
        return {"contrast": 0, "homogeneity": 0, "correlation": 0}

    vmin, vmax = np.percentile(vals, [1, 99])
    if vmax <= vmin:
        return {"contrast": 0, "homogeneity": 0, "correlation": 0}

    bins = 32
    q = np.clip(((vals - vmin) / (vmax - vmin) * (bins - 1)), 0, bins - 1).astype(int)
    glcm = np.zeros((bins, bins), dtype=np.float64)
    np.add.at(glcm, (q[:-1], q[1:]), 1)
    glcm = (glcm + glcm.T) / 2
    total = glcm.sum()
    if total == 0:
        return {"contrast": 0, "homogeneity": 0, "correlation": 0}
    glcm /= total

    i, j = np.meshgrid(range(bins), range(bins), indexing="ij")
    i = i.astype(np.float64)
    j = j.astype(np.float64)

    contrast = float(np.sum(glcm * (i - j) ** 2))
    homogeneity = float(np.sum(glcm / (1 + np.abs(i - j))))

    mu_i = np.sum(glcm * i)
    mu_j = np.sum(glcm * j)
    sig_i = np.sqrt(np.sum(glcm * (i - mu_i) ** 2))
    sig_j = np.sqrt(np.sum(glcm * (j - mu_j) ** 2))
    correlation = 0.0
    if sig_i > 0 and sig_j > 0:
        correlation = float(np.sum(glcm * (i - mu_i) * (j - mu_j)) / (sig_i * sig_j))

    return {
        "contrast": round(contrast, 2),
        "homogeneity": round(homogeneity, 4),
        "correlation": round(correlation, 4),
    }


def process_patient(patient_dir, timepoint="week-000"):
    tp_dir = patient_dir / timepoint
    if not tp_dir.exists():
        return None

    seg_path = tp_dir / "DeepBraTumIA-segmentation" / "atlas" / "segmentation" / "seg_mask.nii.gz"
    if not seg_path.exists():
        hdglio_seg = tp_dir / "HD-GLIO-AUTO-segmentation" / "registered" / "segmentation.nii.gz"
        if hdglio_seg.exists():
            seg_path = hdglio_seg
        else:
            return None

    seg_img = nib.load(str(seg_path))
    seg_data = seg_img.get_fdata()
    voxel_vol = float(np.prod(seg_img.header.get_zooms()[:3]))

    volumes = compute_volumes_from_seg(seg_data, voxel_vol)
    shape_feats = compute_shape(seg_data, voxel_vol)

    whole_mask = seg_data > 0
    nifti_shape = list(seg_img.shape[:3])

    mri_map = {"CT1": "T1ce", "FLAIR": "FLAIR", "T1": "T1", "T2": "T2"}
    images = {}
    for fname, mod_name in mri_map.items():
        fpath = tp_dir / f"{fname}.nii.gz"
        if fpath.exists():
            try:
                images[mod_name] = nib.load(str(fpath)).get_fdata()
            except Exception:
                pass

    intensity_feats = {}
    for mod, data in images.items():
        if data.shape == seg_data.shape:
            try:
                feats = compute_intensity(data, whole_mask, mod)
                intensity_feats.update(feats)
            except Exception:
                pass

    texture_feats = {}
    tex_img = None
    for mod_name in ("FLAIR", "T1ce", "T2"):
        if mod_name in images and images[mod_name].shape == seg_data.shape:
            tex_img = images[mod_name]
            break
    if tex_img is not None:
        try:
            texture_feats = compute_glcm(tex_img, whole_mask)
        except Exception:
            pass

    vol_json_path = tp_dir / "DeepBraTumIA-segmentation" / "atlas" / "segmentation" / "measured_volumes_in_mm3.json"
    precomputed = {}
    if vol_json_path.exists():
        try:
            precomputed = json.loads(vol_json_path.read_text(encoding="utf-8"))
        except Exception:
            pass

    all_timepoints = sorted([d.name for d in patient_dir.iterdir() if d.is_dir() and d.name.startswith("week-")])

    return {
        "volumes": volumes,
        "shape": shape_feats,
        "intensity": intensity_feats,
        "texture": texture_feats,
        "nifti_shape": nifti_shape,
        "available_modalities": list(images.keys()),
        "segmentation_method": "DeepBraTumIA" if "DeepBraTumIA" in str(seg_path) else "HD-GLIO-AUTO",
        "precomputed_volumes_mm3": precomputed,
        "all_timepoints": all_timepoints,
    }


def main():
    init_db()
    db = SessionLocal()

    if not LUMIERE_DIR.exists():
        log.error("LUMIERE imaging directory not found: %s", LUMIERE_DIR)
        return

    patient_dirs = sorted([d for d in LUMIERE_DIR.iterdir() if d.is_dir()])
    log.info("Found %d patient imaging folders", len(patient_dirs))

    processed = 0
    skipped = 0
    errors = 0
    t0 = time.time()

    for i, pdir in enumerate(patient_dirs):
        pid = pdir.name
        log.info("[%d/%d] Processing %s...", i + 1, len(patient_dirs), pid)

        patient = db.query(Patient).filter(Patient.patient_id == pid).first()
        if not patient:
            log.warning("  %s not in database, skipping", pid)
            skipped += 1
            continue

        try:
            result = process_patient(pdir)
            if result is None:
                log.warning("  %s has no baseline segmentation, skipping", pid)
                skipped += 1
                continue

            vols = result["volumes"]

            radiomics_all = {}
            radiomics_all.update(result["intensity"])
            radiomics_all.update(result["texture"])
            radiomics_all.update({
                "surface_area_cm2": result["shape"]["surface_area_cm2"],
                "sphericity": result["shape"]["sphericity"],
                "compactness": result["shape"]["compactness"],
            })

            from real_analysis import compute_risk_score
            clinical = {
                "age": patient.age or 60,
                "gender": patient.gender or "",
                "kps_score": patient.kps_score or 70,
                "mgmt_status": patient.mgmt_status or "unknown",
                "idh1_status": patient.idh1_status or "unknown",
            }
            risk = compute_risk_score(clinical, vols)

            existing = db.query(Analysis).filter(Analysis.patient_pk == patient.id).first()

            results_data = {
                "radiomics_nifti": {k: round(v, 6) if isinstance(v, float) else v for k, v in radiomics_all.items()},
                "nifti_shape": result["nifti_shape"],
                "available_modalities": result["available_modalities"],
                "segmentation_method": result["segmentation_method"],
                "precomputed_volumes_mm3": result["precomputed_volumes_mm3"],
                "all_timepoints": result["all_timepoints"],
                "imaging_source": str(pdir),
            }

            if existing:
                old_json = json.loads(existing.results_json) if existing.results_json else {}
                old_json.update(results_data)
                existing.results_json = json.dumps(old_json, ensure_ascii=False)
                existing.tumor_volume_cm3 = vols["tumor_volume_cm3"]
                existing.core_volume_cm3 = vols["core_volume_cm3"]
                existing.enhancing_volume_cm3 = vols["enhancing_volume_cm3"]
                existing.edema_volume_cm3 = vols["edema_volume_cm3"]
                existing.surface_area_cm2 = result["shape"]["surface_area_cm2"]
                existing.sphericity = result["shape"]["sphericity"]
                existing.risk_score = risk["risk_score"]
                existing.risk_class = risk["risk_class"]
                existing.risk_label = risk["risk_label"]
                existing.survival_6m_pct = risk["survival_6m_pct"]
            else:
                analysis = Analysis(
                    patient_pk=patient.id,
                    session_id="LUMIERE-IMAGING",
                    report_id=f"LUM-IMG-{pid.replace('Patient-', '')}",
                    tumor_volume_cm3=vols["tumor_volume_cm3"],
                    core_volume_cm3=vols["core_volume_cm3"],
                    enhancing_volume_cm3=vols["enhancing_volume_cm3"],
                    edema_volume_cm3=vols["edema_volume_cm3"],
                    surface_area_cm2=result["shape"]["surface_area_cm2"],
                    sphericity=result["shape"]["sphericity"],
                    risk_score=risk["risk_score"],
                    risk_class=risk["risk_class"],
                    risk_label=risk["risk_label"],
                    survival_6m_pct=risk["survival_6m_pct"],
                    results_json=json.dumps(results_data, ensure_ascii=False),
                )
                db.add(analysis)

            processed += 1
            log.info("  OK: tumor=%.1fcm3, enh=%.1fcm3, risk=%.1f (%s), mods=%s, tps=%d",
                     vols["tumor_volume_cm3"], vols["enhancing_volume_cm3"],
                     risk["risk_score"], risk["risk_label"],
                     result["available_modalities"], len(result["all_timepoints"]))

        except Exception as e:
            log.error("  ERROR processing %s: %s", pid, e)
            errors += 1
            continue

    db.commit()
    elapsed = time.time() - t0

    log.info("")
    log.info("=== LUMIERE Imaging Import Complete ===")
    log.info("  Processed: %d", processed)
    log.info("  Skipped:   %d", skipped)
    log.info("  Errors:    %d", errors)
    log.info("  Time:      %.1f seconds", elapsed)

    total_analyses = db.query(Analysis).count()
    log.info("  Total analyses in DB: %d", total_analyses)
    db.close()


if __name__ == "__main__":
    main()
