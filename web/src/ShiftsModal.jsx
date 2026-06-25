import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// نافذة إدارة الشِفتات: عرض الشِفتات الموجودة + إضافة شِفت جديد.
export default function ShiftsModal({ tenantId, onClose }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  // حقول النموذج
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [breaks, setBreaks] = useState([]); // [{ start, durationMinutes }]
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadShifts() {
    setLoading(true);
    setListError("");
    try {
      const q = query(collection(db, "shifts"), where("tenantId", "==", tenantId));
      const snap = await getDocs(q);
      setShifts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setListError("تعذّر تحميل الشِفتات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadShifts();
  }, []);

  function addBreakRow() {
    setBreaks((prev) => [...prev, { start: "", durationMinutes: "" }]);
  }
  function removeBreakRow(i) {
    setBreaks((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateBreak(i, field, value) {
    setBreaks((prev) =>
      prev.map((b, idx) => (idx === i ? { ...b, [field]: value } : b))
    );
  }

  async function handleSave() {
    setFormError("");
    if (name.trim().length < 2) {
      setFormError("اسم الشِفت مطلوب (حرفان على الأقل).");
      return;
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      setFormError("وقت البداية غير صحيح (مثال: 08:00).");
      return;
    }
    const dur = Number(durationHours);
    if (!Number.isFinite(dur) || dur <= 0 || dur > 24) {
      setFormError("مدة الشِفت غير صحيحة (1 إلى 24 ساعة).");
      return;
    }

    // تجهيز البريكات: تجاهل الصفوف الفارغة، وحوّل المدة لرقم
    const cleanBreaks = [];
    for (const b of breaks) {
      if (!b.start && !b.durationMinutes) continue; // صف فارغ — تجاهل
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start)) {
        setFormError("وقت بداية فترة راحة غير صحيح.");
        return;
      }
      const bd = Number(b.durationMinutes);
      if (!Number.isFinite(bd) || bd <= 0) {
        setFormError("مدة فترة راحة غير صحيحة.");
        return;
      }
      cleanBreaks.push({ start: b.start, durationMinutes: bd });
    }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createShift");
      await fn({
        name: name.trim(),
        startTime: startTime,
        durationHours: dur,
        breaks: cleanBreaks,
      });
      // نجح: نظّف النموذج وأعد تحميل القائمة
      setName("");
      setStartTime("");
      setDurationHours("");
      setBreaks([]);
      await loadShifts();
    } catch (err) {
      setFormError(err.message || "تعذّر إنشاء الشِفت.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>إدارة الشِفتات</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {/* قائمة الشِفتات الموجودة */}
        <h3 style={styles.section}>الشِفتات الحالية</h3>
        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : listError ? (
          <div style={styles.error}>{listError}</div>
        ) : shifts.length === 0 ? (
          <p style={styles.muted}>لا توجد شِفتات بعد. أضف أول شِفت بالأسفل.</p>
        ) : (
          <div style={styles.list}>
            {shifts.map((s) => (
              <div key={s.id} style={styles.shiftRow}>
                <div>
                  <strong>{s.name}</strong>
                  <span style={styles.shiftMeta}>
                    {" "}— يبدأ {s.startTime} · {s.durationHours} ساعات
                    {s.breaks && s.breaks.length > 0
                      ? ` · ${s.breaks.length} فترة راحة`
                      : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* نموذج إضافة شِفت */}
        <h3 style={styles.section}>إضافة شِفت جديد</h3>

        <label style={styles.label}>اسم الشِفت</label>
        <input
          style={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثال: صباحي"
          disabled={saving}
        />

        <div style={styles.twoCol}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>وقت البداية</label>
            <input
              style={styles.input}
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={saving}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>المدة (ساعات)</label>
            <input
              style={styles.input}
              type="number"
              min="1"
              max="24"
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
              placeholder="8"
              disabled={saving}
            />
          </div>
        </div>

        {/* فترات الراحة */}
        <div style={styles.breaksHead}>
          <label style={styles.label}>فترات الراحة (اختياري)</label>
          <button style={styles.addBreak} onClick={addBreakRow} disabled={saving}>
            + إضافة فترة
          </button>
        </div>
        {breaks.map((b, i) => (
          <div key={i} style={styles.breakRow}>
            <input
              style={{ ...styles.input, flex: 1 }}
              type="time"
              value={b.start}
              onChange={(e) => updateBreak(i, "start", e.target.value)}
              disabled={saving}
            />
            <input
              style={{ ...styles.input, flex: 1 }}
              type="number"
              min="1"
              value={b.durationMinutes}
              onChange={(e) => updateBreak(i, "durationMinutes", e.target.value)}
              placeholder="دقائق"
              disabled={saving}
            />
            <button
              style={styles.removeBreak}
              onClick={() => removeBreakRow(i)}
              disabled={saving}
            >
              ✕
            </button>
          </div>
        ))}

        {formError ? <div style={styles.error}>{formError}</div> : null}

        <button style={styles.save} onClick={handleSave} disabled={saving}>
          {saving ? "جارٍ الحفظ..." : "حفظ الشِفت"}
        </button>
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
  shiftRow: { padding: "12px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14 },
  shiftMeta: { color: "#64748b", fontSize: 13 },
  label: { display: "block", margin: "12px 0 6px", fontSize: 14, fontWeight: 600 },
  input: {
    width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc",
    borderRadius: 8, boxSizing: "border-box", background: "#fff",
  },
  twoCol: { display: "flex", gap: 12 },
  breaksHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  addBreak: {
    padding: "6px 12px", fontSize: 13, color: "#0f766e", background: "#ccfbf1",
    border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600,
  },
  breakRow: { display: "flex", gap: 8, marginTop: 8, alignItems: "center" },
  removeBreak: {
    padding: "8px 12px", fontSize: 14, color: "#b91c1c", background: "#fee2e2",
    border: "none", borderRadius: 6, cursor: "pointer",
  },
  error: { marginTop: 16, padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
  save: {
    width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600,
    color: "#fff", background: "#0f766e", border: "none", borderRadius: 8, cursor: "pointer",
  },
};