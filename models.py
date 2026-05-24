from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from sqlalchemy import String, Integer, Float, Text, DateTime, Date, ForeignKey, JSON, Boolean
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
    risk_class: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    risk_label: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    survival_6m_pct: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
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
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)

    patient: Mapped[Patient] = relationship(back_populates="treatments")
