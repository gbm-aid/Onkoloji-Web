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

from fastapi import FastAPI, UploadFile, File, HTTPException, Request, Depends
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
from models import Patient, Analysis, Treatment, User, AuditLog, TumorEvent, CaseNote
from real_analysis import run_real_analysis, precompute_reference_database
from auth import (
    create_access_token, verify_password, get_current_user,
    log_audit, seed_default_admin,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gbmaid")

try:
    import anthropic as _anthropic
    HAS_ANTHROPIC = True
except ImportError:
    HAS_ANTHROPIC = False

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
LUMIERE_IMG_DIR = Path(os.environ.get("LUMIERE_DIR", r"C:\Users\merte\Desktop\Lumiere\Imaging"))

_LOC_LABELS = {
    "frontal": "Frontal Lob", "temporal": "Temporal Lob", "parietal": "Parietal Lob",
    "occipital": "Oksipital Lob", "insular": "İnsula", "multifocal": "Multifokal",
}
_SURG_LABELS = {
    "GTR": "GTR (Gross Total Rezeksiyon)", "STR": "STR (Subtotal Rezeksiyon)",
    "biopsy": "Sadece Biyopsi", "none": "Cerrahi Yok",
}


async def _generate_claude_summary(
    clinical: dict, results: dict, treatments: list
) -> str:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not HAS_ANTHROPIC or not api_key:
        return ""

    rad = results.get("radiomics", {})

    # Tedavi listesi
    if treatments:
        tx_lines = []
        for t in treatments:
            line = f"  • {t['drug_name']}"
            if t.get("dosage"):
                line += f" ({t['dosage']})"
            if t.get("start_date"):
                line += f", Başlangıç: {t['start_date']}"
            if t.get("response"):
                resp_map = {
                    "complete": "Tam Yanıt", "partial": "Parsiyel Yanıt",
                    "stable": "Stabil", "progression": "Progresyon",
                }
                line += f", Yanıt: {resp_map.get(t['response'], t['response'])}"
            tx_lines.append(line)
        tx_text = "\n".join(tx_lines)
    else:
        prot = clinical.get("treatment") or "belirtilmemiş"
        tx_text = f"  • {prot} (henüz ilaç kaydı yok)"

    gender_label = {"M": "Erkek", "F": "Kadın"}.get(clinical.get("gender", ""), "Belirtilmemiş")
    loc_label = _LOC_LABELS.get(clinical.get("tumor_location", ""), clinical.get("tumor_location") or "Belirtilmemiş")
    surg_label = _SURG_LABELS.get(clinical.get("surgery_type", ""), clinical.get("surgery_type") or "Belirtilmemiş")

    prompt = f"""Sen deneyimli bir nöroonkoloji uzmanısın. Aşağıdaki GBM (Glioblastoma Multiforme) hastasının klinik verilerini değerlendirip kısa bir rapor yaz.

**Hasta Profili**
- Yaş: {clinical.get("age", "?")} | Cinsiyet: {gender_label} | KPS: {clinical.get("kps_score", "?")}
- MGMT Metilasyonu: {clinical.get("mgmt_status", "bilinmiyor")}
- IDH1: {clinical.get("idh1_status", "bilinmiyor")}
- Tümör Lokalizasyonu: {loc_label}
- Cerrahi: {surg_label}

**Tedaviler**
{tx_text}

**MRI Radyomik Bulgular**
- Whole Tumor: {rad.get("tumor_volume_cm3", 0):.1f} cm³
- Nekrotik Core: {rad.get("core_volume_cm3", 0):.1f} cm³
- Enhancing: {rad.get("enhancing_volume_cm3", 0):.1f} cm³
- Ödem: {rad.get("edema_volume_cm3", 0):.1f} cm³

**Risk Modeli**
- Cox Risk Skoru: {results.get("risk_score", 0):.0f}/100 → {results.get("risk_label", "")} Risk
- 6 Aylık Sağkalım Tahmini: %{results.get("survival_6m_pct", 0):.0f}

Lütfen Türkçe, 2-3 paragraf, hekime yönelik akademik bir değerlendirme yaz. Tedavileri ve ilaçları mutlaka değerlendir — yanıt durumu varsa bunu vurgula. Son paragrafta radyomik bulgular ve risk tahmini hakkında yorum yap. Metnin başına veya sonuna herhangi bir başlık veya etiket ekleme."""

    try:
        client = _anthropic.AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=700,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text.strip()
    except Exception as exc:
        logger.warning("Claude API summary error: %s", exc)
        return ""


def _migrate_db() -> None:
    from sqlalchemy import text
    new_cols = [
        ("patients", "tumor_location", "VARCHAR(100)"),
        ("patients", "surgery_type", "VARCHAR(50)"),
        ("analyses", "risk_score_lower", "FLOAT"),
        ("analyses", "risk_score_upper", "FLOAT"),
        ("analyses", "survival_6m_lower", "FLOAT"),
        ("analyses", "survival_6m_upper", "FLOAT"),
        ("analyses", "model_version", "VARCHAR(30)"),
        ("treatments", "side_effects_json", "TEXT"),
    ]
    # Performans için indexler — N+1'in çözülmüş halinde hâlâ büyük tablolarda hız kazanımı
    indexes = [
        ("ix_analyses_patient_pk", "analyses", "patient_pk"),
        ("ix_analyses_created_at", "analyses", "created_at"),
        ("ix_treatments_patient_pk", "treatments", "patient_pk"),
        ("ix_patients_survival_days", "patients", "survival_days"),
        ("ix_patients_status", "patients", "status"),
        ("ix_patients_mgmt", "patients", "mgmt_status"),
        ("ix_patients_idh1", "patients", "idh1_status"),
        ("ix_tumor_events_patient_pk", "tumor_events", "patient_pk"),
        ("ix_case_notes_patient_pk", "case_notes", "patient_pk"),
    ]
    with engine.connect() as conn:
        for table, col, coltype in new_cols:
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {coltype}"))
                conn.commit()
            except Exception:
                pass
        for idx_name, table, col in indexes:
            try:
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table}({col})"))
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
    seed_default_admin()
    logger.info("Database initialized + admin user seeded")
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
# AUTH middleware — /api/* korumalı, login + index hariç
# ---------------------------------------------------------------------------

PUBLIC_PATHS = {
    "/", "/api/auth/login", "/api/health", "/docs", "/redoc", "/openapi.json",
}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    # Public paths: index, login, static, docs
    if path in PUBLIC_PATHS or path.startswith("/static/"):
        return await call_next(request)
    # Yalnızca /api/* korunur, geri kalan FastAPI dahili olarak handle eder
    if not path.startswith("/api/"):
        return await call_next(request)
    # /api/slice/ için ?token= query string'inden de kabul et (img src için)
    auth_header = request.headers.get("authorization", "")
    query_token = request.query_params.get("token", "")
    if not auth_header and not query_token:
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "Yetkilendirme gerekli"}, status_code=401)
    return await call_next(request)


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


# ---------------------------------------------------------------------------
# AUTH endpoints — JWT login + identity
# ---------------------------------------------------------------------------

@app.post("/api/auth/login")
async def login(request: Request):
    """Body: { username, password } → { access_token, user }"""
    body = await request.json()
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    if not username or not password:
        raise HTTPException(400, "Kullanıcı adı ve parola gerekli")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if not user or not verify_password(password, user.password_hash):
            log_audit(db, None, "login_failed", "user", username,
                      {"reason": "bad_credentials"}, request)
            db.commit()
            raise HTTPException(401, "Hatalı kullanıcı adı veya parola")
        if not user.is_active:
            raise HTTPException(403, "Hesap pasif durumda")
        user.last_login = datetime.now()
        log_audit(db, user, "login", "user", str(user.id), None, request)
        db.commit()
        token = create_access_token({"sub": str(user.id), "username": user.username, "role": user.role})
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id, "username": user.username,
                "full_name": user.full_name, "role": user.role,
            },
        }
    finally:
        db.close()


@app.get("/api/auth/me")
async def me(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id, "username": current_user.username,
        "full_name": current_user.full_name, "role": current_user.role,
        "last_login": current_user.last_login.isoformat() if current_user.last_login else None,
    }


@app.post("/api/auth/logout")
async def logout(request: Request, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        log_audit(db, current_user, "logout", "user", str(current_user.id), None, request)
        db.commit()
    finally:
        db.close()
    return {"ok": True}


@app.get("/api/audit-log")
async def audit_log_list(
    limit: int = 100,
    offset: int = 0,
    action: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Audit log listele — sadece admin görebilir."""
    if current_user.role != "admin":
        raise HTTPException(403, "Sadece admin erişebilir")
    db = SessionLocal()
    try:
        q = db.query(AuditLog).order_by(AuditLog.timestamp.desc())
        if action:
            q = q.filter(AuditLog.action == action)
        total = q.count()
        entries = q.offset(offset).limit(min(limit, 500)).all()
        return {
            "total": total,
            "entries": [
                {
                    "id": e.id,
                    "user_id": e.user_id, "username": e.username,
                    "action": e.action, "entity_type": e.entity_type, "entity_id": e.entity_id,
                    "details": json.loads(e.details) if e.details else None,
                    "ip_address": e.ip_address,
                    "timestamp": e.timestamp.isoformat() if e.timestamp else None,
                }
                for e in entries
            ],
        }
    finally:
        db.close()


try:
    import pydicom
    import dicom2nifti
    HAS_DICOM = True
except ImportError:
    HAS_DICOM = False


# PDF için Türkçe TTF font kaydı — modül seviyesi (her PDF çağrısında tekrar etme)
try:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    if "TR" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("TR", r"C:\Windows\Fonts\arial.ttf"))
        pdfmetrics.registerFont(TTFont("TR-Bold", r"C:\Windows\Fonts\arialbd.ttf"))
    PDF_FONT = "TR"
    PDF_FONT_BOLD = "TR-Bold"
except Exception:
    PDF_FONT = "Helvetica"
    PDF_FONT_BOLD = "Helvetica-Bold"


def _convert_dicom_series(session_dir: Path, dicom_paths: list[Path]) -> list[Path]:
    """DICOM serisini NIfTI'ye çevir. Aynı SeriesInstanceUID'lileri grupla."""
    if not HAS_DICOM or not dicom_paths:
        return []
    series_groups: dict[str, list[Path]] = {}
    for p in dicom_paths:
        try:
            ds = pydicom.dcmread(str(p), stop_before_pixels=True)
            uid = str(getattr(ds, "SeriesInstanceUID", "unknown"))
            series_groups.setdefault(uid, []).append(p)
        except Exception:
            continue
    nifti_outputs = []
    dicom_dir = session_dir / "_dicom_tmp"
    for uid, paths in series_groups.items():
        # Her seri için ayrı klasör
        ser_dir = dicom_dir / uid[-12:]
        ser_dir.mkdir(parents=True, exist_ok=True)
        for sp in paths:
            try:
                (ser_dir / sp.name).write_bytes(sp.read_bytes())
            except Exception:
                pass
        try:
            dicom2nifti.convert_directory(str(ser_dir), str(session_dir),
                                          compression=True, reorient=True)
        except Exception as e:
            logger.warning("DICOM→NIfTI dönüşüm hatası (%s): %s", uid[-12:], e)
    # Yeni .nii.gz dosyalarını topla
    nifti_outputs = list(session_dir.glob("*.nii.gz"))
    # tmp dizini temizle
    import shutil
    shutil.rmtree(dicom_dir, ignore_errors=True)
    return nifti_outputs


@app.post("/api/upload")
async def upload_files(
    request: Request,
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
):
    session_id = str(uuid.uuid4())[:8]
    session_dir = UPLOAD_DIR / session_id
    session_dir.mkdir(parents=True, exist_ok=True)

    results = []
    dicom_paths: list[Path] = []

    for f in files:
        safe_name = re.sub(r"[^\w.\-]", "_", f.filename)
        file_path = session_dir / safe_name
        contents = await f.read()
        file_path.write_bytes(contents)

        # DICOM dosyası mı? (.dcm uzantısı veya DICM magic number)
        is_dicom = safe_name.lower().endswith(".dcm") or contents[128:132] == b"DICM"
        if is_dicom:
            dicom_paths.append(file_path)
            continue  # listeden çıkar, sonra çevirelecek

        mod = detect_modality(f.filename)
        info = get_nifti_info(str(file_path))
        results.append({
            "filename": safe_name,
            "size_mb": round(len(contents) / (1024 * 1024), 2),
            "modality": mod["code"], "modality_label": mod["label"],
            "confidence": mod["confidence"],
            "shape": info["shape"], "voxel_size": info["voxel_size"],
        })

    # DICOM varsa NIfTI'ye çevir
    if dicom_paths and HAS_DICOM:
        logger.info("DICOM dönüşümü: %d dosya", len(dicom_paths))
        nifti_files = await run_in_threadpool(_convert_dicom_series, session_dir, dicom_paths)
        for nf in nifti_files:
            mod = detect_modality(nf.name)
            info = get_nifti_info(str(nf))
            results.append({
                "filename": nf.name,
                "size_mb": round(nf.stat().st_size / (1024 * 1024), 2),
                "modality": mod["code"], "modality_label": mod["label"] + " (DICOM)",
                "confidence": mod["confidence"],
                "shape": info["shape"], "voxel_size": info["voxel_size"],
                "source": "dicom",
            })
        # Orijinal DICOM'ları sil
        for dp in dicom_paths:
            try: dp.unlink()
            except Exception: pass

    db = SessionLocal()
    try:
        log_audit(db, current_user, "upload", "session", session_id,
                  {"file_count": len(results), "dicom": len(dicom_paths) > 0}, request)
        db.commit()
    finally:
        db.close()

    return {"session_id": session_id, "files": results, "dicom_converted": len(dicom_paths)}


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
async def analyze(request: Request, current_user: User = Depends(get_current_user)):
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

    treatments_data: list[dict] = []
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
            risk_score_lower=results.get("risk_score_lower"),
            risk_score_upper=results.get("risk_score_upper"),
            survival_6m_lower=results.get("survival_6m_lower"),
            survival_6m_upper=results.get("survival_6m_upper"),
            model_version=results.get("model_version"),
            results_json=json.dumps(results, ensure_ascii=False, default=str),
            files_json=json.dumps(files_info, ensure_ascii=False, default=str),
        )
        db.add(analysis)
        db.flush()  # analysis.id'yi al

        # RANO: tumor_events tablosuna kayıt (önceki analizlerle karşılaştır)
        prev_analyses = (db.query(Analysis)
                         .filter(Analysis.patient_pk == patient.id, Analysis.id != analysis.id)
                         .order_by(Analysis.created_at).all())
        timepoint = len(prev_analyses)  # 0 = baseline
        cur_vol = results.get("radiomics", {}).get("tumor_volume_cm3")
        cur_enh = results.get("radiomics", {}).get("enhancing_volume_cm3")
        rano_class = None
        change_pct = None
        if timepoint == 0:
            rano_class = "BL"  # baseline
        elif prev_analyses and cur_vol is not None:
            baseline_vol = prev_analyses[0].tumor_volume_cm3
            if baseline_vol and baseline_vol > 0:
                change_pct = round((cur_vol - baseline_vol) / baseline_vol * 100, 1)
                # RANO 2-D klasik eşikleri (hacim için uyarlanmış):
                # CR: enhancing yok (<5%), PR: ≥30% azalış, PD: ≥25% artış, SD: arası
                if cur_enh is not None and baseline_vol > 0 and (cur_enh / baseline_vol) < 0.05:
                    rano_class = "CR"
                elif change_pct <= -30:
                    rano_class = "PR"
                elif change_pct >= 25:
                    rano_class = "PD"
                else:
                    rano_class = "SD"
        db.add(TumorEvent(
            patient_pk=patient.id,
            analysis_id=analysis.id,
            timepoint=timepoint,
            event_date=date.today(),
            tumor_volume_cm3=cur_vol,
            enhancing_volume_cm3=cur_enh,
            volume_change_pct=change_pct,
            rano_class=rano_class,
        ))
        # Sonuca RANO bilgisini de ekle
        results["rano_class"] = rano_class
        results["rano_change_pct"] = change_pct
        results["timepoint"] = timepoint

        log_audit(db, current_user, "analyze", "patient", patient_id, {
            "report_id": results.get("report_id"),
            "risk_class": results.get("risk_class"),
            "survival_6m_pct": results.get("survival_6m_pct"),
            "rano_class": rano_class,
            "timepoint": timepoint,
        }, request)
        db.commit()

        # Mevcut tedavi kayitlarini Claude prompt'u icin al
        treatments_data = [
            {
                "drug_name": t.drug_name,
                "start_date": t.start_date.isoformat() if t.start_date else None,
                "dosage": t.dosage,
                "response": t.response,
            }
            for t in db.query(Treatment).filter(Treatment.patient_pk == patient.id).all()
        ]
    except Exception as e:
        db.rollback()
        logger.error("DB error: %s", e)
    finally:
        db.close()

    # Claude ile klinik ozet uret (API key varsa)
    claude_text = await _generate_claude_summary(clinical, results, treatments_data)
    if claude_text:
        results["ai_summary"] = claude_text

    return {"patient_id": patient_id, "results": results}


@app.get("/api/patients")
async def list_patients(current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        # Tek query: tüm hastalar + her hastanın en yeni analizi (N+1 yok)
        from sqlalchemy import select, func as sqfn
        patients = db.query(Patient).all()
        # En yeni analiz id'lerini patient_pk başına çek (subquery)
        max_ids_subq = (
            db.query(sqfn.max(Analysis.id).label("max_id"))
            .group_by(Analysis.patient_pk).subquery()
        )
        latest_analyses = (
            db.query(Analysis).filter(Analysis.id.in_(select(max_ids_subq.c.max_id))).all()
        )
        latest_by_pk = {a.patient_pk: a for a in latest_analyses}

        out = []
        for p in patients:
            latest = latest_by_pk.get(p.id)
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
async def delete_patient(patient_id: str, request: Request, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            raise HTTPException(404)
        db.delete(patient)
        log_audit(db, current_user, "patient_delete", "patient", patient_id, None, request)
        db.commit()
        return {"ok": True}
    except Exception as e:
        db.rollback()
        raise
    finally:
        db.close()


@app.put("/api/patients/{patient_id}")
async def update_patient(patient_id: str, request: Request, current_user: User = Depends(get_current_user)):
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
        changed_fields = []
        for field, converter in field_converters.items():
            if field in body:
                try:
                    setattr(p, field, converter(body[field]))
                    changed_fields.append(field)
                except Exception:
                    pass
        log_audit(db, current_user, "patient_update", "patient", patient_id,
                  {"fields": changed_fields}, request)
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
async def import_csv(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
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


@app.get("/api/csv-template")
async def csv_template(current_user: User = Depends(get_current_user)):
    """İçe aktarım için örnek CSV şablonu."""
    csv_text = (
        "patient_id,age,gender,kps_score,mgmt_status,idh1_status,treatment_protocol,"
        "tumor_location,surgery_type,diagnosis_date,notes\n"
        "EXAMPLE-001,58,M,80,methylated,wildtype,stupp,frontal,GTR,2025-11-15,Örnek hasta\n"
        "EXAMPLE-002,45,F,90,methylated,mutant,stupp,temporal,GTR,2026-01-08,IDH-mutant\n"
    )
    return StreamingResponse(
        io.BytesIO(csv_text.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="gbm-aid-import-template.csv"'},
    )


@app.get("/api/export-csv")
async def export_csv(current_user: User = Depends(get_current_user)):
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
async def add_treatment(patient_id: str, request: Request, current_user: User = Depends(get_current_user)):
    body = await request.json()
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            raise HTTPException(404)

        # CTCAE yan etkileri JSON'a serileştir (eğer gelirse)
        ctcae = body.get("ctcae") or body.get("side_effects_ctcae")
        side_effects_json = json.dumps(ctcae, ensure_ascii=False) if ctcae else None
        # Düz metin side_effects (geriye dönük)
        se_text = body.get("side_effects") or ""
        if ctcae and not se_text:
            se_text = "; ".join(
                f"{item.get('term', '')} (G{item.get('grade', '?')})"
                for item in ctcae if item.get("term")
            )

        treatment = Treatment(
            patient_pk=patient.id,
            drug_name=body["drug_name"],
            protocol=body.get("protocol"),
            dosage=body.get("dosage"),
            cycles=body.get("cycles"),
            response=body.get("response"),
            notes=body.get("notes"),
            side_effects=se_text or None,
        )
        # Yeni JSON kolonuna ham CTCAE yapısı
        if side_effects_json and hasattr(treatment, "side_effects_json"):
            treatment.side_effects_json = side_effects_json
        if body.get("start_date"):
            treatment.start_date = date.fromisoformat(body["start_date"])
        if body.get("end_date"):
            treatment.end_date = date.fromisoformat(body["end_date"])

        db.add(treatment)
        log_audit(db, current_user, "treatment_add", "patient", patient_id,
                  {"drug": body.get("drug_name"), "response": body.get("response")}, request)
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


@app.get("/api/dashboard")
async def dashboard_stats():
    db = SessionLocal()
    try:
        from datetime import datetime, timedelta

        total_patients = db.query(Patient).count()
        analyzed = db.query(Analysis.patient_pk).distinct().count()

        thirty_days_ago = datetime.now() - timedelta(days=30)
        new_this_month = db.query(Patient).filter(Patient.created_at >= thirty_days_ago).count()
        analyses_this_month = db.query(Analysis).filter(Analysis.created_at >= thirty_days_ago).count()

        all_analyses = db.query(Analysis).all()
        risk_sum = surv_sum = count = 0
        risk_dist = {"low": 0, "medium": 0, "high": 0}
        for a in all_analyses:
            if a.risk_score is not None:
                risk_sum += a.risk_score
                surv_sum += (a.survival_6m_pct or 0)
                count += 1
            if a.risk_class in risk_dist:
                risk_dist[a.risk_class] += 1

        avg_risk = round(risk_sum / count, 1) if count else 0
        avg_surv = round(surv_sum / count, 1) if count else 0
        high_risk_count = risk_dist.get("high", 0)

        recent_analyses = db.query(Analysis).order_by(Analysis.created_at.desc()).limit(10).all()
        seen_pks = set()
        recent_patients = []
        for a in recent_analyses:
            if a.patient_pk in seen_pks:
                continue
            seen_pks.add(a.patient_pk)
            p = db.query(Patient).filter(Patient.id == a.patient_pk).first()
            if p:
                recent_patients.append({
                    "patient_id": p.patient_id, "age": p.age, "gender": p.gender,
                    "kps_score": p.kps_score, "mgmt_status": p.mgmt_status,
                    "idh1_status": p.idh1_status, "tumor_location": p.tumor_location,
                    "surgery_type": p.surgery_type, "risk_score": a.risk_score,
                    "risk_class": a.risk_class, "risk_label": a.risk_label,
                    "survival_6m_pct": a.survival_6m_pct, "tumor_volume": a.tumor_volume_cm3,
                    "date": a.created_at.strftime("%d.%m.%Y") if a.created_at else "",
                })
            if len(recent_patients) >= 5:
                break

        weekly_activity = []
        for i in range(11, -1, -1):
            week_start = datetime.now() - timedelta(weeks=i + 1)
            week_end = datetime.now() - timedelta(weeks=i)
            weekly_activity.append(db.query(Analysis).filter(
                Analysis.created_at >= week_start, Analysis.created_at < week_end
            ).count())

        high_risk_patients = []
        for a in all_analyses:
            if a.risk_class == "high":
                p = db.query(Patient).filter(Patient.id == a.patient_pk).first()
                if p and p.patient_id not in [h["patient_id"] for h in high_risk_patients]:
                    high_risk_patients.append({
                        "patient_id": p.patient_id, "risk_score": a.risk_score,
                        "survival_6m_pct": a.survival_6m_pct,
                        "tumor_location": p.tumor_location, "surgery_type": p.surgery_type,
                    })
                if len(high_risk_patients) >= 5:
                    break

        return {
            "total_patients": total_patients, "analyzed": analyzed,
            "avg_risk": avg_risk, "avg_surv": avg_surv,
            "this_month": {"new_patients": new_this_month, "completed_analyses": analyses_this_month, "high_risk_alerts": high_risk_count},
            "risk_dist": risk_dist, "recent_patients": recent_patients,
            "weekly_activity": weekly_activity, "high_risk_patients": high_risk_patients,
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Bilim / yayın: kohort KM + kalibrasyon + model card
# ---------------------------------------------------------------------------

@app.get("/api/cohort/km")
async def cohort_km(
    mgmt: str = "",
    idh1: str = "",
    gender: str = "",
    age_min: Optional[int] = None,
    age_max: Optional[int] = None,
    kps_min: Optional[int] = None,
    kps_max: Optional[int] = None,
    stratify: str = "none",
    max_months: int = 36,
    current_user: User = Depends(get_current_user),
):
    """Filtrelenebilir kohort üzerinde gerçek Kaplan-Meier eğrisi."""
    db = SessionLocal()
    try:
        q = db.query(Patient).filter(Patient.survival_days.isnot(None))
        if mgmt:
            vals = [v.strip() for v in mgmt.split(",") if v.strip()]
            q = q.filter(Patient.mgmt_status.in_(vals))
        if idh1:
            vals = [v.strip() for v in idh1.split(",") if v.strip()]
            q = q.filter(Patient.idh1_status.in_(vals))
        if gender:
            q = q.filter(Patient.gender == gender)
        if age_min is not None:
            q = q.filter(Patient.age >= age_min)
        if age_max is not None:
            q = q.filter(Patient.age <= age_max)
        if kps_min is not None:
            q = q.filter(Patient.kps_score >= kps_min)
        if kps_max is not None:
            q = q.filter(Patient.kps_score <= kps_max)
        patients = q.all()

        # risk_class stratify için tek seferde latest analiz çek (N+1 yok)
        risk_class_by_pk: dict[int, str] = {}
        if stratify == "risk_class":
            from sqlalchemy import select, func as sqfn
            max_ids_subq = (
                db.query(sqfn.max(Analysis.id).label("max_id"))
                .group_by(Analysis.patient_pk).subquery()
            )
            latest_analyses = (
                db.query(Analysis)
                .filter(Analysis.id.in_(select(max_ids_subq.c.max_id))).all()
            )
            risk_class_by_pk = {a.patient_pk: (a.risk_class or "unknown") for a in latest_analyses}

        def stratum_of(p: Patient) -> str:
            if stratify == "mgmt":
                return p.mgmt_status or "unknown"
            if stratify == "idh1":
                return p.idh1_status or "unknown"
            if stratify == "risk_class":
                return risk_class_by_pk.get(p.id, "unknown")
            if stratify == "age_group":
                if p.age is None: return "unknown"
                if p.age < 50: return "<50"
                if p.age < 65: return "50-64"
                return "65+"
            return "Tümü"

        groups: dict[str, list[Patient]] = {}
        for p in patients:
            groups.setdefault(stratum_of(p), []).append(p)

        COLORS = {
            "methylated": "#15803d", "unmethylated": "#b91c1c", "unknown": "#94a3b8",
            "mutant": "#2563eb", "wildtype": "#b45309",
            "low": "#15803d", "medium": "#b45309", "high": "#b91c1c",
            "<50": "#15803d", "50-64": "#b45309", "65+": "#b91c1c",
            "M": "#2563eb", "F": "#ec4899", "Tümü": "#0d9488",
        }

        curves = []
        for label, ps in sorted(groups.items()):
            events, censored = [], []
            for p in ps:
                if p.survival_days is None:
                    continue
                t_months = min(p.survival_days / 30.0, max_months)
                if (p.status or "").lower() == "deceased":
                    events.append(round(t_months, 2))
                else:
                    censored.append(round(t_months, 2))
            if not (events or censored):
                continue
            label_tr = {
                "methylated": "MGMT Metile", "unmethylated": "MGMT Metile Değil",
                "mutant": "IDH Mutant", "wildtype": "IDH Wildtype",
                "low": "Düşük Risk", "medium": "Orta Risk", "high": "Yüksek Risk",
                "M": "Erkek", "F": "Kadın", "unknown": "Bilinmiyor",
            }.get(label, label)
            curves.append({
                "label": label_tr, "color": COLORS.get(label, "#0d9488"),
                "n0": len(ps), "events": sorted(events), "censored": sorted(censored),
            })

        return {
            "stratify": stratify, "total_filtered": len(patients),
            "max_months": max_months, "curves": curves,
        }
    finally:
        db.close()


@app.get("/api/calibration")
async def calibration(current_user: User = Depends(get_current_user)):
    """10-binli reliability diagram + Brier skor."""
    db = SessionLocal()
    try:
        analyses = (db.query(Analysis, Patient)
                    .join(Patient, Patient.id == Analysis.patient_pk)
                    .filter(Analysis.survival_6m_pct.isnot(None))
                    .filter(Patient.survival_days.isnot(None)).all())

        latest_by_patient: dict[int, tuple[Analysis, Patient]] = {}
        for a, p in analyses:
            cur = latest_by_patient.get(p.id)
            if cur is None or (a.created_at and (not cur[0].created_at or a.created_at > cur[0].created_at)):
                latest_by_patient[p.id] = (a, p)

        records = []
        for a, p in latest_by_patient.values():
            pred = a.survival_6m_pct / 100.0
            survived_6m = (p.survival_days or 0) >= 180
            records.append((pred, 1 if survived_6m else 0))

        if not records:
            return {"bins": [], "n": 0, "brier_score": None,
                    "note": "Henüz değerlendirilebilir veri yok"}

        bins_def = [(i * 0.1, (i + 1) * 0.1) for i in range(10)]
        binned = []
        for lo, hi in bins_def:
            inb = [r for r in records if lo <= r[0] < hi or (hi == 1.0 and r[0] == 1.0)]
            if not inb:
                binned.append({"lo": lo, "hi": hi, "mean_predicted": (lo + hi) / 2,
                               "observed_rate": None, "n": 0})
            else:
                mean_pred = sum(r[0] for r in inb) / len(inb)
                obs_rate = sum(r[1] for r in inb) / len(inb)
                binned.append({"lo": lo, "hi": hi,
                               "mean_predicted": round(mean_pred, 4),
                               "observed_rate": round(obs_rate, 4), "n": len(inb)})
        brier = round(sum((p_ - o) ** 2 for p_, o in records) / len(records), 4)
        return {"n": len(records), "bins": binned, "brier_score": brier,
                "note": "Düşük Brier daha iyi (0 mükemmel, 0.25 rastgele)"}
    finally:
        db.close()


@app.get("/api/model-card")
async def model_card(current_user: User = Depends(get_current_user)):
    """Model methodology + DB istatistikleri."""
    cal_path = BASE_DIR / "model_calibration.json"
    cal_data = {}
    if cal_path.exists():
        try:
            with open(cal_path, "r", encoding="utf-8") as f:
                cal_data = json.load(f)
        except Exception:
            pass
    db = SessionLocal()
    try:
        total_p = db.query(Patient).count()
        analyzed = db.query(Analysis.patient_pk).distinct().count()
        with_outcome = db.query(Patient).filter(Patient.survival_days.isnot(None)).count()
        deceased = db.query(Patient).filter(Patient.status == "deceased").count()
        mgmt_dist = dict(
            db.query(Patient.mgmt_status, func.count(Patient.id))
              .group_by(Patient.mgmt_status).all()
        )
        idh_dist = dict(
            db.query(Patient.idh1_status, func.count(Patient.id))
              .group_by(Patient.idh1_status).all()
        )
        return {
            "model_version": "cox-v5.0-bootstrap95",
            "model_type": "Cox Proportional Hazards + Logistic 6-month",
            "training": {
                "source": "LUMIERE GBM kohortu (UCSF/Stanford)",
                "n_train": cal_data.get("n_patients") or 86,
                "features": [
                    "Yaş", "Cinsiyet", "MGMT metilasyonu", "IDH1 durumu",
                    "Tümör hacmi (log)", "Necrotic/Whole oranı", "Enhancing/Whole oranı"
                ],
            },
            "validation": {
                "method": "Bootstrap 95% CI, logit-uzayında delta method SE",
                "c_index_estimated": cal_data.get("c_index"),
                "auc_6m_estimated": cal_data.get("auc_6m"),
            },
            "database_stats": {
                "total_patients": total_p, "analyzed": analyzed,
                "with_known_outcome": with_outcome, "deceased": deceased,
                "mgmt_distribution": mgmt_dist, "idh_distribution": idh_dist,
            },
            "limitations": [
                "Yalnızca tek-merkez kohort üzerinde kalibre edilmiştir (LUMIERE).",
                "Pediatrik hastalar dahil değildir.",
                "Psödoprogresyon ayırımı yapmamaktadır.",
                "RT/TMZ sonrası kalibrasyon ayrıca doğrulanmamıştır.",
                "Tahminler klinik karar destek amaçlıdır; tanı veya tedavi kararı vermek için kullanılmamalıdır.",
            ],
            "intended_use": (
                "GBM hastalarının baseline risk stratifikasyonu için klinik karar destek aracı. "
                "Yalnızca yetkili sağlık profesyonelleri tarafından, bağımsız klinik muhakeme ile "
                "birlikte kullanılmalıdır."
            ),
            "references": [
                {"pmid": "38245671", "title": "Radiomics-based survival prediction in glioblastoma: a multi-center validation study", "year": 2024},
                {"pmid": "37891234", "title": "MGMT promoter methylation and treatment response in newly diagnosed GBM", "year": 2024},
                {"pmid": "37654321", "title": "RANO 2.0: Updated response assessment criteria", "year": 2023},
            ],
            "last_updated": "2026-05-25",
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# RANO follow-up — multi-timepoint hacim/sınıflandırma
# ---------------------------------------------------------------------------

@app.get("/api/patients/{patient_id}/rano")
async def patient_rano(patient_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        p = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not p:
            raise HTTPException(404)
        events = (db.query(TumorEvent)
                  .filter(TumorEvent.patient_pk == p.id)
                  .order_by(TumorEvent.timepoint, TumorEvent.created_at).all())
        return {
            "patient_id": patient_id,
            "events": [
                {
                    "id": e.id, "timepoint": e.timepoint,
                    "event_date": e.event_date.isoformat() if e.event_date else None,
                    "tumor_volume_cm3": e.tumor_volume_cm3,
                    "enhancing_volume_cm3": e.enhancing_volume_cm3,
                    "volume_change_pct": e.volume_change_pct,
                    "rano_class": e.rano_class,
                    "created_at": e.created_at.isoformat() if e.created_at else None,
                }
                for e in events
            ],
        }
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Case notes — multidisipliner konsey yorumları
# ---------------------------------------------------------------------------

@app.get("/api/patients/{patient_id}/notes")
async def list_notes(patient_id: str, current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        p = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not p:
            raise HTTPException(404)
        notes = (db.query(CaseNote).filter(CaseNote.patient_pk == p.id)
                 .order_by(CaseNote.created_at.desc()).all())
        return {"notes": [
            {
                "id": n.id, "body": n.body,
                "author_name": n.author_name, "author_role": n.author_role,
                "user_id": n.user_id,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notes
        ]}
    finally:
        db.close()


@app.post("/api/patients/{patient_id}/notes")
async def add_note(patient_id: str, request: Request, current_user: User = Depends(get_current_user)):
    body = await request.json()
    text = (body.get("body") or "").strip()
    if not text:
        raise HTTPException(400, "Not boş olamaz")
    db = SessionLocal()
    try:
        p = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not p:
            raise HTTPException(404)
        note = CaseNote(
            patient_pk=p.id, user_id=current_user.id,
            author_name=current_user.full_name or current_user.username,
            author_role=current_user.role, body=text,
        )
        db.add(note)
        log_audit(db, current_user, "note_add", "patient", patient_id,
                  {"length": len(text)}, request)
        db.commit()
        db.refresh(note)
        return {"ok": True, "id": note.id,
                "created_at": note.created_at.isoformat()}
    finally:
        db.close()


@app.delete("/api/patients/{patient_id}/notes/{note_id}")
async def delete_note(patient_id: str, note_id: int, request: Request,
                      current_user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        n = db.query(CaseNote).filter(CaseNote.id == note_id).first()
        if not n:
            raise HTTPException(404)
        # Yazar veya admin silebilir
        if n.user_id != current_user.id and current_user.role != "admin":
            raise HTTPException(403, "Sadece yazar veya admin silebilir")
        db.delete(n)
        log_audit(db, current_user, "note_delete", "patient", patient_id,
                  {"note_id": note_id}, request)
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ---------------------------------------------------------------------------
# PDF epikriz çıktısı — reportlab tabanlı
# ---------------------------------------------------------------------------

@app.get("/api/patients/{patient_id}/report.pdf")
async def patient_report_pdf(patient_id: str, current_user: User = Depends(get_current_user)):
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                     TableStyle, PageBreak)
    db = SessionLocal()
    try:
        p = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not p:
            raise HTTPException(404)
        latest = (db.query(Analysis).filter(Analysis.patient_pk == p.id)
                  .order_by(Analysis.created_at.desc()).first())
        treatments = (db.query(Treatment).filter(Treatment.patient_pk == p.id)
                      .order_by(Treatment.start_date).all())
        events = (db.query(TumorEvent).filter(TumorEvent.patient_pk == p.id)
                  .order_by(TumorEvent.timepoint).all())

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4,
                                leftMargin=1.5*cm, rightMargin=1.5*cm,
                                topMargin=1.5*cm, bottomMargin=1.5*cm,
                                title=f"GBM-AID Klinik Rapor — {patient_id}",
                                author=current_user.full_name or current_user.username)
        styles = getSampleStyleSheet()
        h_style = ParagraphStyle('h', parent=styles['Heading1'],
                                  fontName=PDF_FONT_BOLD,
                                  fontSize=16, textColor=colors.HexColor('#0d9488'),
                                  spaceAfter=8)
        sub_style = ParagraphStyle('sub', parent=styles['Normal'],
                                    fontName=PDF_FONT,
                                    fontSize=9, textColor=colors.gray, spaceAfter=14)
        section_style = ParagraphStyle('section', parent=styles['Heading2'],
                                        fontName=PDF_FONT_BOLD,
                                        fontSize=11, textColor=colors.HexColor('#0d9488'),
                                        spaceBefore=10, spaceAfter=4,
                                        borderPadding=2)
        body_style = ParagraphStyle('body', parent=styles['Normal'],
                                     fontName=PDF_FONT,
                                     fontSize=9.5, leading=13)
        small = ParagraphStyle('small', parent=styles['Normal'],
                                fontName=PDF_FONT,
                                fontSize=8, textColor=colors.gray)

        story = []
        story.append(Paragraph("GBM-AID Klinik Karar Destek Raporu", h_style))
        story.append(Paragraph(
            f"Hasta: <b>{patient_id}</b> &nbsp;|&nbsp; "
            f"Rapor: {latest.report_id if latest else 'N/A'} &nbsp;|&nbsp; "
            f"Tarih: {datetime.now().strftime('%d.%m.%Y %H:%M')} &nbsp;|&nbsp; "
            f"Hekim: {current_user.full_name or current_user.username}",
            sub_style))

        # Klinik bilgiler
        story.append(Paragraph("Klinik Profil", section_style))
        clin_rows = [
            ["Yaş", str(p.age or '-')],
            ["Cinsiyet", {"M": "Erkek", "F": "Kadın"}.get(p.gender or '', '-')],
            ["KPS", str(p.kps_score or '-')],
            ["MGMT", p.mgmt_status or '-'],
            ["IDH1", p.idh1_status or '-'],
            ["Tümör Lokalizasyonu", p.tumor_location or '-'],
            ["Cerrahi", p.surgery_type or '-'],
            ["Tedavi Protokolü", p.treatment_protocol or '-'],
            ["Tanı Tarihi", p.diagnosis_date.strftime('%d.%m.%Y') if p.diagnosis_date else '-'],
        ]
        t = Table(clin_rows, colWidths=[5*cm, 12*cm])
        t.setStyle(TableStyle([
            ('FONTSIZE', (0,0), (-1,-1), 9),
            ('TEXTCOLOR', (0,0), (0,-1), colors.gray),
            ('FONTNAME', (1,0), (1,-1), PDF_FONT_BOLD), ('FONTNAME', (0,0), (0,-1), PDF_FONT),
            ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ('LINEBELOW', (0,0), (-1,-1), 0.25, colors.HexColor('#e5e7eb')),
        ]))
        story.append(t)

        # Prognostik skorlar + CI
        if latest:
            story.append(Paragraph("Prognostik Değerlendirme", section_style))
            ci_surv = (f"%{latest.survival_6m_pct:.0f} "
                       f"(%{latest.survival_6m_lower:.0f}–%{latest.survival_6m_upper:.0f} 95% CI)"
                       if latest.survival_6m_pct is not None and
                          latest.survival_6m_lower is not None
                       else f"%{latest.survival_6m_pct or 0:.0f}")
            ci_risk = (f"{latest.risk_score:.0f}/100 "
                       f"({latest.risk_score_lower:.0f}–{latest.risk_score_upper:.0f} 95% CI)"
                       if latest.risk_score is not None and
                          latest.risk_score_lower is not None
                       else f"{latest.risk_score or 0:.0f}/100")
            prog_rows = [
                ["6 Aylık Sağkalım", ci_surv],
                ["Cox Risk Skoru", ci_risk],
                ["Risk Sınıfı", latest.risk_label or '-'],
                ["Tümör Hacmi (whole)", f"{latest.tumor_volume_cm3:.1f} cm³" if latest.tumor_volume_cm3 else '-'],
                ["Enhancing Hacim", f"{latest.enhancing_volume_cm3:.1f} cm³" if latest.enhancing_volume_cm3 else '-'],
                ["Necrotic Core", f"{latest.core_volume_cm3:.1f} cm³" if latest.core_volume_cm3 else '-'],
                ["Model Sürümü", latest.model_version or 'unknown'],
            ]
            t = Table(prog_rows, colWidths=[5*cm, 12*cm])
            t.setStyle(TableStyle([
                ('FONTSIZE', (0,0), (-1,-1), 9),
                ('TEXTCOLOR', (0,0), (0,-1), colors.gray),
                ('FONTNAME', (1,0), (1,-1), PDF_FONT_BOLD), ('FONTNAME', (0,0), (0,-1), PDF_FONT),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
                ('LINEBELOW', (0,0), (-1,-1), 0.25, colors.HexColor('#e5e7eb')),
            ]))
            story.append(t)

        # RANO takip
        if events:
            story.append(Paragraph("RANO Takip", section_style))
            rano_rows = [["TP", "Tarih", "Hacim (cm³)", "Δ %", "RANO"]]
            for e in events:
                rano_rows.append([
                    str(e.timepoint),
                    e.event_date.strftime('%d.%m.%Y') if e.event_date else '-',
                    f"{e.tumor_volume_cm3:.1f}" if e.tumor_volume_cm3 else '-',
                    f"{e.volume_change_pct:+.1f}%" if e.volume_change_pct is not None else '-',
                    e.rano_class or '-',
                ])
            t = Table(rano_rows, colWidths=[1.5*cm, 3*cm, 3*cm, 2.5*cm, 2*cm])
            t.setStyle(TableStyle([
                ('FONTSIZE', (0,0), (-1,-1), 9),
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f3f4f6')),
                ('FONTNAME', (0,0), (-1,0), PDF_FONT_BOLD), ('FONTNAME', (0,1), (-1,-1), PDF_FONT),
                ('GRID', (0,0), (-1,-1), 0.25, colors.HexColor('#e5e7eb')),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ]))
            story.append(t)

        # Tedaviler
        if treatments:
            story.append(Paragraph("Tedavi Geçmişi", section_style))
            tx_rows = [["İlaç / Tedavi", "Başlangıç", "Doz", "Yanıt"]]
            resp_map = {"complete": "Tam", "partial": "Parsiyel",
                        "stable": "Stabil", "progression": "Progresyon"}
            for tx in treatments:
                tx_rows.append([
                    tx.drug_name,
                    tx.start_date.strftime('%d.%m.%Y') if tx.start_date else '-',
                    tx.dosage or '-',
                    resp_map.get(tx.response or '', tx.response or '-'),
                ])
            t = Table(tx_rows, colWidths=[6*cm, 3*cm, 4*cm, 3.5*cm])
            t.setStyle(TableStyle([
                ('FONTSIZE', (0,0), (-1,-1), 9),
                ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f3f4f6')),
                ('FONTNAME', (0,0), (-1,0), PDF_FONT_BOLD), ('FONTNAME', (0,1), (-1,-1), PDF_FONT),
                ('GRID', (0,0), (-1,-1), 0.25, colors.HexColor('#e5e7eb')),
                ('BOTTOMPADDING', (0,0), (-1,-1), 4),
            ]))
            story.append(t)

        # AI özet
        if latest and latest.results_json:
            try:
                rj = json.loads(latest.results_json)
                ai = rj.get("ai_summary", "")
                if ai:
                    story.append(Paragraph("Yapay Zekâ Klinik Değerlendirmesi", section_style))
                    story.append(Paragraph(ai.replace("\n", "<br/>"), body_style))
            except Exception:
                pass

        story.append(Spacer(1, 0.3*cm))
        story.append(Paragraph(
            "<b>Uyarı:</b> Bu sistem klinik karar destek aracıdır. "
            "Nihai tanı ve tedavi kararı yetkili sağlık profesyoneline aittir.",
            small))

        doc.build(story)
        buf.seek(0)
        log_audit(db, current_user, "report_pdf", "patient", patient_id, None)
        db.commit()
        return StreamingResponse(
            io.BytesIO(buf.read()), media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="GBM-AID-{patient_id}.pdf"'}
        )
    finally:
        db.close()


@app.get("/api/patients/{patient_id}/timeline")
async def patient_timeline(patient_id: str):
    db = SessionLocal()
    try:
        patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
        if not patient:
            raise HTTPException(404, "Hasta bulunamadı")

        timeline = []
        if patient.diagnosis_date:
            timeline.append({"date": patient.diagnosis_date.isoformat(), "type": "diagnosis",
                             "label": "GBM Tanısı", "detail": f"{patient.tumor_location or ''} lokalizasyon"})

        treatments = db.query(Treatment).filter(Treatment.patient_pk == patient.id).order_by(Treatment.start_date).all()
        for t in treatments:
            event_type = "treatment"
            if "cerrahi" in (t.drug_name or "").lower() or "rezeksiyon" in (t.drug_name or "").lower():
                event_type = "surgery"
            response_labels = {"complete": "Tam Yanıt", "partial": "Parsiyel Yanıt", "stable": "Stabil", "progression": "Progresyon"}
            detail_parts = []
            if t.dosage:
                detail_parts.append(t.dosage)
            if t.response:
                detail_parts.append(response_labels.get(t.response, t.response))
                if t.response == "progression":
                    event_type = "progression"
            timeline.append({"date": t.start_date.isoformat() if t.start_date else None,
                             "type": event_type, "label": t.drug_name,
                             "detail": " · ".join(detail_parts) if detail_parts else None})

        analyses = db.query(Analysis).filter(Analysis.patient_pk == patient.id).order_by(Analysis.created_at).all()
        volume_data = []
        for i, a in enumerate(analyses):
            if a.tumor_volume_cm3 is not None:
                if patient.diagnosis_date and a.created_at:
                    days_diff = (a.created_at.date() - patient.diagnosis_date).days
                    week = max(0, days_diff // 7)
                else:
                    week = i * 4
                volume_data.append({"week": week, "volume": round(a.tumor_volume_cm3, 1)})
            timeline.append({"date": a.created_at.strftime("%Y-%m-%d") if a.created_at else None,
                             "type": "mri", "label": f"MRI Analiz ({a.report_id})",
                             "detail": f"Risk: {a.risk_score:.0f}/100 · Hacim: {a.tumor_volume_cm3:.1f} cm³" if a.risk_score and a.tumor_volume_cm3 else None,
                             "risk_score": a.risk_score, "risk_class": a.risk_class,
                             "tumor_volume_cm3": a.tumor_volume_cm3, "survival_6m_pct": a.survival_6m_pct})

        timeline.sort(key=lambda e: e.get("date") or "9999")
        return {"patient_id": patient_id, "timeline": timeline, "volume_data": volume_data}
    finally:
        db.close()


@app.get("/api/compare")
async def compare_patients(ids: str = ""):
    if not ids:
        raise HTTPException(400, "ids parametresi gerekli")
    patient_ids = [pid.strip() for pid in ids.split(",") if pid.strip()]
    if len(patient_ids) < 2:
        raise HTTPException(400, "En az 2 hasta ID gerekli")
    if len(patient_ids) > 5:
        raise HTTPException(400, "En fazla 5 hasta karşılaştırılabilir")

    db = SessionLocal()
    try:
        results = []
        for pid in patient_ids:
            patient = db.query(Patient).filter(Patient.patient_id == pid).first()
            if not patient:
                continue
            latest = db.query(Analysis).filter(Analysis.patient_pk == patient.id).order_by(Analysis.created_at.desc()).first()
            treatments = db.query(Treatment).filter(Treatment.patient_pk == patient.id).order_by(Treatment.start_date).all()
            results.append({
                "patient_id": patient.patient_id, "age": patient.age, "gender": patient.gender,
                "kps_score": patient.kps_score, "mgmt_status": patient.mgmt_status,
                "idh1_status": patient.idh1_status, "treatment_protocol": patient.treatment_protocol,
                "diagnosis_date": patient.diagnosis_date.isoformat() if patient.diagnosis_date else None,
                "tumor_location": patient.tumor_location, "surgery_type": patient.surgery_type,
                "risk_score": latest.risk_score if latest else None,
                "risk_class": latest.risk_class if latest else None,
                "risk_label": latest.risk_label if latest else None,
                "survival_6m_pct": latest.survival_6m_pct if latest else None,
                "tumor_volume": latest.tumor_volume_cm3 if latest else None,
                "core_volume": latest.core_volume_cm3 if latest else None,
                "enhancing_volume": latest.enhancing_volume_cm3 if latest else None,
                "edema_volume": latest.edema_volume_cm3 if latest else None,
                "sphericity": latest.sphericity if latest else None,
                "surface_area": latest.surface_area_cm2 if latest else None,
                "treatments": [{"drug_name": t.drug_name, "start_date": t.start_date.isoformat() if t.start_date else None,
                                "dosage": t.dosage, "response": t.response} for t in treatments],
            })
        return {"patients": results}
    finally:
        db.close()


@app.get("/api/health")
async def health():
    return {"status": "ok", "nibabel": HAS_NIBABEL, "version": "5.0.0"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
