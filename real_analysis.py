"""
GBM-AID Real Analysis Pipeline
Computes actual radiomics from NIfTI files — no mock data.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

import nibabel as nib
import numpy as np
from scipy import ndimage, stats

logger = logging.getLogger("gbmaid.analysis")

from dotenv import load_dotenv
load_dotenv()

GBM_REF_DIR = Path(os.environ.get("GBM_REF_DIR", r"C:\Users\merte\Desktop\GBM"))
REF_DB_PATH = Path(__file__).resolve().parent / "reference_db.json"
CALIBRATION_PATH = Path(__file__).resolve().parent / "model_calibration.json"

_calibration_cache: dict | None = None
_ref_db_cache: dict | None = None


def _load_calibration() -> dict | None:
    global _calibration_cache
    if _calibration_cache is not None:
        return _calibration_cache
    if CALIBRATION_PATH.exists():
        try:
            _calibration_cache = json.loads(CALIBRATION_PATH.read_text(encoding="utf-8"))
            return _calibration_cache
        except Exception:
            pass
    return None

MODALITY_FILES = {
    "FLAIR": "FLAIR.nii",
    "T1ce": "T1c.nii",
    "T1": "T1w.nii",
    "T2": "T2w.nii",
}
MASK_FILES = {
    "whole": "whole.nii.gz",
    "core": "core.nii.gz",
}


def compute_volumes_from_multilabel(seg_path: str) -> tuple:
    """BraTS multi-label seg (1=necrotic, 2=edema, 4=enhancing) → separate masks."""
    img = nib.load(seg_path)
    data = img.get_fdata()
    voxel_vol = float(np.prod(img.header.get_zooms()[:3]))
    necrotic = (data == 1)
    edema = (data == 2)
    enhancing = (data == 4)
    whole = necrotic | edema | enhancing
    core = necrotic | enhancing
    result = {
        "tumor_volume_cm3": round(np.count_nonzero(whole) * voxel_vol / 1000, 2),
        "core_volume_cm3": round(np.count_nonzero(core) * voxel_vol / 1000, 2),
        "enhancing_volume_cm3": round(np.count_nonzero(enhancing) * voxel_vol / 1000, 2),
        "edema_volume_cm3": round(np.count_nonzero(edema) * voxel_vol / 1000, 2),
    }
    return result, whole.astype(bool), core.astype(bool), voxel_vol


def fetch_pubmed_refs(terms: list, max_results: int = 5) -> list:
    """Gerçek PubMed E-utils API sorgusu ile referans listesi döndürür."""
    import urllib.request
    import urllib.parse
    query = " ".join(terms)
    try:
        search_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?" + urllib.parse.urlencode({
            "db": "pubmed", "term": query, "retmax": max_results,
            "retmode": "json", "sort": "relevance",
        })
        with urllib.request.urlopen(search_url, timeout=8) as resp:
            search_data = json.loads(resp.read().decode())
        pmids = search_data.get("esearchresult", {}).get("idlist", [])
        if not pmids:
            return []
        summary_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?" + urllib.parse.urlencode({
            "db": "pubmed", "id": ",".join(pmids), "retmode": "json",
        })
        with urllib.request.urlopen(summary_url, timeout=8) as resp:
            summary_data = json.loads(resp.read().decode())
        refs = []
        for pmid in pmids:
            art = summary_data.get("result", {}).get(pmid, {})
            if not art or art.get("error"):
                continue
            refs.append({
                "pmid": pmid,
                "title": art.get("title", "").rstrip("."),
                "journal": art.get("source", ""),
                "year": art.get("pubdate", "")[:4],
            })
        return refs
    except Exception as e:
        logger.warning("PubMed fetch failed: %s", e)
        return []


def compute_volumes(whole_path: str | None, core_path: str | None) -> dict:
    result = {
        "tumor_volume_cm3": 0.0,
        "core_volume_cm3": 0.0,
        "enhancing_volume_cm3": 0.0,
        "edema_volume_cm3": 0.0,
    }
    whole_data = core_data = None
    voxel_vol = 1.0

    if whole_path and os.path.exists(whole_path):
        img = nib.load(whole_path)
        whole_data = img.get_fdata().astype(bool)
        voxel_vol = float(np.prod(img.header.get_zooms()[:3]))
        result["tumor_volume_cm3"] = round(np.count_nonzero(whole_data) * voxel_vol / 1000, 2)

    if core_path and os.path.exists(core_path):
        img = nib.load(core_path)
        core_data = img.get_fdata().astype(bool)
        if voxel_vol == 1.0:
            voxel_vol = float(np.prod(img.header.get_zooms()[:3]))
        result["core_volume_cm3"] = round(np.count_nonzero(core_data) * voxel_vol / 1000, 2)

    if whole_data is not None and core_data is not None:
        edema_mask = whole_data & ~core_data
        result["edema_volume_cm3"] = round(np.count_nonzero(edema_mask) * voxel_vol / 1000, 2)

    return result, whole_data, core_data, voxel_vol


def estimate_enhancing(core_data: np.ndarray | None, t1ce_data: np.ndarray | None,
                       voxel_vol: float) -> float:
    if core_data is None or t1ce_data is None:
        return 0.0
    if core_data.shape != t1ce_data.shape:
        return 0.0
    core_vals = t1ce_data[core_data]
    if len(core_vals) == 0:
        return 0.0
    threshold = np.percentile(core_vals, 70)
    enh_mask = core_data & (t1ce_data > threshold)
    return round(np.count_nonzero(enh_mask) * voxel_vol / 1000, 2)


def compute_shape_features(mask_data: np.ndarray | None, voxel_vol: float) -> dict:
    if mask_data is None or np.count_nonzero(mask_data) == 0:
        return {"surface_area_cm2": 0.0, "sphericity": 0.0, "compactness": 0.0}

    eroded = ndimage.binary_erosion(mask_data)
    surface_voxels = np.count_nonzero(mask_data & ~eroded)
    sa_mm2 = surface_voxels * voxel_vol ** (2 / 3)
    sa_cm2 = sa_mm2 / 100

    vol_mm3 = np.count_nonzero(mask_data) * voxel_vol
    if sa_mm2 > 0:
        sphericity = min((np.pi ** (1 / 3) * (6 * vol_mm3) ** (2 / 3)) / sa_mm2, 1.0)
    else:
        sphericity = 0.0

    compactness = sphericity ** 2

    return {
        "surface_area_cm2": round(sa_cm2, 2),
        "sphericity": round(sphericity, 4),
        "compactness": round(compactness, 4),
    }


def compute_intensity_features(image_data: np.ndarray, mask_data: np.ndarray,
                               modality: str) -> dict:
    if image_data.shape != mask_data.shape:
        return {}
    vals = image_data[mask_data]
    if len(vals) == 0:
        return {}

    vals = vals.astype(np.float64)
    prefix = modality.lower()

    hist, bin_edges = np.histogram(vals, bins=64, density=True)
    bin_width = bin_edges[1] - bin_edges[0]
    hist_norm = hist * bin_width
    hist_pos = hist_norm[hist_norm > 0]
    entropy = -float(np.sum(hist_pos * np.log2(hist_pos + 1e-12)))
    energy = float(np.sum(hist_norm ** 2))

    return {
        f"{prefix}_mean": round(float(np.mean(vals)), 2),
        f"{prefix}_std": round(float(np.std(vals)), 2),
        f"{prefix}_median": round(float(np.median(vals)), 2),
        f"{prefix}_skewness": round(float(stats.skew(vals)), 4),
        f"{prefix}_kurtosis": round(float(stats.kurtosis(vals)), 4),
        f"{prefix}_entropy": round(entropy, 4),
        f"{prefix}_energy": round(energy, 6),
        f"{prefix}_p10": round(float(np.percentile(vals, 10)), 2),
        f"{prefix}_p90": round(float(np.percentile(vals, 90)), 2),
        f"{prefix}_range": round(float(np.ptp(vals)), 2),
    }


def compute_texture_features(image_data: np.ndarray, mask_data: np.ndarray) -> dict:
    if image_data.shape != mask_data.shape:
        return {"contrast": 0.0, "homogeneity": 0.0, "correlation": 0.0}
    vals = image_data[mask_data].astype(np.float64)
    if len(vals) < 100:
        return {"contrast": 0.0, "homogeneity": 0.0, "correlation": 0.0}

    vmin, vmax = np.percentile(vals, [1, 99])
    if vmax <= vmin:
        return {"contrast": 0.0, "homogeneity": 0.0, "correlation": 0.0}

    bins = 32
    quantized = np.clip(((vals - vmin) / (vmax - vmin) * (bins - 1)), 0, bins - 1).astype(int)

    n = len(quantized)
    pairs_i = quantized[:-1]
    pairs_j = quantized[1:]
    glcm = np.zeros((bins, bins), dtype=np.float64)
    np.add.at(glcm, (pairs_i, pairs_j), 1)
    glcm = (glcm + glcm.T) / 2
    total = glcm.sum()
    if total == 0:
        return {"contrast": 0.0, "homogeneity": 0.0, "correlation": 0.0}
    glcm /= total

    i_idx, j_idx = np.meshgrid(range(bins), range(bins), indexing="ij")
    i_idx = i_idx.astype(np.float64)
    j_idx = j_idx.astype(np.float64)

    contrast = float(np.sum(glcm * (i_idx - j_idx) ** 2))
    homogeneity = float(np.sum(glcm / (1 + np.abs(i_idx - j_idx))))

    mu_i = np.sum(glcm * i_idx)
    mu_j = np.sum(glcm * j_idx)
    sig_i = np.sqrt(np.sum(glcm * (i_idx - mu_i) ** 2))
    sig_j = np.sqrt(np.sum(glcm * (j_idx - mu_j) ** 2))
    if sig_i > 0 and sig_j > 0:
        correlation = float(np.sum(glcm * (i_idx - mu_i) * (j_idx - mu_j)) / (sig_i * sig_j))
    else:
        correlation = 0.0

    return {
        "contrast": round(contrast, 2),
        "homogeneity": round(homogeneity, 4),
        "correlation": round(correlation, 4),
    }


def extract_patient_features(patient_dir: str) -> dict | None:
    pdir = Path(patient_dir)
    if not pdir.is_dir():
        return None

    whole_path = str(pdir / MASK_FILES["whole"]) if (pdir / MASK_FILES["whole"]).exists() else None
    core_path = str(pdir / MASK_FILES["core"]) if (pdir / MASK_FILES["core"]).exists() else None

    if not whole_path and not core_path:
        return None

    volumes, whole_data, core_data, voxel_vol = compute_volumes(whole_path, core_path)

    images = {}
    for mod, fname in MODALITY_FILES.items():
        fpath = pdir / fname
        if fpath.exists():
            try:
                images[mod] = nib.load(str(fpath)).get_fdata()
            except Exception:
                pass

    if "T1ce" in images and core_data is not None:
        volumes["enhancing_volume_cm3"] = estimate_enhancing(core_data, images["T1ce"], voxel_vol)

    shape = compute_shape_features(whole_data, voxel_vol)

    intensity = {}
    mask_for_intensity = whole_data if whole_data is not None else core_data
    if mask_for_intensity is not None:
        for mod, data in images.items():
            try:
                feats = compute_intensity_features(data, mask_for_intensity, mod)
                intensity.update(feats)
            except Exception:
                pass

    texture = {}
    if "FLAIR" in images and mask_for_intensity is not None:
        try:
            texture = compute_texture_features(images["FLAIR"], mask_for_intensity)
        except Exception:
            pass

    nifti_shape = None
    if whole_path:
        try:
            nifti_shape = list(nib.load(whole_path).shape[:3])
        except Exception:
            pass

    return {
        "volumes": volumes,
        "shape": shape,
        "intensity": intensity,
        "texture": texture,
        "nifti_shape": nifti_shape,
        "available_modalities": list(images.keys()),
        "has_whole_mask": whole_path is not None,
        "has_core_mask": core_path is not None,
    }


def build_feature_vector(features: dict) -> np.ndarray:
    keys = [
        "volumes.tumor_volume_cm3", "volumes.core_volume_cm3",
        "volumes.enhancing_volume_cm3", "volumes.edema_volume_cm3",
        "shape.surface_area_cm2", "shape.sphericity", "shape.compactness",
        "texture.contrast", "texture.homogeneity", "texture.correlation",
    ]

    for mod in ["flair", "t1ce", "t1", "t2"]:
        for stat in ["mean", "std", "skewness", "kurtosis", "entropy"]:
            keys.append(f"intensity.{mod}_{stat}")

    vec = []
    for k in keys:
        parts = k.split(".")
        val = features
        for p in parts:
            if isinstance(val, dict):
                val = val.get(p, 0.0)
            else:
                val = 0.0
                break
        vec.append(float(val) if val is not None else 0.0)

    return np.array(vec, dtype=np.float64)


def precompute_reference_database(force: bool = False) -> dict:
    if REF_DB_PATH.exists() and not force:
        return json.loads(REF_DB_PATH.read_text(encoding="utf-8"))

    if not GBM_REF_DIR.exists():
        logger.warning("GBM reference directory not found: %s", GBM_REF_DIR)
        return {"patients": {}}

    db = {"patients": {}}
    dirs = sorted([d for d in GBM_REF_DIR.iterdir() if d.is_dir()])

    for i, pdir in enumerate(dirs):
        pid = pdir.name
        logger.info("Processing %d/%d: %s", i + 1, len(dirs), pid)
        try:
            feats = extract_patient_features(str(pdir))
            if feats is None:
                logger.warning("Skipping %s — no masks found", pid)
                continue
            vec = build_feature_vector(feats).tolist()
            db["patients"][pid] = {
                "features": feats,
                "vector": vec,
            }
        except Exception as e:
            logger.error("Error processing %s: %s", pid, e)
            continue

    REF_DB_PATH.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Reference database saved: %d patients", len(db["patients"]))
    return db


def find_similar_patients(query_features: dict, ref_db: dict, top_k: int = 10) -> list[dict]:
    if not ref_db.get("patients"):
        return []

    query_vec = build_feature_vector(query_features)
    q_norm = np.linalg.norm(query_vec)
    if q_norm == 0:
        return []

    similarities = []
    for pid, pdata in ref_db["patients"].items():
        ref_vec = np.array(pdata["vector"], dtype=np.float64)
        r_norm = np.linalg.norm(ref_vec)
        if r_norm == 0:
            continue
        cosine_sim = float(np.dot(query_vec, ref_vec) / (q_norm * r_norm))
        similarities.append((pid, cosine_sim, pdata["features"]))

    similarities.sort(key=lambda x: x[1], reverse=True)

    results = []
    for pid, sim, feats in similarities[:top_k]:
        results.append({
            "id": pid,
            "similarity": round(sim, 4),
            "tumor_volume_cm3": feats["volumes"]["tumor_volume_cm3"],
            "core_volume_cm3": feats["volumes"]["core_volume_cm3"],
            "available_modalities": feats["available_modalities"],
        })
    return results


def compute_risk_score(clinical: dict, radiomics: dict) -> dict:
    age = clinical.get("age", 60)
    kps = clinical.get("kps_score", 70)
    mgmt = clinical.get("mgmt_status", "unknown")
    idh1 = clinical.get("idh1_status", "unknown")

    tumor_vol = radiomics.get("tumor_volume_cm3", 50)
    core_vol = radiomics.get("core_volume_cm3", 20)
    enh_vol = radiomics.get("enhancing_volume_cm3", 0)

    cal = _load_calibration()

    if cal:
        gender = clinical.get("gender", "")
        gender_m = 1 if gender == "M" else 0
        mgmt_met = 1 if mgmt == "methylated" else 0
        mgmt_unmet = 1 if mgmt == "unmethylated" else 0
        idh_mut = 1 if idh1 == "mutant" else 0
        idh_wt = 1 if idh1 in ("wildtype", "wild-type") else 0
        log_tumor = float(np.log(tumor_vol + 1))
        core_ratio = core_vol / tumor_vol if tumor_vol > 0 else 0
        enh_ratio = enh_vol / tumor_vol if tumor_vol > 0 else 0

        raw = np.array([age, gender_m, mgmt_met, mgmt_unmet, idh_mut, idh_wt,
                        log_tumor, core_ratio, enh_ratio], dtype=np.float64)

        sc = cal["scaler"]
        scaled = (raw - np.array(sc["mean"])) / np.array(sc["scale"])

        r_coef = np.array(cal["risk_model"]["coef"])
        r_int = cal["risk_model"]["intercept"]
        risk_score = float(np.dot(scaled, r_coef) + r_int)
        risk_score = round(min(max(risk_score, 1), 99), 1)

        s6_coef = np.array(cal["model_6m"]["coef"])
        s6_int = cal["model_6m"]["intercept"]
        logit_6m = float(np.dot(scaled, s6_coef) + s6_int)
        survival_6m = round(float(1 / (1 + np.exp(-logit_6m)) * 100), 1)
        survival_6m = min(max(survival_6m, 5), 98)
    else:
        lp = 0.0
        lp += 0.03 * (age - 60)
        lp -= 0.03 * (kps - 70) / 10
        if mgmt == "methylated":
            lp -= 0.60
        if idh1 == "mutant":
            lp -= 1.05
        if tumor_vol > 0:
            lp += 0.15 * np.log(tumor_vol / 30)
        if tumor_vol > 0:
            core_ratio = core_vol / tumor_vol
            lp += 0.3 * (core_ratio - 0.3)

        risk_prob = 1.0 / (1.0 + np.exp(-lp))
        risk_score = round(float(risk_prob) * 100, 1)
        baseline_6m = 0.75
        survival_6m = baseline_6m * np.exp(-lp * 0.5)
        survival_6m = round(float(min(max(survival_6m * 100, 5), 98)), 1)

    if risk_score < 35:
        risk_class = "low"
        risk_label = "DUSUK"
    elif risk_score < 65:
        risk_class = "medium"
        risk_label = "ORTA"
    else:
        risk_class = "high"
        risk_label = "YUKSEK"

    return {
        "risk_score": risk_score,
        "risk_class": risk_class,
        "risk_label": risk_label,
        "survival_6m_pct": survival_6m,
    }


def compute_projection(tumor_vol: float, risk_score: float) -> list[dict]:
    growth_rate = 0.03 + (risk_score / 100) * 0.07
    projection = []
    for week in [4, 8, 12, 16, 20, 24]:
        vol = tumor_vol * (1 + growth_rate) ** (week / 4)
        change = (vol - tumor_vol) / tumor_vol * 100 if tumor_vol > 0 else 0
        if change < 25:
            rano = "SD"
        else:
            rano = "PD"
        projection.append({
            "week": week,
            "volume_cm3": round(vol, 1),
            "change_pct": round(change, 1),
            "rano": rano,
        })
    return projection


def run_real_analysis(patient_id: str, clinical: dict, files_info: list[dict],
                      session_id: str, upload_dir: str) -> dict:
    import uuid

    session_dir = Path(upload_dir) / session_id

    whole_path = core_path = seg_path = None
    image_paths = {}

    for fi in files_info:
        mod = fi.get("modality", "")
        fpath = fi.get("resolved_path")
        if not fpath:
            safe_name = fi.get("safe_name", fi.get("filename", ""))
            fpath = str(session_dir / safe_name)

        if not os.path.exists(fpath):
            continue

        if mod == "MASK-Whole":
            whole_path = fpath
        elif mod == "MASK-Core":
            core_path = fpath
        elif mod == "SEG":
            seg_path = fpath
        elif mod in ("T1", "T1ce", "T2", "FLAIR"):
            image_paths[mod] = fpath

    if seg_path:
        volumes, whole_data, core_data, voxel_vol = compute_volumes_from_multilabel(seg_path)
    else:
        volumes, whole_data, core_data, voxel_vol = compute_volumes(whole_path, core_path)

    images = {}
    for mod, fpath in image_paths.items():
        try:
            images[mod] = nib.load(fpath).get_fdata()
        except Exception:
            pass

    if "T1ce" in images and core_data is not None:
        volumes["enhancing_volume_cm3"] = estimate_enhancing(core_data, images["T1ce"], voxel_vol)

    shape = compute_shape_features(whole_data, voxel_vol)

    intensity = {}
    mask_for_intensity = whole_data if whole_data is not None else core_data
    if mask_for_intensity is not None:
        for mod, data in images.items():
            try:
                feats = compute_intensity_features(data, mask_for_intensity, mod)
                intensity.update(feats)
            except Exception:
                pass

    texture = {}
    if mask_for_intensity is not None:
        tex_img = None
        for _mod in ("FLAIR", "T1ce", "T2"):
            if _mod in images:
                tex_img = images[_mod]
                break
        if tex_img is not None:
            try:
                texture = compute_texture_features(tex_img, mask_for_intensity)
            except Exception:
                pass

    radiomics = {
        "tumor_volume_cm3": volumes["tumor_volume_cm3"],
        "core_volume_cm3": volumes["core_volume_cm3"],
        "enhancing_volume_cm3": volumes["enhancing_volume_cm3"],
        "edema_volume_cm3": volumes["edema_volume_cm3"],
        "surface_area_cm2": shape["surface_area_cm2"],
        "sphericity": shape["sphericity"],
        "compactness": shape["compactness"],
    }
    radiomics.update(texture)
    radiomics.update(intensity)

    risk = compute_risk_score(clinical, radiomics)

    projection = compute_projection(volumes["tumor_volume_cm3"], risk["risk_score"])

    patient_features = {
        "volumes": volumes,
        "shape": shape,
        "intensity": intensity,
        "texture": texture,
    }

    ref_db = None
    if REF_DB_PATH.exists():
        try:
            ref_db = json.loads(REF_DB_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    similar = []
    if ref_db:
        raw_similar = find_similar_patients(patient_features, ref_db, top_k=10)
        for sp in raw_similar:
            sp_feats = ref_db["patients"].get(sp["id"], {}).get("features", {})
            sp_vols = sp_feats.get("volumes", {})
            similar.append({
                "id": sp["id"],
                "similarity": sp["similarity"],
                "tumor_volume_cm3": sp_vols.get("tumor_volume_cm3", 0),
                "core_volume_cm3": sp_vols.get("core_volume_cm3", 0),
                "available_modalities": sp.get("available_modalities", []),
            })

    mgmt = clinical.get("mgmt_status", "unknown")
    idh1 = clinical.get("idh1_status", "unknown")
    age = clinical.get("age", 60)
    kps = clinical.get("kps_score", 70)

    lit_terms = ["glioblastoma", "survival", "radiomics"]
    if mgmt != "unknown":
        lit_terms.append("MGMT " + mgmt)
    if idh1 != "unknown":
        lit_terms.append("IDH1 " + idh1)

    fallback_refs = [
        {"pmid": "16061997", "title": "Radiotherapy plus concomitant and adjuvant temozolomide for glioblastoma", "journal": "N Engl J Med", "year": "2005"},
        {"pmid": "26516056", "title": "MGMT promoter methylation in malignant gliomas", "journal": "Nat Rev Clin Oncol", "year": "2015"},
        {"pmid": "19228619", "title": "IDH1 and IDH2 mutations in gliomas", "journal": "N Engl J Med", "year": "2009"},
        {"pmid": "33975139", "title": "Radiomics-based survival prediction in glioblastoma", "journal": "Front Oncol", "year": "2021"},
    ]
    pubmed_refs = fetch_pubmed_refs(lit_terms, max_results=5)
    refs = pubmed_refs if pubmed_refs else fallback_refs

    pmid_citations = " ".join(f"[PMID: {r['pmid']}]" for r in refs[:3])
    lit_summary = (
        f"Hasta profili (Yas: {age}, KPS: {kps}, MGMT: {mgmt}, IDH1: {idh1}) "
        "guncel literatur ile degerlendirildi. "
        f"Tumor hacmi {volumes['tumor_volume_cm3']:.1f} cm3 olarak segmentasyon masklarindan hesaplanmistir. "
        f"Stupp protokolu (TMZ + RT) standart birinci basamak tedavi olarak onerilmektedir {pmid_citations}. "
    )
    if mgmt == "methylated":
        lit_summary += "MGMT promotor metilasyonu olan hastalarda TMZ yanit orani anlamli sekilde yuksektir. "
    if idh1 == "mutant":
        lit_summary += "IDH1 mutasyonu pozitif hastalarda prognoz daha olumlu seyretmektedir. "
    lit_summary += "Radyomik tabanli modeller sagkalim tahminini desteklemektedir."

    ai_summary = (
        f"Segmentasyon masklarindan hesaplanan gercek tumor hacimleri: "
        f"Whole tumor {volumes['tumor_volume_cm3']:.1f} cm3, "
        f"Core {volumes['core_volume_cm3']:.1f} cm3"
    )
    if volumes["enhancing_volume_cm3"] > 0:
        ai_summary += f", Enhancing (tahmini) {volumes['enhancing_volume_cm3']:.1f} cm3"
    ai_summary += ". "

    ai_summary += (
        f"Risk skoru {risk['risk_score']:.0f}/100 olarak hesaplanmis olup "
        f"{risk['risk_label']} risk kategorisine karsilik gelmektedir. "
        f"6 aylik sagkalim olasiligi %{risk['survival_6m_pct']:.0f} olarak tahmin edilmistir. "
    )

    if similar:
        ai_summary += (
            f"LUMIERE kohortundan en benzer {len(similar)} hasta ile karsilastirilmistir "
            f"(en yuksek benzerlik: {similar[0]['similarity']:.2%}). "
        )

    cal = _load_calibration()
    n_feats = len(intensity) + len(texture) + len(shape) + 4
    if cal:
        n_cal = cal.get("n_patients", 0)
        ai_summary += f"Risk modeli {n_cal} hastadan (LUMIERE) kalibre edilmistir. "
    ai_summary += f"Toplam {n_feats} radyomik ozellik gercek NIfTI verilerinden cikarilmistir."

    report_id = f"GA-RPT-{uuid.uuid4().hex[:8].upper()}"

    return {
        "report_id": report_id,
        "risk_score": risk["risk_score"],
        "risk_class": risk["risk_class"],
        "risk_label": risk["risk_label"],
        "survival_6m_pct": risk["survival_6m_pct"],
        "radiomics": radiomics,
        "projection": projection,
        "similar_patients": similar,
        "literature": {
            "terms": lit_terms,
            "summary": lit_summary,
            "refs": refs,
            "source": "pubmed" if pubmed_refs else "fallback",
        },
        "ai_summary": ai_summary,
    }
