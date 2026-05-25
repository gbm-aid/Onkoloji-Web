from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from sqlalchemy import String, Integer, Float, Text, DateTime, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    age: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    kps_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mgmt_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    idh1_status: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    treatment_protocol: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    survival_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, default="unknown")
    diagnosis_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    tumor_location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    surgery_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dataset_source: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="manual")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    analyses: Mapped[list[Analysis]] = relationship(back_populates="patient", cascade="all, delete-orphan")
    treatments: Mapped[list[Treatment]] = relationship(back_populates="patient", cascade="all, delete-orphan")


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_pk: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    session_id: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    report_id: Mapped[str] = mapped_column(String(30))
    risk_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    risk_score_lower: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    risk_score_upper: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    risk_class: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    risk_label: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    survival_6m_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    survival_6m_lower: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    survival_6m_upper: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    model_version: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    tumor_volume_cm3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    core_volume_cm3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    enhancing_volume_cm3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    edema_volume_cm3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    surface_area_cm2: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sphericity: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    results_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    files_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    patient: Mapped[Patient] = relationship(back_populates="analyses")


class Treatment(Base):
    __tablename__ = "treatments"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_pk: Mapped[int] = mapped_column(ForeignKey("patients.id"))
    drug_name: Mapped[str] = mapped_column(String(100))
    protocol: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    dosage: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    cycles: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    response: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    side_effects: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    side_effects_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # CTCAE yapılı
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    patient: Mapped[Patient] = relationship(back_populates="treatments")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="clinician")  # clinician, admin, viewer
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)


class TumorEvent(Base):
    """RANO takibi için her MR/analiz sonrası kaydedilen olay."""
    __tablename__ = "tumor_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_pk: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    analysis_id: Mapped[Optional[int]] = mapped_column(ForeignKey("analyses.id"), nullable=True)
    timepoint: Mapped[int] = mapped_column(Integer, default=0)  # 0=baseline, 1=ilk takip, ...
    event_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    tumor_volume_cm3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    enhancing_volume_cm3: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volume_change_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # baseline'a göre
    rano_class: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # CR, PR, SD, PD
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class CaseNote(Base):
    """Multidisipliner konsey notları."""
    __tablename__ = "case_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    patient_pk: Mapped[int] = mapped_column(ForeignKey("patients.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    author_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    author_role: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    username: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # snapshot
    action: Mapped[str] = mapped_column(String(50))  # login, analyze, patient_create, etc.
    entity_type: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    entity_id: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
