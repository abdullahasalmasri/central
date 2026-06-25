import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// تاريخ اليوم بصيغة YYYY-MM-DD (توقيت محلي)
function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// لوحة الحضور للمشرف: توليد سجل اليوم + عرض العمّال + التغييب.
export default function SupervisorAttendance({ user, tenantId, shifts, onClose }) {
  const [date, setDate] = useState(todayStr());
  const [shiftId, setShiftId] = useState(shifts && shifts.length > 0 ? shifts[0].id : "");
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [busyWorker, setBusyWorker] = useState("");

  const recordId = shiftId && date ? `${user.uid}_${shiftId}_${date}` : "";

  // يحمّل سجل الشِفت الحالي (إن وُجد)
  async function loadRecord() {
    if (!recordId) return;
    setLoading(true);
    setMsg("");
    setRecord(null);
    try {
      const snap = await getDocs(
        query(
          collection(db, "records"),
          where("tenantId", "==", tenantId),
          where("supervisorUid", "==", user.uid),
          where("shiftId", "==", shiftId),
          where("date", "==", date)
        )
      );
      if (!snap.empty) {
        const d = snap.docs[0];
        setRecord({ id: d.id, ...d.data() });
      }
    } catch (err) {
      setMsg("تعذّر تحميل السجل.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecord();
    // eslint-disable-next-line
  }, [shiftId, date]);

  // يولّد سجل اليوم لهذا الشِفت
  async function handleGenerate() {
    setLoading(true);
    setMsg("");
    try {
      const fn = httpsCallable(functions, "generateShiftRecord");
      const r = await fn({ supervisorUid: user.uid, shiftId: shiftId, date: date });
      setMsg(`تم توليد السجل (${r.data.workersCount} عامل).`);
      await loadRecord();
    } catch (err) {
      setMsg(err.message || "تعذّر توليد السجل.");
    } finally {
      setLoading(false);
    }
  }

  // يغيّب عاملًا
  async function handleAbsent(workerUid, type) {
    setBusyWorker(workerUid);
    setMsg("");
    try {
      const fn = httpsCallable(functions, "markAbsent");
      await fn({ recordId: record.id, workerUid: workerUid, exceptionType: type });
      await loadRecord();
    } catch (err) {
      setMsg(err.message || "تعذّر تسجيل الغياب.");
    } finally {
      setBusyWorker("");
    }
  }

  function statusLabel(s) {
    if (s === "present") return "حاضر";
    if (s === "absent") return "غائب";
    if (s === "late") return "متأخر";
    return s;
  }
  function statusColor(s) {
    if (s === "present") return { bg: "#dcfce7", fg: "#166534" };
    if (s === "absent") return { bg: "#fee2e2", fg: "#b91c1c" };
    if (s === "late") return { bg: "#fef9c3", fg: "#854d0e" };
    return { bg: "#f1f5f9", fg: "#475569" };
  }

  const entries = record && Array.isArray(record.entries) ? record.entries : [];

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>حضور الشِفت</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {/* اختيار الشِفت والتاريخ */}
        <div style={styles.controls}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الشِفت</label>
            <select
              style={styles.input}
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              disabled={loading}
            >
              {(shifts || []).map((s) => (
                <option key={s.id} value={s.id}>{s.name} (يبدأ {s.startTime})</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>التاريخ</label>
            <input
              style={styles.input}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        {msg ? <div style={styles.msg}>{msg}</div> : null}

        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : !record ? (
          // لا سجل بعد → زر التوليد
          <div style={styles.empty}>
            <p style={styles.muted}>لا يوجد سجل لهذا الشِفت في هذا التاريخ.</p>
            <button style={styles.generate} onClick={handleGenerate} disabled={!shiftId}>
              توليد سجل الحضور
            </button>
          </div>
        ) : (
          // السجل موجود → عرض العمّال
          <>
            <div style={styles.recordInfo}>
              <span>الحالة: <strong>{record.status === "open" ? "مفتوح" : "معتمد"}</strong></span>
              <span>{entries.length} عامل</span>
            </div>

            {entries.length === 0 ? (
              <p style={styles.muted}>لا يوجد عمّال في هذا الشِفت اليوم.</p>
            ) : (
              <div style={styles.list}>
                {entries.map((e) => {
                  const c = statusColor(e.status);
                  const busy = busyWorker === e.workerUid;
                  return (
                    <div key={e.workerUid} style={styles.workerRow}>
                      <div style={styles.workerInfo}>
                        <strong>{e.workerName || "—"}</strong>
                        <span style={{ ...styles.statusBadge, background: c.bg, color: c.fg }}>
                          {statusLabel(e.status)}
                        </span>
                      </div>
                      {record.status === "open" && e.status === "present" ? (
                        <div style={styles.actions}>
                          <button
                            style={styles.absentBtn}
                            onClick={() => handleAbsent(e.workerUid, "absent")}
                            disabled={busy}
                          >
                            {busy ? "..." : "تغييب"}
                          </button>
                          <button
                            style={styles.lateBtn}
                            onClick={() => handleAbsent(e.workerUid, "late")}
                            disabled={busy}
                          >
                            {busy ? "..." : "تأخير"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <p style={styles.hint}>
              العمّال حاضرون افتراضيًا. عدّل الاستثناءات فقط — والباقي يُعتمد تلقائيًا بعد انتهاء المهلة.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100,
  },
  modal: {
    width: "100%", maxWidth: 600, background: "#fff", borderRadius: 12, padding: 28,
    fontFamily: "system-ui, sans-serif", direction: "rtl", textAlign: "right",
    maxHeight: "90vh", overflowY: "auto",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  controls: { display: "flex", gap: 12, marginBottom: 16 },
  label: { display: "block", margin: "0 0 6px", fontSize: 14, fontWeight: 600 },
  input: {
    width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc",
    borderRadius: 8, boxSizing: "border-box", background: "#fff",
  },
  msg: { padding: "10px 12px", background: "#eff6ff", color: "#1e40af", borderRadius: 8, fontSize: 14, marginBottom: 12 },
  empty: { textAlign: "center", padding: "20px 0" },
  generate: {
    marginTop: 12, padding: "12px 24px", fontSize: 15, fontWeight: 600, color: "#fff",
    background: "#0f766e", border: "none", borderRadius: 8, cursor: "pointer",
  },
  recordInfo: {
    display: "flex", justifyContent: "space-between", padding: "10px 14px",
    background: "#f8fafc", borderRadius: 8, fontSize: 14, marginBottom: 12, color: "#475569",
  },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  workerRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 14px", border: "1px solid #e2e8f0", borderRadius: 8,
  },
  workerInfo: { display: "flex", alignItems: "center", gap: 10 },
  statusBadge: { padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  actions: { display: "flex", gap: 6 },
  absentBtn: {
    padding: "6px 14px", fontSize: 13, color: "#b91c1c", background: "#fee2e2",
    border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600,
  },
  lateBtn: {
    padding: "6px 14px", fontSize: 13, color: "#854d0e", background: "#fef9c3",
    border: "none", borderRadius: 6, cursor: "pointer", fontWeight: 600,
  },
  hint: { marginTop: 16, padding: "10px 12px", background: "#f0fdfa", color: "#0f766e", borderRadius: 8, fontSize: 13 },
  muted: { color: "#94a3b8", fontSize: 14 },
};