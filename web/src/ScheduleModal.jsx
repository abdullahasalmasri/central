import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// أيام الأسبوع: المعرّف للتخزين، والاسم العربي للعرض (الأحد أول الأسبوع)
const WEEKDAYS = [
  { id: "sunday", label: "الأحد" },
  { id: "monday", label: "الاثنين" },
  { id: "tuesday", label: "الثلاثاء" },
  { id: "wednesday", label: "الأربعاء" },
  { id: "thursday", label: "الخميس" },
  { id: "friday", label: "الجمعة" },
  { id: "saturday", label: "السبت" },
];

// نافذة إسناد جدول لعامل: اختيار العامل + شِفته + أيام إجازته.
export default function ScheduleModal({ tenantId, workers, onClose }) {
  const [shifts, setShifts] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  // حقول النموذج
  const [workerUid, setWorkerUid] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [offDays, setOffDays] = useState([]);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    setListError("");
    try {
      const [shiftSnap, schedSnap] = await Promise.all([
        getDocs(query(collection(db, "shifts"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "schedules"), where("tenantId", "==", tenantId))),
      ]);
      setShifts(shiftSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSchedules(schedSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setListError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function toggleOffDay(dayId) {
    setOffDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  }

  async function handleSave() {
    setFormError("");
    if (!workerUid) {
      setFormError("اختر العامل.");
      return;
    }
    if (!shiftId) {
      setFormError("اختر الشِفت.");
      return;
    }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "assignSchedule");
      await fn({
        workerUid: workerUid,
        rotationShifts: [shiftId], // شِفت واحد الآن (الدوران لاحقًا)
        weeklyOffDays: offDays,
      });
      // نجح: نظّف وأعد التحميل
      setWorkerUid("");
      setShiftId("");
      setOffDays([]);
      await loadData();
    } catch (err) {
      setFormError(err.message || "تعذّر إسناد الجدول.");
    } finally {
      setSaving(false);
    }
  }

  // مساعدات العرض
  function workerName(uid) {
    const w = workers.find((x) => x.id === uid);
    return w ? w.name : uid;
  }
  function shiftName(id) {
    const s = shifts.find((x) => x.id === id);
    return s ? s.name : id;
  }
  function offDaysLabel(ids) {
    if (!ids || ids.length === 0) return "بدون إجازة";
    return ids
      .map((id) => {
        const d = WEEKDAYS.find((x) => x.id === id);
        return d ? d.label : id;
      })
      .join("، ");
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>جداول العمّال</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {/* الجداول المُسندة */}
        <h3 style={styles.section}>الجداول الحالية</h3>
        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : listError ? (
          <div style={styles.error}>{listError}</div>
        ) : schedules.length === 0 ? (
          <p style={styles.muted}>لا توجد جداول مُسندة بعد.</p>
        ) : (
          <div style={styles.list}>
            {schedules.map((s) => (
              <div key={s.id} style={styles.schedRow}>
                <strong>{workerName(s.workerUid)}</strong>
                <span style={styles.schedMeta}>
                  {" "}— {s.rotationShifts && s.rotationShifts.length > 0
                    ? shiftName(s.rotationShifts[0])
                    : "—"}
                  {" · إجازة: "}
                  {offDaysLabel(s.weeklyOffDays)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* نموذج الإسناد */}
        <h3 style={styles.section}>إسناد / تعديل جدول</h3>

        <label style={styles.label}>العامل</label>
        <select
          style={styles.input}
          value={workerUid}
          onChange={(e) => setWorkerUid(e.target.value)}
          disabled={saving}
        >
          <option value="">— اختر العامل —</option>
          {workers.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name} {w.employeeNumber ? `(${w.employeeNumber})` : ""}
            </option>
          ))}
        </select>

        <label style={styles.label}>الشِفت</label>
        <select
          style={styles.input}
          value={shiftId}
          onChange={(e) => setShiftId(e.target.value)}
          disabled={saving}
        >
          <option value="">— اختر الشِفت —</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} (يبدأ {s.startTime})
            </option>
          ))}
        </select>

        <label style={styles.label}>أيام الإجازة الأسبوعية</label>
        <div style={styles.days}>
          {WEEKDAYS.map((day) => (
            <label
              key={day.id}
              style={{
                ...styles.dayChip,
                ...(offDays.includes(day.id) ? styles.dayChipOn : {}),
              }}
            >
              <input
                type="checkbox"
                checked={offDays.includes(day.id)}
                onChange={() => toggleOffDay(day.id)}
                disabled={saving}
                style={{ display: "none" }}
              />
              {day.label}
            </label>
          ))}
        </div>

        {formError ? <div style={styles.error}>{formError}</div> : null}

        <button style={styles.save} onClick={handleSave} disabled={saving}>
          {saving ? "جارٍ الحفظ..." : "حفظ الجدول"}
        </button>

        {shifts.length === 0 ? (
          <p style={styles.warn}>
            ⚠ لا توجد شِفتات بعد. عرّف شِفتًا أولًا من "إدارة الشِفتات".
          </p>
        ) : null}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, zIndex: 100,
  },
  modal: {
    width: "100%", maxWidth: 560, background: "#fff", borderRadius: 12,
    padding: 28, fontFamily: "system-ui, sans-serif", direction: "rtl",
    textAlign: "right", maxHeight: "90vh", overflowY: "auto",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  section: { fontSize: 15, color: "#0f766e", margin: "20px 0 12px", borderBottom: "2px solid #ccfbf1", paddingBottom: 6 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  schedRow: { padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14 },
  schedMeta: { color: "#64748b", fontSize: 13 },
  label: { display: "block", margin: "12px 0 6px", fontSize: 14, fontWeight: 600 },
  input: {
    width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc",
    borderRadius: 8, boxSizing: "border-box", background: "#fff",
  },
  days: { display: "flex", flexWrap: "wrap", gap: 8 },
  dayChip: {
    padding: "8px 14px", fontSize: 14, borderRadius: 20, cursor: "pointer",
    border: "1px solid #cbd5e1", background: "#fff", color: "#475569", userSelect: "none",
  },
  dayChipOn: {
    background: "#0f766e", color: "#fff", borderColor: "#0f766e", fontWeight: 600,
  },
  error: { marginTop: 16, padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
  warn: { marginTop: 12, padding: "10px 12px", background: "#fff7ed", color: "#9a3412", borderRadius: 8, fontSize: 13 },
  save: {
    width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600,
    color: "#fff", background: "#0f766e", border: "none", borderRadius: 8, cursor: "pointer",
  },
};