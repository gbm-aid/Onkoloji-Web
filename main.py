"""
GBM-AID Web Application — FastAPI Backend v5.0
Real analysis pipeline with SQLite database.
"""

from __future__ import annotations

import csv
import io
import logging
import os
import re
import uuid
import json
from contextlib import asynccontextmanager
from datetime import datetime, date
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy import func
from sqlalchemy.orm import Session

try:
    import nibabel as nib
    import numpy as np
    from PIL import Image, ImageDraw
    HAS_NIBABEL = True
except ImportError:
    HAS_NIBABEL = False

from database import engine, SessionLocal, init_db
from models import Patient, Analysis, Treatment
from real_analysis import run_real_analysis, precompute_reference_database

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gbmaid")

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
LUMIERE_IMG_DIR = Path(os.environ.get("LUMIERE_DIR", r"C:\Users\merte\Desktop\Lumiere\Imaging"))

def _migrate_db() -> None:
    from sqlalchemy import text
    new_cols = [
        ("patients", "tumor_location", "VARCHAR(100)"),
        ("patients", "surgery_type", "VARCHAR(50)"),
    ]
    with engine.connect() as conn:
        for table, col, coltype in new_cols:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}"))
                conn.commit()
            except Exception:
                pass


def _cleanup_old_uploads(max_age_hours: int = 24) -> None:
    """Upload klasöründeki eski oturumları siler."""
    cutoff = datetime.now().timestamp() - max_age_hours * 3600
    removed = 0
    for session_dir in UPLOAD_DIR.iterdir():
        if not session_dir.is_dir():
            continue
        if session_dir.stat().st_mtime < cutoff:
            import shutil
            shutil.rmtree(session_dir, ignore_errors=True)
            removed += 1
    if removed:
        logger.info("Upload cleanup: %d eski oturum silindi", removed)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    _migrate_db()
    logger.info("Database initialized")
    try:
        ref_db = precompute_reference_database()
        app.state.ref_db = ref_db
        logger.info("Reference database: %d patients", len(ref_db.get("patients", {})))
    except Exception as e:
        logger.warning("Could not precompute reference DB: %s", e)
        app.state.ref_db = {}
    await run_in_threadpool(_cleanup_old_uploads)
    yield


app = FastAPI(title="GBM-AID", version="5.0.0", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


# ---------------------------------------------------------------------------
# Modality detection
# ---------------------------------------------------------------------------

MODALITY_RULES = [
    (r"(^|[_.\-])seg($|[_.\-])", "SEG", "Segmentasyon"),
    (r"(^|[_.\-])mask[_.\-]?enh", "MASK-Enh", "Mask (Enhancing)"),
    (r"(^|[_.\-])mask[_.\-]?core", "MASK-Core", "Mask (Core)"),
    (r"(^|[_.\-])mask[_.\-]?whole", "MASK-Whole", "Mask (Whole)"),
    (r"(^|[_.\-])(core)($|[_.\-\.])", "MASK-Core", "Mask (Core)"),
    (r"(^|[_.\-])(whole)($|[_.\-\.])", "MASK-Whole", "Mask (Whole)"),
    (r"(^|[_.\-])(enh)($|[_.\-\.])", "MASK-Enh", "Mask (Enhancing)"),
    (r"(^|[_.\-])t1ce($|[_.\-])", "T1ce", "T1 Kontrastli"),
    (r"(^|[_.\-])t1c($|[_.\-\.])", "T1ce", "T1 Kontrastli"),
    (r"(^|[_.\-])t1gd($|[_.\-])", "T1ce", "T1 Kontrastli"),
    (r"(^|[_.\-])t1[_.\-]?ce($|[_.\-])", "T1ce", "T1 Kontrastli"),
    (r"(^|[_.\-])t1w?($|[_.\-\.])", "T1", "T1"),
    (r"(^|[_.\-])flair($|[_.\-\.])", "FLAIR", "FLAIR"),
    (r"(^|[_.\-])t2w?($|[_.\-\.])", "T2", "T2"),
]


def detect_modality(filename: str) -> dict:
    fn = filename.lower().replace(" ", "")
    for pattern, code, label in MODALITY_RULES:
        if re.search(pattern, fn):
            return {"code": code, "label": label, "confidence": 99}
    return {"code": "UNKNOWN", "label": "Bilinmiyor", "confidence": 0}


# ---------------------------------------------------------------------------
# NIfTI processing
# ---------------------------------------------------------------------------

@lru_cache(maxsize=12)
def _nifti_data_cached(file_path: str):
    """NIfTI verisini bellekte önbellekler — disk IO'yu tekrar eden isteklerde önler."""
    img = nib.load(file_path)
    return img.get_fdata(), tuple(img.shape[:3])


def extract_nifti_slice(file_path: str, axis: str = "axial", index: int | None = None,
                        overlay_paths: list[str] | None = None) -> bytes:
    if not HAS_NIBABEL:
        return _placeholder_slice(axis, index or 0)
    try:
        data, shape = _nifti_data_cached(file_path)
    except Exception:
        return _placeholder_slice(axis, index or 0)

    if len(shape) < 3:
        return _placeholder_slice(axis, index or 0)

    if axis == "sagittal":
        idx = max(0, min(index if index is not None else shape[0] // 2, shape[0] - 1))
        slc = data[idx, :, :]
    elif axis == "coronal":
        idx = max(0, min(index if index is not None else shape[1] // 2, shape[1] - 1))
        slc = data[:, idx, :]
    else:
        idx = max(0, min(index if index is not None else shape[2] // 2, shape[2] - 1))
        slc = data[:, :, idx]

    slc = np.rot90(slc.copy())
    pos = slc[slc > 0]
    if pos.size:
        vmin, vmax = np.percentile(pos, [2, 98])
    else:
        vmin, vmax = 0, 1
    if vmax <= vmin:
        vmax = vmin + 1

    slc_norm = np.clip((slc - vmin) / (vmax - vmin) * 255, 0, 255).astype(np.uint8)
    img_pil = Image.fromarray(slc_norm, mode="L").convert("RGB")

    if overlay_paths:
        overlay = np.array(img_pil, dtype=np.float32)
        img_h, img_w = overlay.shape[:2]
        seg_colors = {1: (220, 50, 50), 2: (180, 120, 30), 4: (230, 230, 50)}
        for op in overlay_paths:
            if not os.path.exists(op):
                continue
            try:
                sd, _ = _nifti_data_cached(op)
                if axis == "sagittal":
                    ss = sd[idx, :, :]
                elif axis == "coronal":
                    ss = sd[:, idx, :]
                else:
                    ss = sd[:, :, idx]
                ss = np.rot90(ss.copy())
                # Resize seg slice to match main image if resolutions differ
                if ss.shape[0] != img_h or ss.shape[1] != img_w:
                    ss_pil = Image.fromarray(np.round(ss).clip(0, 255).astype(np.uint8))
                    ss_pil = ss_pil.resize((img_w, img_h), Image.NEAREST)
                    ss = np.array(ss_pil, dtype=np.float32)
                # Binary mask (0/1) → treat label 1 as whole tumor (red)
                unique = set(np.unique(ss[ss > 0]).astype(int))
                use_binary = unique <= {1}
                for lv, color in seg_colors.items():
                    mask = (ss == lv) if not use_binary else (ss > 0)
                    if not np.any(mask):
                        continue
                    for c, cv in enumerate(color):
                        overlay[:, :, c] = np.where(mask,
                            overlay[:, :, c] * 0.45 + cv * 0.55,
                            overlay[:, :, c])
                    if use_binary:
                        break
            except Exception:
                continue
        img_pil = Image.fromarray(overlay.clip(0, 255).astype(np.uint8))

    img_pil = img_pil.resize((320, 320), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img_pil.save(buf, format="PNG", optimize=False)
    buf.seek(0)
    return buf.getvalue()


def get_nifti_info(file_path: str) -> dict:
    if not HAS_NIBABEL:
        return {"shape": [155, 240, 240], "voxel_size": [1.0, 1.0, 1.0]}
    try:
        img = nib.load(file_path)
        shape = list(img.shape[:3])
        voxel = [round(float(v), 2) for v in img.header.get_zooms()[:3]]
        return {"shape": shape, "voxel_size": voxel}
    except Exception:
        return {"shape": [155, 240, 240], "voxel_size": [1.0, 1.0, 1.0]}


def _placeholder_slice(axis: str = "axial", index: int = 0) -> bytes:
    img = Image.new("RGB", (300, 300), (10, 10, 18))
    draw = ImageDraw.Draw(img)
    draw.ellipse([90, 70, 210, 230], outline=(40, 40, 55), width=2)
    draw.ellipse([120, 110, 180, 190], fill=(35, 35, 50))
    label = f"{axis.upper()} Z={index}"
    draw.text((10, 10), label, fill=(120, 120, 140))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/upload")
async def upload_files(files: list[UploadFile] = File(...)):
    session_id = str(uuid.uuid4())[:8]
    session_dir = UPLOAD_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for f in files:
        mod = detect_modality(f.filename)
        safe_name = re.sub(r"[^\w.\-]", "_", f.filename)
        file_path = session_dir / safe_name
        contents = await f.read()
        file_path.write_bytes(contents)

        info = get_nifti_info(str(file_path))

        results.append({
            "filename": f.filename,
            "safe_name": safe_name,
            "size_mb": round(len(contents) / (1024 * 1024), 2),
            "modality": mod["code"],
            "modality_label": mod["label"],
            "confidence": mod["confidence"],
            "shape": info["shape"],
            "voxel_size": info["voxel_size"],
        })

    return {"session_id": session_id, "files": results}


def _resolve_lumiere_path(patient_id: str, filename: str, timepoint: str = "") -> Path | None:
    patient_dir = LUMIERE_IMG_DIR / patient_id
    if not patient_dir.exists():
        return None
    if timepoint:
        pdir = patient_dir / timepoint
    else:
        tps = sorted([d.name for d in patient_dir.iterdir() if d.is_dir() and d.name.startswith("week-")])
        pdir = patient_dir / tps[0] if tps else None
    if not pdir or not pdir.exists():
        return None
    fmap = {
        "CT1.nii.gz": pdir / "CT1.nii.gz",
        "FLAIR.nii.gz": pdir / "FLAIR.nii.gz",
        "T1.nii.gz": pdir / "T1.nii.gz",
        "T2.nii.gz": pdir / "T2.nii.gz",
        "seg_mask.nii.gz": pdir / "DeepBraTumIA-segmentation" / "atlas" / "segmentation" / "seg_mask.nii.gz",
        "seg_hdglio.nii.gz": pdir / "HD-GLIO-AUTO-segmentation" / "registered" / "segmentation.nii.gz",
    }
    target = fmap.get(filename)
    if target and target.exists():
        return target
    direct = pdir / filename
    if direct.exists():
        return direct
    return None


@app.get("/api/lumiere-patients")
async def lumiere_patients():
    if not LUMIERE_IMG_DIR.exists():
        return {"patients": []}
    patients = []
    for pdir in sorted(LUMIERE_IMG_DIR.iterdir()):
        if not pdir.is_dir() or not pdir.name.startswith("Patient-"):
            continue
        timepoints = sorted([d.name for d in pdir.iterdir() if d.is_dir() and d.name.startswith("week-")])
        if not timepoints:
            continue
        first_tp = timepoints[0]
        tp_dir = pdir / first_tp
        mri_count = sum(1 for f in ("CT1.nii.gz", "FLAIR.nii.gz", "T1.nii.gz", "T2.nii.gz") if (tp_dir / f).exists())
        patients.append({
            "patient_id": pdir.name,
            "timepoints": timepoints,
            "default_timepoint": first_tp,
            "mri_count": mri_count,
        })
    return {"patients": patients}


@app.get("/api/lumiere-files/{patient_id}")
async def lumiere_files(patient_id: str, timepoint: str = ""):
    pdir = LUMIERE_IMG_DIR / patient_id
    if not pdir.exists():
        return {"files": [], "timepoints": []}

    timepoints = sorted([d.name for d in pdir.iterdir() if d.is_dir() and d.name.startswith("week-")])
    if not timepoint or timepoint not in timepoints:
        timepoint = timepoints[0] if timepoints else "week-000"
    tp_dir = pdir / timepoint
    if not tp_dir.exists():
        return {"files": [], "timepoints": timepoints}

    files = []
    mri_files = {"CT1.nii.gz": "T1ce", "FLAIR.nii.gz": "FLAIR", "T1.nii.gz": "T1", "T2.nii.gz": "T2"}
    for fname, mod in mri_files.items():
        fpath = tp_dir / fname
        if fpath.exists():
            info = get_nifti_info(str(fpath))
            files.append({
                "filename": fname,
                "modality": mod,
                "modality_label": mod,
                "shape": info["shape"],
                "voxel_size": info["voxel_size"],
                "size_mb": round(fpath.stat().st_size / (1024 * 1024), 2),
            })

    seg_path = tp_dir / "DeepBraTumIA-segmentation" / "atlas" / "segmentation" / "seg_mask.nii.gz"
    if seg_path.exists():
        info = get_nifti_info(str(seg_path))
        files.append({
            "filename": "seg_mask.nii.gz",
            "modality": "SEG",
            "modality_label": "Segmentasyon (DeepBraTumIA)",
            "shape": info["shape"],
            "voxel_size": info["voxel_size"],
            "size_mb": round(seg_path.stat().st_size / (1024 * 1024), 2),
        })

    seg_hd = tp_dir / "HD-GLIO-AUTO-segmentation" / "registered" / "segmentation.nii.gz"
    if seg_hd.exists():
        files.append({
            "filename": "seg_hdglio.nii.gz",
            "modality": "SEG",
            "modality_label": "Segmentasyon (HD-GLIO)",
            "shape": get_nifti_info(str(seg_hd))["shape"],
            "size_mb": round(seg_hd.stat().st_size / (1024 * 1024), 2),
        })

    return {"files": files, "timepoints": timepoints, "patient_id": patient_id, "timepoint": timepoint}


@app.get("/api/slice/{session_id}/{filename}")
async def get_slice(session_id: str, filename: str, axis: str = "axial", index: int = 0, overlays: str = ""):
    fp = None

    if session_id.startswith("Patient-"):
        parts = session_id.split(":", 1)
        pid = parts[0]
        tp = parts[1] if len(parts) > 1 else ""
        fp_candidate = _resolve_lumiere_path(pid, filename, tp)
        if fp_candidate:
            fp = fp_candidate

    if fp is None:
        safe_name = re.sub(r"[^\w.\-]", "_", filename)
        fp = UPLOAD_DIR / session_id / safe_name

    if not fp or not fp.exists():
        raise HTTPException(404)

    overlay_list = []
    if overlays:
        for ov in overlays.split(","):
            ov_name = ov.strip()
            ov_path = None
            if session_id.startswith("Patient-"):
                parts = session_id.split(":", 1)
                pid = parts[0]
                tp = parts[1] if len(parts) > 1 else ""
                ov_path = _resolve_lumiere_path(pid, ov_name, tp)
            if ov_path is None:
                ov_safe = re.sub(r"[^\w.\-]", "_", ov_name)
                ov_path = UPLOAD_DIR / session_id / ov_safe
            if ov_path and ov_path.exists():
                overlay_list.append(str(ov_path))

    img_bytes = extract_nifti_slice(str(fp), axis, index, overlay_list or None)
    return StreamingResponse(io.BytesIO(img_bytes), media_type="image/png")


@app.post("/api/analyze")
async def analyze(request: Request):
    body = await request.json()
    patient_id = body.get("patient_id") or f"P-{uuid.uuid4().hex[:6].upper()}"
    clinical = body.get("clinical", {})
    files_info = body.get("files", [])
    session_id = body.get("session_id", "")

    resolved_files = files_info
    if session_id.startswith("Patient-"):
        parts = session_id.split(":", 1)
        pid = parts[0]
        tp = parts[1] if len(parts) > 1 else ""
        resolved_files = []
        for fi in files_info:
            fi_copy = dict(fi)
            fname = fi.get("filename", "")
            rp = _resolve_lumiere_path(pid, fname, tp)
            if rp:
                fi_copy["resolved_path"] = str(rp)
            resolved_files.append(fi_copy)

    try:
        results = await run_in_threadpool(
            run_real_analysis, patient_id, clinical, resolved_files, session_id, str(UPLOAD_DIR)
        )
    except Exception as exc:
        import traceback
        logger.error("Analysis error: %s\n%s", exc, traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(exc))

    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            patient = Patient(
                patient_id=patient_id,
                age=clinical.get("age"),
                gender=clinical.get("gender"),
                kps_score=clinical.get("kps_score"),
                mgmt_status=clinical.get("mgmt_status"),
                idh1_status=clinical.get("idh1_status"),
                treatment_protocol=clinical.get("treatment"),
                tumor_location=clinical.get("tumor_location"),
                surgery_type=clinical.get("surgery_type"),
                diagnosis_date=date.fromisoformat(clinical["diagnosis_date"]) if clinical.get("diagnosis_date") else None,
                dataset_source="web_upload",
            )
            db.add(patient)
            db.flush()

        analysis = Analysis(
            patient_pk=patient.id,
            session_id=session_id,
            report_id=results["report_id"],
            risk_score=results.get("risk_score"),
            risk_class=results.get("risk_class"),
            risk_label=results.get("risk_label"),
            survival_6m_pct=results.get("survival_6m_pct"),
            tumor_volume_cm3=results.get("radiomics", {}).get("tumor_volume_cm3"),
            core_volume_cm3=results.get("radiomics", {}).get("core_volume_cm3"),
            enhancing_volume_cm3=results.get("radiomics", {}).get("enhancing_volume_cm3"),
            edema_volume_cm3=results.get("radiomics", {}).get("edema_volume_cm3"),
            surface_area_cm2=results.get("radiomics", {}).get("surface_area_cm2"),
            sphericity=results.get("radiomics", {}).get("sphericity"),
            results_json=json.dumps(results, ensure_ascii=False, default=str),
            files_json=json.dumps(files_info, ensure_ascii=False, default=str),
        )
        db.add(analysis)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("DB error: %s", e)
    finally:
        db.close()

    return {"patient_id": patient_id, "results": results}


@app.get("/api/patients")
async def list_patients():
    db = SessionLocal()
    try:
        patients = db.query(Patient).all()
        out = []
        for p in patients:
            latest = (
                db.query(Analysis)
                .filter(Analysis.patient_pk == p.id)
                .order_by(Analysis.created_at.desc())
                .first()
            )
            entry = {
                "patient_id": p.patient_id,
                "date": p.created_at.strftime("%d.%m.%Y") if p.created_at else "",
                "age": p.age,
                "gender": p.gender,
                "kps": p.kps_score,
                "mgmt": p.mgmt_status,
                "idh1": p.idh1_status,
                "risk_score": latest.risk_score if latest else None,
                "risk_class": latest.risk_class if latest else None,
                "risk_label": latest.risk_label if latest else None,
                "survival_6m": latest.survival_6m_pct if latest else None,
                "report_id": latest.report_id if latest else None,
            }
            out.append(entry)
        return {"patients": out}
    finally:
        db.close()


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: str):
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            raise HTTPException(404)

        latest = (
            db.query(Analysis)
            .filter(Analysis.patient_pk == patient.id)
            .order_by(Analysis.created_at.desc())
            .first()
        )

        treatments = db.query(Treatment).filter(Treatment.patient_pk == patient.id).all()

        result = {
            "patient_id": patient.patient_id,
            "clinical": {
                "age": patient.age,
                "gender": patient.gender,
                "kps_score": patient.kps_score,
                "mgmt_status": patient.mgmt_status,
                "idh1_status": patient.idh1_status,
                "treatment": patient.treatment_protocol,
                "diagnosis_date": patient.diagnosis_date.isoformat() if patient.diagnosis_date else None,
                "tumor_location": patient.tumor_location,
                "surgery_type": patient.surgery_type,
            },
            "date": patient.created_at.strftime("%d.%m.%Y") if patient.created_at else "",
            "datetime": patient.created_at.isoformat() if patient.created_at else "",
            "survival_days": patient.survival_days,
            "status": patient.status,
            "notes": patient.notes,
            "treatments": [
                {
                    "drug_name": t.drug_name,
                    "protocol": t.protocol,
                    "dosage": t.dosage,
                    "cycles": t.cycles,
                    "response": t.response,
                    "start_date": t.start_date.isoformat() if t.start_date else None,
                    "end_date": t.end_date.isoformat() if t.end_date else None,
                }
                for t in treatments
            ],
        }

        if latest:
            result["results"] = json.loads(latest.results_json) if latest.results_json else {}
            result["files"] = json.loads(latest.files_json) if latest.files_json else []
            result["session_id"] = latest.session_id
        else:
            result["results"] = {}
            result["files"] = []

        return result
    finally:
        db.close()


@app.delete("/api/patients/{patient_id}")
async def delete_patient(patient_id: str):
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            raise HTTPException(404)
        db.delete(patient)
        db.commit()
        return {"ok": True}
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


@app.put("/api/patients/{patient_id}")
async def update_patient(patient_id: str, request: Request):
    body = await request.json()
    db = SessionLocal()
    try:
        p = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not p:
            raise HTTPException(404)
        field_converters = {
            "age": lambda v: int(v) if v not in (None, "") else None,
            "gender": lambda v: str(v) if v not in (None, "") else None,
            "kps_score": lambda v: int(v) if v not in (None, "") else None,
            "diagnosis_date": lambda v: date.fromisoformat(v) if v else None,
            "tumor_location": lambda v: str(v) if v not in (None, "") else None,
            "surgery_type": lambda v: str(v) if v not in (None, "") else None,
            "mgmt_status": lambda v: str(v) if v not in (None, "") else None,
            "idh1_status": lambda v: str(v) if v not in (None, "") else None,
            "notes": lambda v: str(v) if v not in (None, "") else None,
        }
        for field, converter in field_converters.items():
            if field in body:
                try:
                    setattr(p, field, converter(body[field]))
                except Exception:
                    pass
        db.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(400, str(e))
    finally:
        db.close()


# ---------------------------------------------------------------------------
# CSV import for bulk patient data
# ---------------------------------------------------------------------------

@app.post("/api/import-csv")
async def import_csv(file: UploadFile = File(...)):
    contents = await file.read()
    text = contents.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    db = SessionLocal()
    imported = 0
    updated = 0
    errors = []
    try:
        for row in reader:
            pid = row.get("patient_id", "").strip()
            if not pid:
                continue
            try:
                existing = db.query(Patient).filter(Patient.patient_id == pid).first()
                if existing:
                    if row.get("age"):
                        existing.age = int(row["age"])
                    if row.get("gender"):
                        existing.gender = row["gender"].strip()
                    if row.get("kps_score"):
                        existing.kps_score = int(row["kps_score"])
                    if row.get("mgmt_status"):
                        existing.mgmt_status = row["mgmt_status"].strip()
                    if row.get("idh1_status"):
                        existing.idh1_status = row["idh1_status"].strip()
                    if row.get("treatment_protocol"):
                        existing.treatment_protocol = row["treatment_protocol"].strip()
                    if row.get("survival_days"):
                        existing.survival_days = int(row["survival_days"])
                    if row.get("status"):
                        existing.status = row["status"].strip()
                    if row.get("notes"):
                        existing.notes = row["notes"].strip()
                    updated += 1
                else:
                    patient = Patient(
                        patient_id=pid,
                        age=int(row["age"]) if row.get("age") else None,
                        gender=row.get("gender", "").strip() or None,
                        kps_score=int(row["kps_score"]) if row.get("kps_score") else None,
                        mgmt_status=row.get("mgmt_status", "").strip() or None,
                        idh1_status=row.get("idh1_status", "").strip() or None,
                        treatment_protocol=row.get("treatment_protocol", "").strip() or None,
                        survival_days=int(row["survival_days"]) if row.get("survival_days") else None,
                        status=row.get("status", "unknown").strip() or "unknown",
                        notes=row.get("notes", "").strip() or None,
                        dataset_source="csv_import",
                    )
                    db.add(patient)
                    imported += 1
            except Exception as e:
                errors.append(f"{pid}: {e}")

        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, str(e))
    finally:
        db.close()

    return {
        "imported": imported,
        "updated": updated,
        "errors": errors,
        "total": imported + updated,
    }


@app.get("/api/export-csv")
async def export_csv():
    db = SessionLocal()
    try:
        patients = db.query(Patient).all()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "patient_id", "age", "gender", "kps_score", "mgmt_status",
            "idh1_status", "treatment_protocol", "survival_days", "status",
            "diagnosis_date", "tumor_location", "surgery_type",
            "risk_score", "risk_class", "tumor_volume_cm3", "survival_6m_pct", "notes",
        ])
        for p in patients:
            latest = (
                db.query(Analysis)
                .filter(Analysis.patient_pk == p.id)
                .order_by(Analysis.created_at.desc())
                .first()
            )
            writer.writerow([
                p.patient_id, p.age or "", p.gender or "", p.kps_score or "",
                p.mgmt_status or "", p.idh1_status or "", p.treatment_protocol or "",
                p.survival_days or "", p.status or "",
                p.diagnosis_date.isoformat() if p.diagnosis_date else "",
                p.tumor_location or "", p.surgery_type or "",
                round(latest.risk_score, 2) if latest and latest.risk_score is not None else "",
                latest.risk_class or "" if latest else "",
                round(latest.tumor_volume_cm3, 2) if latest and latest.tumor_volume_cm3 is not None else "",
                round(latest.survival_6m_pct, 1) if latest and latest.survival_6m_pct is not None else "",
                p.notes or "",
            ])
        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8-sig")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=patients_export.csv"}
        )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Treatment management
# ---------------------------------------------------------------------------

@app.post("/api/patients/{patient_id}/treatments")
async def add_treatment(patient_id: str, request: Request):
    body = await request.json()
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            raise HTTPException(404)

        treatment = Treatment(
            patient_pk=patient.id,
            drug_name=body["drug_name"],
            protocol=body.get("protocol"),
            dosage=body.get("dosage"),
            cycles=body.get("cycles"),
            response=body.get("response"),
            notes=body.get("notes"),
        )
        if body.get("start_date"):
            treatment.start_date = date.fromisoformat(body["start_date"])
        if body.get("end_date"):
            treatment.end_date = date.fromisoformat(body["end_date"])

        db.add(treatment)
        db.commit()
        return {"ok": True, "treatment_id": treatment.id}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(400, str(e))
    finally:
        db.close()


@app.get("/api/patients/{patient_id}/treatments")
async def get_treatments(patient_id: str):
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            raise HTTPException(404)
        treatments = db.query(Treatment).filter(Treatment.patient_pk == patient.id).all()
        return {
            "treatments": [
                {
                    "id": t.id,
                    "drug_name": t.drug_name,
                    "protocol": t.protocol,
                    "dosage": t.dosage,
                    "cycles": t.cycles,
                    "response": t.response,
                    "start_date": t.start_date.isoformat() if t.start_date else None,
                    "end_date": t.end_date.isoformat() if t.end_date else None,
                    "notes": t.notes,
                }
                for t in treatments
            ]
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Database viewer API
# ---------------------------------------------------------------------------

@app.get("/api/db/stats")
async def db_stats():
    db = SessionLocal()
    try:
        patient_count = db.query(Patient).count()
        analysis_count = db.query(Analysis).count()
        treatment_count = db.query(Treatment).count()

        with_age = db.query(Patient).filter(Patient.age.isnot(None)).count()
        with_mgmt = db.query(Patient).filter(Patient.mgmt_status.isnot(None)).count()
        with_analysis = db.query(Patient).filter(
            Patient.id.in_(db.query(Analysis.patient_pk).distinct())
        ).count()

        sources = {}
        for p in db.query(Patient).all():
            src = p.dataset_source or "unknown"
            sources[src] = sources.get(src, 0) + 1

        db_file = Path(__file__).resolve().parent / "gbmaid.db"
        db_size_mb = round(db_file.stat().st_size / (1024 * 1024), 2) if db_file.exists() else 0

        return {
            "tables": {
                "patients": patient_count,
                "analyses": analysis_count,
                "treatments": treatment_count,
            },
            "fill_rate": {
                "age": with_age,
                "mgmt": with_mgmt,
                "analyzed": with_analysis,
                "total": patient_count,
            },
            "sources": sources,
            "db_size_mb": db_size_mb,
        }
    finally:
        db.close()


@app.get("/api/db/table/{table_name}")
async def db_table(table_name: str, limit: int = 100, offset: int = 0):
    db = SessionLocal()
    try:
        if table_name == "patients":
            total = db.query(Patient).count()
            rows = db.query(Patient).order_by(Patient.id).offset(offset).limit(limit).all()
            data = [
                {
                    "id": p.id, "patient_id": p.patient_id, "age": p.age,
                    "gender": p.gender, "kps_score": p.kps_score,
                    "mgmt_status": p.mgmt_status, "idh1_status": p.idh1_status,
                    "treatment_protocol": p.treatment_protocol,
                    "survival_days": p.survival_days, "status": p.status,
                    "dataset_source": p.dataset_source, "notes": p.notes,
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                }
                for p in rows
            ]
        elif table_name == "analyses":
            total = db.query(Analysis).count()
            rows = db.query(Analysis).order_by(Analysis.id.desc()).offset(offset).limit(limit).all()
            data = [
                {
                    "id": a.id, "patient_pk": a.patient_pk,
                    "session_id": a.session_id, "report_id": a.report_id,
                    "risk_score": a.risk_score, "risk_class": a.risk_class,
                    "risk_label": a.risk_label, "survival_6m_pct": a.survival_6m_pct,
                    "tumor_volume_cm3": a.tumor_volume_cm3,
                    "core_volume_cm3": a.core_volume_cm3,
                    "enhancing_volume_cm3": a.enhancing_volume_cm3,
                    "surface_area_cm2": a.surface_area_cm2,
                    "sphericity": a.sphericity,
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a in rows
            ]
        elif table_name == "treatments":
            total = db.query(Treatment).count()
            rows = db.query(Treatment).order_by(Treatment.id.desc()).offset(offset).limit(limit).all()
            data = [
                {
                    "id": t.id, "patient_pk": t.patient_pk,
                    "drug_name": t.drug_name, "protocol": t.protocol,
                    "dosage": t.dosage, "cycles": t.cycles,
                    "response": t.response, "notes": t.notes,
                    "start_date": t.start_date.isoformat() if t.start_date else None,
                    "end_date": t.end_date.isoformat() if t.end_date else None,
                    "created_at": t.created_at.isoformat() if t.created_at else None,
                }
                for t in rows
            ]
        else:
            raise HTTPException(400, f"Unknown table: {table_name}")

        return {"table": table_name, "total": total, "offset": offset, "limit": limit, "rows": data}
    finally:
        db.close()


@app.get("/api/cohort-stats")
async def cohort_stats():
    db = SessionLocal()
    try:
        total_patients = db.query(Patient).count()
        analyzed = db.query(Analysis.patient_pk).distinct().count()

        analyses = db.query(Analysis).all()
        risk_dist = {"low": 0, "medium": 0, "high": 0}
        risk_sum = surv_sum = risk_count = 0
        for a in analyses:
            if a.risk_class in risk_dist:
                risk_dist[a.risk_class] += 1
            if a.risk_score is not None:
                risk_sum += a.risk_score
                risk_count += 1
            if a.survival_6m_pct is not None:
                surv_sum += a.survival_6m_pct

        avg_risk = round(risk_sum / risk_count, 1) if risk_count else 0
        avg_surv = round(surv_sum / risk_count, 1) if risk_count else 0

        mgmt_dist: dict = {}
        idh1_dist: dict = {}
        age_bins = {"<40": 0, "40-50": 0, "50-60": 0, "60-70": 0, ">70": 0}

        for p in db.query(Patient).all():
            mgmt_key = p.mgmt_status or "bilinmiyor"
            idh1_key = p.idh1_status or "bilinmiyor"
            mgmt_dist[mgmt_key] = mgmt_dist.get(mgmt_key, 0) + 1
            idh1_dist[idh1_key] = idh1_dist.get(idh1_key, 0) + 1
            if p.age is not None:
                if p.age < 40: age_bins["<40"] += 1
                elif p.age < 50: age_bins["40-50"] += 1
                elif p.age < 60: age_bins["50-60"] += 1
                elif p.age < 70: age_bins["60-70"] += 1
                else: age_bins[">70"] += 1

        return {
            "total_patients": total_patients,
            "analyzed": analyzed,
            "avg_risk": avg_risk,
            "avg_surv": avg_surv,
            "risk_dist": risk_dist,
            "mgmt_dist": mgmt_dist,
            "idh1_dist": idh1_dist,
            "age_bins": age_bins,
        }
    finally:
        db.close()


@app.get("/api/patients/{patient_id}/timeline")
async def patient_timeline(patient_id: str):
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            raise HTTPException(404)
        analyses = (
            db.query(Analysis)
            .filter(Analysis.patient_pk == patient.id)
            .order_by(Analysis.created_at.asc())
            .all()
        )
        return {
            "patient_id": patient_id,
            "timeline": [
                {
                    "report_id": a.report_id,
                    "risk_score": a.risk_score,
                    "risk_class": a.risk_class,
                    "risk_label": a.risk_label,
                    "survival_6m_pct": a.survival_6m_pct,
                    "tumor_volume_cm3": a.tumor_volume_cm3,
                    "created_at": a.created_at.strftime("%d.%m.%Y") if a.created_at else "",
                }
                for a in analyses
            ],
        }
    finally:
        db.close()


@app.get("/api/health")
async def health():
    return {"status": "ok", "nibabel": HAS_NIBABEL, "version": "5.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
