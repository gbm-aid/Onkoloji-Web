"""
10 Turkce hasta seed scripti — hasta-001 ... hasta-010
Her hasta icin: Patient, Analysis, Treatment(lar), TumorEvent(ler) olusturur.
"""
import json, sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from database import SessionLocal, init_db
from models import Patient, Analysis, Treatment, TumorEvent

# ── Yardimci ────────────────────────────────────────────────────────────────

def d(s): return date.fromisoformat(s)

# ── Hasta verileri ───────────────────────────────────────────────────────────

PATIENTS = [
    # ── hasta-001 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-001", age=58, gender="M", kps_score=80,
            mgmt_status="methylated", idh1_status="wildtype",
            treatment_protocol="stupp", diagnosis_date=d("2024-03-12"),
            tumor_location="frontal", surgery_type="GTR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Sol frontal GBM; cerrahi sonrasi Stupp protokolu baslatildi",
        ),
        "analysis": dict(
            report_id="TR-001-2024", session_id="manual",
            risk_score=74.8, risk_score_lower=68.2, risk_score_upper=81.4,
            risk_class="high", risk_label="Yuksek",
            survival_6m_pct=37.2, survival_6m_lower=29.1, survival_6m_upper=45.3,
            tumor_volume_cm3=18.4, core_volume_cm3=6.1, enhancing_volume_cm3=8.7,
            edema_volume_cm3=14.2, surface_area_cm2=42.3, sphericity=0.61,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "58 yasinda erkek hasta, sol frontal lobda yerlesik IDH-wildtype, MGMT-metile glioblastom tanisiyla izlenmektedir. "
                "Gross total rezeksiyon sonrasinda Stupp protokolu (temozolomid + radyoterapi) baslanmis olup hastanin genel durumu KPS 80 ile "
                "tedaviyi tolere edebilir duzeydedir. MGMT promotor metilasyonunun varliginin temozolomide yanit acisindan prognostik acidan "
                "olumlu bir gosterge oldugu bilinmektedir; bu nedenle adjuvan TMZ dongulerinin surdurulebilmesi oncelikli hedef olmalidir.\n\n"
                "Radyomik analiz bulgulari; tümör hacminin 18.4 cm³, nekrotik cekirdegin 6.1 cm³ ve kontrast tutan alanin 8.7 cm³ oldugunu "
                "ortaya koymaktadir. Tümör sferisitesi 0.61 ile orta duzey morfolojik heterojeniteye isaret etmekte olup odem alani 14.2 cm³ "
                "ile sinirli bir perifokal yayilim gozlenmektedir. Risk skoru 74.8/100 (Yuksek risk) olarak hesaplanmis; 6 aylik sagkalaim "
                "olasiligi %37 olarak tahmin edilmistir. Takim toplantisinda adjuvan TMZ siklus sayisi (6-12 arasinda) ve yakin takim MRI "
                "planlama mutlaka ele alinmalidir."
            ),
        ),
        "treatments": [
            dict(drug_name="Gross Total Rezeksiyon", protocol="GTR", start_date=d("2024-03-14"),
                 end_date=d("2024-03-14"), dosage="-", cycles=1, response="stable",
                 notes="Sol frontal kranyotomi, gross total rezeksiyon"),
            dict(drug_name="Radyokemoterapi (Stupp)", protocol="stupp", start_date=d("2024-04-08"),
                 end_date=d("2024-05-20"), dosage="60 Gy / TMZ 75 mg/m²", cycles=1, response="stable",
                 notes="Eş zamanlı radyoterapi + temozolomid"),
            dict(drug_name="Temozolomide Adjuvan", protocol="tmz", start_date=d("2024-06-10"),
                 end_date=None, dosage="150-200 mg/m²", cycles=3, response="stable",
                 notes="Adjuvan TMZ, 3. siklus devam ediyor"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2024-03-12"), tumor_volume_cm3=18.4, enhancing_volume_cm3=8.7, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2024-03-16"), tumor_volume_cm3=4.2,  enhancing_volume_cm3=1.1, volume_change_pct=-77.2, rano_class=None, notes="Post-Op | GTR"),
            dict(timepoint=2, event_date=d("2024-06-04"), tumor_volume_cm3=3.8,  enhancing_volume_cm3=0.9, volume_change_pct=-79.3, rano_class="SD", notes="Kontrol MR — Stupp sonu | RANO: SD"),
            dict(timepoint=3, event_date=d("2024-09-10"), tumor_volume_cm3=5.1,  enhancing_volume_cm3=2.3, volume_change_pct=-72.3, rano_class="SD", notes="3. siklus TMZ sonrasi | RANO: SD"),
        ],
    },

    # ── hasta-002 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-002", age=67, gender="F", kps_score=70,
            mgmt_status="unmethylated", idh1_status="wildtype",
            treatment_protocol="stupp", diagnosis_date=d("2023-11-05"),
            tumor_location="temporal", surgery_type="STR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Sag temporal GBM; MGMT negatif, yuksek risk",
        ),
        "analysis": dict(
            report_id="TR-002-2023", session_id="manual",
            risk_score=82.3, risk_score_lower=75.8, risk_score_upper=88.7,
            risk_class="high", risk_label="Yuksek",
            survival_6m_pct=22.4, survival_6m_lower=15.6, survival_6m_upper=29.2,
            tumor_volume_cm3=28.6, core_volume_cm3=10.4, enhancing_volume_cm3=13.2,
            edema_volume_cm3=22.8, surface_area_cm2=61.7, sphericity=0.48,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "67 yasinda kadin hasta, sag temporal lobda lokalize IDH-wildtype, MGMT-metilasyonsuz glioblastom tanisiyla takip edilmektedir. "
                "Fonksiyonel koruma amaci nedeniyle subtotal rezeksiyon uygulanmis, ardindan Stupp protokolu baslanmistir. MGMT promotor "
                "metilasyonunun bulunmamasi, temozolomide sinirli yanit beklentisi yaratmakta olup ikinci basamak ajanlarin erken planlama "
                "acisindan gun deminden dusurulmemesi onerilir.\n\n"
                "Radyomik profil; tümör hacminin 28.6 cm³ ile yuksek tümor yuku, perifokal odem 22.8 cm³ ve dusuk sferiklik (0.48) ile "
                "infiltratif buyume paternini dusunduren bir tablo ortaya koymaktadir. Cox risk skoru 82.3/100 (Yuksek risk) ve 6 aylik "
                "sagkalaim tahmini yalnizca %22 olarak saptanmistir. Multidisipliner degerlendirmede bevacizumab veya lomustine iceren "
                "ikinci basamak rejimin erken devreye alinmasi tartisma konusu olmalidir."
            ),
        ),
        "treatments": [
            dict(drug_name="Subtotal Rezeksiyon", protocol="STR", start_date=d("2023-11-08"),
                 end_date=d("2023-11-08"), dosage="-", cycles=1, response="stable",
                 notes="Sag temporal, konusmaya yakin alan nedeniyle STR"),
            dict(drug_name="Radyokemoterapi (Stupp)", protocol="stupp", start_date=d("2023-12-04"),
                 end_date=d("2024-01-15"), dosage="60 Gy / TMZ 75 mg/m²", cycles=1, response="progression",
                 notes="Eş zamanlı RT + TMZ"),
            dict(drug_name="Bevacizumab (Avastin)", protocol="bevacizumab", start_date=d("2024-02-12"),
                 end_date=None, dosage="10 mg/kg IV q2w", cycles=4, response="stable",
                 notes="Progresyon sonrasi 2. basamak Avastin"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2023-11-05"), tumor_volume_cm3=28.6, enhancing_volume_cm3=13.2, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2023-11-10"), tumor_volume_cm3=16.3, enhancing_volume_cm3=7.8, volume_change_pct=-43.0, rano_class=None, notes="Post-Op | STR"),
            dict(timepoint=2, event_date=d("2024-01-22"), tumor_volume_cm3=19.8, enhancing_volume_cm3=11.4, volume_change_pct=-30.8, rano_class="PD", notes="Stupp sonu progresyon | RANO: PD"),
            dict(timepoint=3, event_date=d("2024-04-15"), tumor_volume_cm3=15.2, enhancing_volume_cm3=6.9, volume_change_pct=-46.9, rano_class="PR", notes="Avastin 4. siklus | RANO: PR"),
        ],
    },

    # ── hasta-003 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-003", age=45, gender="M", kps_score=90,
            mgmt_status="methylated", idh1_status="mutant",
            treatment_protocol="stupp", diagnosis_date=d("2024-01-18"),
            tumor_location="parietal", surgery_type="GTR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Sol parietal GBM; IDH mutant, MGMT metile — iyi prognostik profil",
        ),
        "analysis": dict(
            report_id="TR-003-2024", session_id="manual",
            risk_score=47.6, risk_score_lower=40.1, risk_score_upper=55.2,
            risk_class="medium", risk_label="Orta",
            survival_6m_pct=71.3, survival_6m_lower=63.4, survival_6m_upper=79.1,
            tumor_volume_cm3=12.1, core_volume_cm3=3.8, enhancing_volume_cm3=5.4,
            edema_volume_cm3=9.6, surface_area_cm2=31.2, sphericity=0.73,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "45 yasinda erkek hasta, sol parietal lobda yerlesik IDH-mutant, MGMT-metile glioblastom tanisiyla izlenmektedir. "
                "Bu molekuler profil, GBM hastalarinin en iyi prognostik alt grubunu olusturmakta olup daha uzun sagkalaim "
                "sureleri beklenmektedir. Gross total rezeksiyon basariyla gerceklestirilmis ve Stupp protokolu kesintisiz surdurulebilmektedir.\n\n"
                "Radyomik degerler; tümör hacmi 12.1 cm³, sferiklik 0.73 (gorece homojen morfoloji) ile sinirli yayilimli bir hastaligi "
                "tanimlamaktadir. Risk skoru 47.6/100 (Orta risk) ve 6 aylik sagkalaim tahmini %71 ile bu hasta populasyonunun uzerinde "
                "seyretmektedir. Adjuvan TMZ dongulerinin eksiksiz tamamlanmasi ve duzey kontrol MRI'larin programa eklenmesi onerilen "
                "yaklasimdir. IDH mutasyonuna yonelik hedefe yonelik tedavilerin klinik calismalar cercevesinde degerlendirilmesi "
                "multidisipliner kurulda ele alinmalidir."
            ),
        ),
        "treatments": [
            dict(drug_name="Gross Total Rezeksiyon", protocol="GTR", start_date=d("2024-01-22"),
                 end_date=d("2024-01-22"), dosage="-", cycles=1, response="complete",
                 notes="Sol parietal kranyotomi"),
            dict(drug_name="Radyokemoterapi (Stupp)", protocol="stupp", start_date=d("2024-02-19"),
                 end_date=d("2024-04-01"), dosage="60 Gy / TMZ 75 mg/m²", cycles=1, response="partial",
                 notes="Eş zamanlı RT + TMZ, iyi tolere"),
            dict(drug_name="Temozolomide Adjuvan", protocol="tmz", start_date=d("2024-04-22"),
                 end_date=None, dosage="200 mg/m²", cycles=6, response="complete",
                 notes="6 siklus tamamlandi, CR"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2024-01-18"), tumor_volume_cm3=12.1, enhancing_volume_cm3=5.4, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2024-01-24"), tumor_volume_cm3=1.2,  enhancing_volume_cm3=0.3, volume_change_pct=-90.1, rano_class=None, notes="Post-Op | GTR"),
            dict(timepoint=2, event_date=d("2024-04-08"), tumor_volume_cm3=0.8,  enhancing_volume_cm3=0.1, volume_change_pct=-93.4, rano_class="CR", notes="Stupp sonu | RANO: CR"),
            dict(timepoint=3, event_date=d("2024-07-15"), tumor_volume_cm3=0.6,  enhancing_volume_cm3=0.1, volume_change_pct=-95.0, rano_class="CR", notes="6. siklus TMZ | RANO: CR"),
            dict(timepoint=4, event_date=d("2024-10-20"), tumor_volume_cm3=0.7,  enhancing_volume_cm3=0.1, volume_change_pct=-94.2, rano_class="CR", notes="Kontrol MR | RANO: CR"),
        ],
    },

    # ── hasta-004 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-004", age=72, gender="F", kps_score=60,
            mgmt_status="unmethylated", idh1_status="wildtype",
            treatment_protocol="stupp", diagnosis_date=d("2023-08-14"),
            tumor_location="multifocal", surgery_type="STR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Multifokal GBM; yasli hasta, performans durumu kisitli",
        ),
        "analysis": dict(
            report_id="TR-004-2023", session_id="manual",
            risk_score=89.1, risk_score_lower=83.5, risk_score_upper=94.6,
            risk_class="high", risk_label="Yuksek",
            survival_6m_pct=17.8, survival_6m_lower=11.2, survival_6m_upper=24.4,
            tumor_volume_cm3=36.2, core_volume_cm3=14.8, enhancing_volume_cm3=17.6,
            edema_volume_cm3=28.4, surface_area_cm2=78.9, sphericity=0.42,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "72 yasinda kadin hasta, cok odakli IDH-wildtype, MGMT-negatif glioblastom tanisiyla takip edilmektedir. "
                "Performans durumunun KPS 60 olarak sinirli olmasi ve multifokal tutulum, hem cerrahi hem de yuzun tedavi "
                "secenek kapsamini daraltmaktadir. Subtotal rezeksiyon uygulanmis, azaltilmis dozda Stupp protokolu baslanmistir; "
                "ancak hastanin tedaviyi tolere edebilirligi yakin klinik izlem gerektirmektedir.\n\n"
                "Radyomik profil; 36.2 cm³ tümör hacmi, 28.4 cm³ genis odem ve dusuk sferiklik degeri (0.42) ile son derece agresif "
                "bir tablo ortaya koymaktadir. Cox risk skoru 89.1/100 ve 6 aylik sagkalaim tahmini %17.8 olarak hesaplanmistir. "
                "Destekleyici bakim ve ailenin bilgilendirilmesi surecinin multidisipliner ekip tarafindan koordine edilmesi onerilmektedir; "
                "paliyatif bakim konsilte edilmeli, hasta ve yakinlari hedefler hakkinda aydinlatilmalidir."
            ),
        ),
        "treatments": [
            dict(drug_name="Subtotal Rezeksiyon", protocol="STR", start_date=d("2023-08-18"),
                 end_date=d("2023-08-18"), dosage="-", cycles=1, response="stable",
                 notes="Multifokal lezyonlardan dominant lezyon STR"),
            dict(drug_name="Radyokemoterapi (Stupp - azaltilmis)", protocol="stupp", start_date=d("2023-09-11"),
                 end_date=d("2023-10-23"), dosage="40 Gy / TMZ 75 mg/m²", cycles=1, response="progression",
                 notes="Azaltilmis doz protokol"),
            dict(drug_name="Temozolomide Adjuvan", protocol="tmz", start_date=d("2023-11-13"),
                 end_date=d("2024-02-28"), dosage="150 mg/m²", cycles=3, response="progression",
                 notes="3 siklus sonrasi progresyon — tedavi kesildi"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2023-08-14"), tumor_volume_cm3=36.2, enhancing_volume_cm3=17.6, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2023-08-20"), tumor_volume_cm3=22.4, enhancing_volume_cm3=10.8, volume_change_pct=-38.1, rano_class=None, notes="Post-Op | STR"),
            dict(timepoint=2, event_date=d("2023-10-30"), tumor_volume_cm3=28.6, enhancing_volume_cm3=14.2, volume_change_pct=-21.0, rano_class="PD", notes="RT+TMZ sonu | RANO: PD"),
            dict(timepoint=3, event_date=d("2024-01-15"), tumor_volume_cm3=34.8, enhancing_volume_cm3=18.9, volume_change_pct=-3.9, rano_class="PD", notes="3. TMZ | RANO: PD"),
        ],
    },

    # ── hasta-005 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-005", age=51, gender="M", kps_score=80,
            mgmt_status="methylated", idh1_status="wildtype",
            treatment_protocol="stupp", diagnosis_date=d("2024-02-22"),
            tumor_location="insular", surgery_type="STR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Insular GBM; konuma gore tam rezeksiyon uygulanamadi",
        ),
        "analysis": dict(
            report_id="TR-005-2024", session_id="manual",
            risk_score=55.3, risk_score_lower=48.0, risk_score_upper=62.6,
            risk_class="medium", risk_label="Orta",
            survival_6m_pct=62.1, survival_6m_lower=54.3, survival_6m_upper=69.9,
            tumor_volume_cm3=14.8, core_volume_cm3=4.2, enhancing_volume_cm3=6.8,
            edema_volume_cm3=11.3, surface_area_cm2=36.4, sphericity=0.56,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "51 yasinda erkek hasta, insular lokalizasyonda IDH-wildtype, MGMT-metile glioblastom tanisiyla izlenmektedir. "
                "Insular korteksin fonksiyonel anatomisi nedeniyle gross total rezeksiyon uygulanamamis; intraoperatif "
                "nöromonitorizasyon esliginde subtotal rezeksiyon gerceklestirilmistir. MGMT metilasyonunun varligi, adjuvan "
                "temozolomide yanit acisindan olumlu bir prognostik belirtec olarak degerlendirilmektedir.\n\n"
                "Radyomik analiz; tümör hacmi 14.8 cm³, kontrast tutan alan 6.8 cm³ ile orta duzey tümor yukunu yansitmaktadir. "
                "Sferiklik 0.56 ile hafif-orta derecede heterojen bir morfoloji gozlenmektedir. Risk skoru 55.3/100 (Orta risk) "
                "ve 6 aylik sagkalaim olasiligi %62 olarak hesaplanmistir. Stupp protokolu sonrasinda adjuvan TMZ dongulerinin "
                "eksiksiz surdurulebilmesi en onemli tedavi hedefi olup insular yerlesim nedeniyle konusma terapisti tarafindan "
                "dil degerlendirmesi onerilmektedir."
            ),
        ),
        "treatments": [
            dict(drug_name="Subtotal Rezeksiyon", protocol="STR", start_date=d("2024-02-26"),
                 end_date=d("2024-02-26"), dosage="-", cycles=1, response="stable",
                 notes="Insular koruma amacli STR, awake craniotomy"),
            dict(drug_name="Radyokemoterapi (Stupp)", protocol="stupp", start_date=d("2024-03-25"),
                 end_date=d("2024-05-06"), dosage="60 Gy / TMZ 75 mg/m²", cycles=1, response="stable",
                 notes="Standart RT + TMZ"),
            dict(drug_name="Temozolomide Adjuvan", protocol="tmz", start_date=d("2024-05-27"),
                 end_date=None, dosage="200 mg/m²", cycles=4, response="stable",
                 notes="4. siklus devam ediyor"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2024-02-22"), tumor_volume_cm3=14.8, enhancing_volume_cm3=6.8, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2024-02-28"), tumor_volume_cm3=7.3,  enhancing_volume_cm3=3.1, volume_change_pct=-50.7, rano_class=None, notes="Post-Op | STR"),
            dict(timepoint=2, event_date=d("2024-05-13"), tumor_volume_cm3=6.1,  enhancing_volume_cm3=2.4, volume_change_pct=-58.8, rano_class="SD", notes="Stupp sonu | RANO: SD"),
            dict(timepoint=3, event_date=d("2024-08-19"), tumor_volume_cm3=5.4,  enhancing_volume_cm3=1.9, volume_change_pct=-63.5, rano_class="SD", notes="4. TMZ | RANO: SD"),
        ],
    },

    # ── hasta-006 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-006", age=63, gender="F", kps_score=70,
            mgmt_status="unmethylated", idh1_status="wildtype",
            treatment_protocol="stupp", diagnosis_date=d("2023-06-30"),
            tumor_location="occipital", surgery_type="GTR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Sol oksipital GBM; gorme alani defisiti mevcut",
        ),
        "analysis": dict(
            report_id="TR-006-2023", session_id="manual",
            risk_score=78.4, risk_score_lower=71.9, risk_score_upper=84.9,
            risk_class="high", risk_label="Yuksek",
            survival_6m_pct=29.3, survival_6m_lower=22.0, survival_6m_upper=36.6,
            tumor_volume_cm3=22.3, core_volume_cm3=8.6, enhancing_volume_cm3=10.4,
            edema_volume_cm3=18.1, surface_area_cm2=52.6, sphericity=0.54,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "63 yasinda kadin hasta, sol oksipital lobda lokalize IDH-wildtype, MGMT-negatif glioblastom tanisiyla "
                "izlenmektedir. Gross total rezeksiyon basariyla uygulanmis; ancak postoperatif sol homonim hemianopsi "
                "gözlenmiş olup visuel rehabilitasyon sureci aktif olarak devam etmektedir. MGMT metilasyonunun bulunmamasi, "
                "standart temozolomide sinirli duyarlilik beklentisi yaratmaktadir.\n\n"
                "Radyomik profil; tümör hacmi 22.3 cm³, genis perifokal odem (18.1 cm³) ve infiltratif morfoloji (sferiklik 0.54) "
                "ile agresif bir gidisi desteklemektedir. Risk skoru 78.4/100 ve 6 aylik sagkalaim tahmini %29 olarak hesaplanmistir. "
                "Mevcut progresyon bulgulari dahilinde bevacizumab veya lomustine iceren ikinci basamak rejimin degerlendirmeye "
                "alinmasi ve molekuler tumoral profillemenin genisletilmesi (TERT, EGFR, PTEN) onerilmektedir."
            ),
        ),
        "treatments": [
            dict(drug_name="Gross Total Rezeksiyon", protocol="GTR", start_date=d("2023-07-04"),
                 end_date=d("2023-07-04"), dosage="-", cycles=1, response="stable",
                 notes="Sol oksipital kranyotomi, GTR"),
            dict(drug_name="Radyokemoterapi (Stupp)", protocol="stupp", start_date=d("2023-07-31"),
                 end_date=d("2023-09-11"), dosage="60 Gy / TMZ 75 mg/m²", cycles=1, response="progression",
                 notes="Eş zamanlı RT + TMZ"),
            dict(drug_name="Lomustine (CCNU)", protocol="lomustine", start_date=d("2023-10-09"),
                 end_date=None, dosage="110 mg/m²", cycles=3, response="stable",
                 notes="Progresyon sonrasi 2. basamak CCNU"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2023-06-30"), tumor_volume_cm3=22.3, enhancing_volume_cm3=10.4, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2023-07-06"), tumor_volume_cm3=3.8,  enhancing_volume_cm3=0.9, volume_change_pct=-83.0, rano_class=None, notes="Post-Op | GTR"),
            dict(timepoint=2, event_date=d("2023-09-18"), tumor_volume_cm3=7.4,  enhancing_volume_cm3=4.1, volume_change_pct=-66.8, rano_class="PD", notes="Stupp sonu progresyon | RANO: PD"),
            dict(timepoint=3, event_date=d("2023-12-11"), tumor_volume_cm3=5.9,  enhancing_volume_cm3=2.8, volume_change_pct=-73.5, rano_class="SD", notes="CCNU 3. siklus | RANO: SD"),
        ],
    },

    # ── hasta-007 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-007", age=38, gender="M", kps_score=100,
            mgmt_status="methylated", idh1_status="mutant",
            treatment_protocol="stupp", diagnosis_date=d("2024-04-08"),
            tumor_location="temporal", surgery_type="GTR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Genc hasta, en iyi molekuler profil; IDH mutant MGMT metile",
        ),
        "analysis": dict(
            report_id="TR-007-2024", session_id="manual",
            risk_score=31.7, risk_score_lower=24.3, risk_score_upper=39.1,
            risk_class="low", risk_label="Dusuk",
            survival_6m_pct=88.4, survival_6m_lower=82.1, survival_6m_upper=94.7,
            tumor_volume_cm3=8.6, core_volume_cm3=2.1, enhancing_volume_cm3=3.8,
            edema_volume_cm3=6.4, surface_area_cm2=22.8, sphericity=0.79,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "38 yasinda erkek hasta, sag temporal lobda IDH-mutant, MGMT-metile glioblastom tanisiyla izlenmektedir. "
                "Bu kombinasyon — genc yas, mükemmel performans durumu (KPS 100), IDH mutasyonu ve MGMT metilasyonu — "
                "klinik pratikte karsilasilan en favorable prognostik konfigurasyonu olusturmaktadir. Gross total rezeksiyon "
                "komplikasyonsuz gerceklestirilmis olup hasta Stupp protokolunu cok iyi tolere etmektedir.\n\n"
                "Radyomik profil; kucuk tümör hacmi (8.6 cm³), yuksek sferiklik (0.79 — homojen morfoloji) ve sinirli "
                "perifokal odem ile birlikte sinirli ve lokal bir hastaligi tanimlamaktadir. Risk skoru 31.7/100 (Dusuk risk) "
                "ve 6 aylik sagkalaim tahmini %88 ile son derece iyi bir prognozu desteklemektedir. IDH inhibitor "
                "bazli hedefe yonelik tedavilerin (ivosidenib, enasidenib) guncel klinik calismalar cercevesinde "
                "tartisilmasi multidisipliner kurulda oncelikli gundem maddesi olmalidir."
            ),
        ),
        "treatments": [
            dict(drug_name="Gross Total Rezeksiyon", protocol="GTR", start_date=d("2024-04-11"),
                 end_date=d("2024-04-11"), dosage="-", cycles=1, response="complete",
                 notes="Sag temporal kranyotomi, tam rezeksiyon"),
            dict(drug_name="Radyokemoterapi (Stupp)", protocol="stupp", start_date=d("2024-05-06"),
                 end_date=d("2024-06-17"), dosage="60 Gy / TMZ 75 mg/m²", cycles=1, response="complete",
                 notes="Eş zamanlı RT + TMZ, CR"),
            dict(drug_name="Temozolomide Adjuvan", protocol="tmz", start_date=d("2024-07-08"),
                 end_date=None, dosage="200 mg/m²", cycles=5, response="complete",
                 notes="5. siklus devam ediyor — CR sürüyor"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2024-04-08"), tumor_volume_cm3=8.6,  enhancing_volume_cm3=3.8, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2024-04-13"), tumor_volume_cm3=0.4,  enhancing_volume_cm3=0.1, volume_change_pct=-95.3, rano_class=None, notes="Post-Op | GTR"),
            dict(timepoint=2, event_date=d("2024-06-24"), tumor_volume_cm3=0.2,  enhancing_volume_cm3=0.0, volume_change_pct=-97.7, rano_class="CR", notes="Stupp sonu | RANO: CR"),
            dict(timepoint=3, event_date=d("2024-09-30"), tumor_volume_cm3=0.2,  enhancing_volume_cm3=0.0, volume_change_pct=-97.7, rano_class="CR", notes="5. TMZ | RANO: CR"),
            dict(timepoint=4, event_date=d("2024-12-16"), tumor_volume_cm3=0.2,  enhancing_volume_cm3=0.0, volume_change_pct=-97.7, rano_class="CR", notes="Kontrol MR | RANO: CR"),
        ],
    },

    # ── hasta-008 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-008", age=55, gender="F", kps_score=80,
            mgmt_status="methylated", idh1_status="wildtype",
            treatment_protocol="stupp", diagnosis_date=d("2024-05-14"),
            tumor_location="frontal", surgery_type="GTR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Sag frontal GBM; MGMT pozitif, orta risk",
        ),
        "analysis": dict(
            report_id="TR-008-2024", session_id="manual",
            risk_score=60.8, risk_score_lower=53.4, risk_score_upper=68.2,
            risk_class="medium", risk_label="Orta",
            survival_6m_pct=54.6, survival_6m_lower=46.8, survival_6m_upper=62.4,
            tumor_volume_cm3=15.9, core_volume_cm3=5.2, enhancing_volume_cm3=7.3,
            edema_volume_cm3=12.4, surface_area_cm2=38.7, sphericity=0.65,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "55 yasinda kadin hasta, sag frontal lobda IDH-wildtype, MGMT-metile glioblastom tanisiyla izlenmektedir. "
                "Gross total rezeksiyon basariyla tamamlanmis, hasta standart Stupp protokolunu sorunsuz tolere etmektedir. "
                "MGMT metilasyonu, temozolomide etki mekanizmasini desteklemekte ve ilaç-DNA adükt onarimini azaltarak "
                "tümör hucrelerinde apoptozu kolaylastirmaktadir.\n\n"
                "Tümör hacmi 15.9 cm³, sferiklik 0.65 ile orta derecede heterojen bir morfoloji gozlenmektedir. "
                "Risk skoru 60.8/100 (Orta risk) ve 6 aylik sagkalaim tahmini %54.6 olarak hesaplanmistir. "
                "Klinik yanit mevcut olmakla birlikte hasta; adjuvan TMZ dongulerinin sureye yayili tamamlanmasi, "
                "3 ayda bir kontrol MRI protokolu ve nörokognitif fonksiyon degerlendirmesi acisindan yakin takipte tutulmalidir."
            ),
        ),
        "treatments": [
            dict(drug_name="Gross Total Rezeksiyon", protocol="GTR", start_date=d("2024-05-17"),
                 end_date=d("2024-05-17"), dosage="-", cycles=1, response="stable",
                 notes="Sag frontal kranyotomi, GTR"),
            dict(drug_name="Radyokemoterapi (Stupp)", protocol="stupp", start_date=d("2024-06-10"),
                 end_date=d("2024-07-22"), dosage="60 Gy / TMZ 75 mg/m²", cycles=1, response="partial",
                 notes="Eş zamanlı RT + TMZ"),
            dict(drug_name="Temozolomide Adjuvan", protocol="tmz", start_date=d("2024-08-12"),
                 end_date=None, dosage="200 mg/m²", cycles=2, response="stable",
                 notes="2. siklus — tedavi devam ediyor"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2024-05-14"), tumor_volume_cm3=15.9, enhancing_volume_cm3=7.3, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2024-05-19"), tumor_volume_cm3=2.8,  enhancing_volume_cm3=0.7, volume_change_pct=-82.4, rano_class=None, notes="Post-Op | GTR"),
            dict(timepoint=2, event_date=d("2024-07-29"), tumor_volume_cm3=2.1,  enhancing_volume_cm3=0.4, volume_change_pct=-86.8, rano_class="PR", notes="Stupp sonu | RANO: PR"),
            dict(timepoint=3, event_date=d("2024-10-07"), tumor_volume_cm3=1.8,  enhancing_volume_cm3=0.3, volume_change_pct=-88.7, rano_class="SD", notes="2. TMZ | RANO: SD"),
        ],
    },

    # ── hasta-009 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-009", age=70, gender="M", kps_score=60,
            mgmt_status="unmethylated", idh1_status="wildtype",
            treatment_protocol="stupp", diagnosis_date=d("2023-04-19"),
            tumor_location="multifocal", surgery_type="STR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Multifokal GBM; KPS 60, tedavi tolerabilitesi kisitli",
        ),
        "analysis": dict(
            report_id="TR-009-2023", session_id="manual",
            risk_score=91.2, risk_score_lower=86.4, risk_score_upper=96.0,
            risk_class="high", risk_label="Yuksek",
            survival_6m_pct=14.3, survival_6m_lower=8.6, survival_6m_upper=20.0,
            tumor_volume_cm3=42.1, core_volume_cm3=17.3, enhancing_volume_cm3=20.4,
            edema_volume_cm3=33.6, surface_area_cm2=89.4, sphericity=0.39,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "70 yasinda erkek hasta, cok odakli IDH-wildtype, MGMT-negatif glioblastom ile izlenmektedir. "
                "Yasli yas, dusuk performans durumu (KPS 60), multifokal tutulum ve MGMT negativitesinin "
                "bir arada bulunmasi son derece zorlu bir tedavi senaryosu olusturmaktadir. Dominant "
                "lezyon icin subtotal rezeksiyon uygulanmis olmakla birlikte diger lezyonlar cerrahi "
                "acidan ulasimi olmayan bölgelerde yerlesimlidir.\n\n"
                "Radyomik degerler; 42.1 cm³ ile en buyuk tümör yükü, 33.6 cm³ genis perifokal odem ve "
                "son derece dusuk sferiklik (0.39 — cok yuksek heterojenite) ile agresif, yaygın hastaligi "
                "belgelemektedir. Risk skoru 91.2/100 ve 6 aylik sagkalaim tahmini yalnizca %14 olarak "
                "hesaplanmistir. Paliyatif bakim ekibi ile koordinasyonun en kisa surede saglanmasi ve "
                "konfor odakli tedavi hedeflerinin hasta ile ailesine net bicimde aktarilmasi kritik oneme sahiptir."
            ),
        ),
        "treatments": [
            dict(drug_name="Subtotal Rezeksiyon", protocol="STR", start_date=d("2023-04-24"),
                 end_date=d("2023-04-24"), dosage="-", cycles=1, response="stable",
                 notes="Dominant lezyon STR, diger lezyonlar biopsiye uygun degil"),
            dict(drug_name="Radyoterapi (tekli ajan)", protocol="rt_only", start_date=d("2023-05-22"),
                 end_date=d("2023-06-26"), dosage="40 Gy hipofraksiyone", cycles=1, response="progression",
                 notes="KPS 60 nedeniyle TMZ eklenmedi, tek basina RT"),
            dict(drug_name="Temozolomide (dusuk doz)", protocol="tmz", start_date=d("2023-07-17"),
                 end_date=d("2023-09-04"), dosage="75 mg/m²", cycles=2, response="progression",
                 notes="2 siklus sonrasi progresyon — tedavi kesildi"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2023-04-19"), tumor_volume_cm3=42.1, enhancing_volume_cm3=20.4, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2023-04-26"), tumor_volume_cm3=28.6, enhancing_volume_cm3=13.8, volume_change_pct=-32.1, rano_class=None, notes="Post-Op | STR"),
            dict(timepoint=2, event_date=d("2023-07-03"), tumor_volume_cm3=33.4, enhancing_volume_cm3=16.7, volume_change_pct=-20.7, rano_class="PD", notes="RT sonu | RANO: PD"),
            dict(timepoint=3, event_date=d("2023-09-11"), tumor_volume_cm3=38.9, enhancing_volume_cm3=21.3, volume_change_pct=-7.6, rano_class="PD", notes="2. TMZ | RANO: PD"),
        ],
    },

    # ── hasta-010 ──────────────────────────────────────────────────────────
    {
        "clinical": dict(
            patient_id="hasta-010", age=48, gender="F", kps_score=90,
            mgmt_status="methylated", idh1_status="wildtype",
            treatment_protocol="stupp", diagnosis_date=d("2024-06-03"),
            tumor_location="parietal", surgery_type="GTR",
            survival_days=None, status="active", dataset_source="manual",
            notes="Sag parietal GBM; genc, iyi performans, MGMT pozitif",
        ),
        "analysis": dict(
            report_id="TR-010-2024", session_id="manual",
            risk_score=52.4, risk_score_lower=45.0, risk_score_upper=59.8,
            risk_class="medium", risk_label="Orta",
            survival_6m_pct=66.8, survival_6m_lower=59.2, survival_6m_upper=74.4,
            tumor_volume_cm3=11.7, core_volume_cm3=3.4, enhancing_volume_cm3=5.1,
            edema_volume_cm3=8.9, surface_area_cm2=29.4, sphericity=0.70,
            model_version="GBM-AID v5.0",
            ai_summary=(
                "48 yasinda kadin hasta, sag parietal lobda IDH-wildtype, MGMT-metile glioblastom tanisiyla izlenmektedir. "
                "Gross total rezeksiyon KPS 90 performans durumuyla kombine edildiginde iyi bir baslangic profili "
                "olusturmaktadir. Stupp protokolu henuz baslanmis olup erken klinik yanit izlenmektedir. "
                "MGMT metilasyonu, uzun donem adjuvan TMZ tedavisine yanit acisindan yararli bir prognostik "
                "gosterge olarak degerlendirilebilir.\n\n"
                "Radyomik profil; tümür hacmi 11.7 cm³, sferiklik 0.70 ile goreceli homojen ve sinirli lokal "
                "tutulumu desteklemektedir. Risk skoru 52.4/100 (Orta risk) ve 6 aylik sagkalaim tahmini %66.8 "
                "ile ortalamayı asan bir prognozu yansitmaktadir. Adjuvan TMZ siklus sayisinin 12'ye kadar uzatilmasi "
                "ve konusmaya yaki alanlara yakin yerlesim nedeniyle nöropsikolojik degerlendirme dahil komple "
                "norolojik muayenenin duzenli aralikta tekrarlanmasi onerilmektedir."
            ),
        ),
        "treatments": [
            dict(drug_name="Gross Total Rezeksiyon", protocol="GTR", start_date=d("2024-06-07"),
                 end_date=d("2024-06-07"), dosage="-", cycles=1, response="complete",
                 notes="Sag parietal kranyotomi"),
            dict(drug_name="Radyokemoterapi (Stupp)", protocol="stupp", start_date=d("2024-07-01"),
                 end_date=d("2024-08-12"), dosage="60 Gy / TMZ 75 mg/m²", cycles=1, response="partial",
                 notes="Eş zamanlı RT + TMZ"),
            dict(drug_name="Temozolomide Adjuvan", protocol="tmz", start_date=d("2024-09-02"),
                 end_date=None, dosage="200 mg/m²", cycles=1, response="stable",
                 notes="1. siklus — tedavi basladi"),
        ],
        "events": [
            dict(timepoint=0, event_date=d("2024-06-03"), tumor_volume_cm3=11.7, enhancing_volume_cm3=5.1, volume_change_pct=None, rano_class=None, notes="Pre-Op baseline"),
            dict(timepoint=1, event_date=d("2024-06-09"), tumor_volume_cm3=1.4,  enhancing_volume_cm3=0.3, volume_change_pct=-88.0, rano_class=None, notes="Post-Op | GTR"),
            dict(timepoint=2, event_date=d("2024-08-19"), tumor_volume_cm3=1.1,  enhancing_volume_cm3=0.2, volume_change_pct=-90.6, rano_class="PR", notes="Stupp sonu | RANO: PR"),
            dict(timepoint=3, event_date=d("2024-11-04"), tumor_volume_cm3=0.9,  enhancing_volume_cm3=0.1, volume_change_pct=-92.3, rano_class="SD", notes="1. TMZ | RANO: SD"),
        ],
    },
]


# ── Insert ───────────────────────────────────────────────────────────────────

def main():
    init_db()
    db = SessionLocal()

    created = updated = 0

    for entry in PATIENTS:
        clin = entry["clinical"]
        pid  = clin["patient_id"]

        # Patient
        patient = db.query(Patient).filter(Patient.patient_id == pid).first()
        if patient:
            for k, v in clin.items():
                if k != "patient_id":
                    setattr(patient, k, v)
            updated += 1
        else:
            patient = Patient(**clin)
            db.add(patient)
            created += 1
        db.flush()

        # Analysis
        an = entry["analysis"]
        results_json = dict(
            report_id        = an["report_id"],
            risk_score       = an["risk_score"],
            risk_score_lower = an["risk_score_lower"],
            risk_score_upper = an["risk_score_upper"],
            risk_class       = an["risk_class"],
            risk_label       = an["risk_label"],
            survival_6m_pct  = an["survival_6m_pct"],
            survival_6m_lower= an["survival_6m_lower"],
            survival_6m_upper= an["survival_6m_upper"],
            ai_summary       = an["ai_summary"],
            model_version    = an["model_version"],
            radiomics = dict(
                tumor_volume_cm3     = an["tumor_volume_cm3"],
                core_volume_cm3      = an["core_volume_cm3"],
                enhancing_volume_cm3 = an["enhancing_volume_cm3"],
                edema_volume_cm3     = an["edema_volume_cm3"],
                surface_area_cm2     = an["surface_area_cm2"],
                sphericity           = an["sphericity"],
            ),
        )

        existing_an = db.query(Analysis).filter(Analysis.patient_pk == patient.id).first()
        if existing_an:
            existing_an.report_id              = an["report_id"]
            existing_an.risk_score             = an["risk_score"]
            existing_an.risk_score_lower       = an["risk_score_lower"]
            existing_an.risk_score_upper       = an["risk_score_upper"]
            existing_an.risk_class             = an["risk_class"]
            existing_an.risk_label             = an["risk_label"]
            existing_an.survival_6m_pct        = an["survival_6m_pct"]
            existing_an.survival_6m_lower      = an["survival_6m_lower"]
            existing_an.survival_6m_upper      = an["survival_6m_upper"]
            existing_an.tumor_volume_cm3       = an["tumor_volume_cm3"]
            existing_an.core_volume_cm3        = an["core_volume_cm3"]
            existing_an.enhancing_volume_cm3   = an["enhancing_volume_cm3"]
            existing_an.edema_volume_cm3       = an["edema_volume_cm3"]
            existing_an.surface_area_cm2       = an["surface_area_cm2"]
            existing_an.sphericity             = an["sphericity"]
            existing_an.model_version          = an["model_version"]
            existing_an.session_id             = an["session_id"]
            existing_an.results_json           = json.dumps(results_json, ensure_ascii=False)
            analysis = existing_an
        else:
            analysis = Analysis(
                patient_pk           = patient.id,
                session_id           = an["session_id"],
                report_id            = an["report_id"],
                risk_score           = an["risk_score"],
                risk_score_lower     = an["risk_score_lower"],
                risk_score_upper     = an["risk_score_upper"],
                risk_class           = an["risk_class"],
                risk_label           = an["risk_label"],
                survival_6m_pct      = an["survival_6m_pct"],
                survival_6m_lower    = an["survival_6m_lower"],
                survival_6m_upper    = an["survival_6m_upper"],
                tumor_volume_cm3     = an["tumor_volume_cm3"],
                core_volume_cm3      = an["core_volume_cm3"],
                enhancing_volume_cm3 = an["enhancing_volume_cm3"],
                edema_volume_cm3     = an["edema_volume_cm3"],
                surface_area_cm2     = an["surface_area_cm2"],
                sphericity           = an["sphericity"],
                model_version        = an["model_version"],
                results_json         = json.dumps(results_json, ensure_ascii=False),
            )
            db.add(analysis)
            db.flush()

        # Treatments
        db.query(Treatment).filter(Treatment.patient_pk == patient.id).delete()
        for t in entry["treatments"]:
            db.add(Treatment(patient_pk=patient.id, **t))

        # TumorEvents
        db.query(TumorEvent).filter(TumorEvent.patient_pk == patient.id).delete()
        for ev in entry["events"]:
            db.add(TumorEvent(patient_pk=patient.id, analysis_id=analysis.id, **ev))

    db.commit()

    print(f"Olusturulan: {created}  |  Guncellenen: {updated}")
    for pid in [f"hasta-{i:03d}" for i in range(1, 11)]:
        p = db.query(Patient).filter(Patient.patient_id == pid).first()
        if p:
            an = db.query(Analysis).filter(Analysis.patient_pk == p.id).first()
            evs = db.query(TumorEvent).filter(TumorEvent.patient_pk == p.id).count()
            trs = db.query(Treatment).filter(Treatment.patient_pk == p.id).count()
            print(f"  {pid}  yas={p.age}  {p.gender}  KPS={p.kps_score}  "
                  f"risk={an.risk_class if an else '?'}({round(an.risk_score) if an else '?'})  "
                  f"surv%={round(an.survival_6m_pct) if an else '?'}  "
                  f"tx={trs}  events={evs}")
    db.close()


if __name__ == "__main__":
    main()
