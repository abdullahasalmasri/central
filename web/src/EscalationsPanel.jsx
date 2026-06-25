import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// لوحة الاعتراضات المعلّقة: تعرض الاعتراضات التي المستخدم معالجها الحالي.
export default function EscalationsPanel({ user, onClose }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [noteFor, setNoteFor] = useState(""); // أي اعتراض مفتوح لكتابة ملاحظة
  const [noteText, setNoteText] = useState("");
  const [pendingAction, setPendingAction] = useState(""); // الإجراء المنتظر تأكيده

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      // الاعتراضات التي أنا معالجها الحالي وحالتها "objected"
      const snap = await getDocs(
        query(
          collection(db, "attendanceExceptions"),
          where("currentHandlerUid", "==", user.uid),
          where("status", "==", "objected")
        )
      );
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setItems(list);
    } catch (err) {
      setError("تعذّر تحميل الاعتراضات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function act(exceptionId, action, note) {
    setBusy(exceptionId);
    setError("");
    try {
      const fn = httpsCallable(functions, "resolveException");
      await fn({ exceptionId: exceptionId, action: action, note: note || "" });
      setNoteFor("");
      setNoteText("");
      setPendingAction("");
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر تنفيذ الإجراء.");
    } finally {
      setBusy("");
    }
  }

  // يفتح صندوق الملاحظة لإجراء معيّن
  function openNote(exceptionId, action) {
    setNoteFor(exceptionId);
    setPendingAction(action);
    setNoteText("");
  }

  function actionLabel(a) {
    if (a === "accept_excuse") return "قبول العذر";
    if (a === "confirm_absence") return "تثبيت الغياب";
    if (a === "escalate") return "تصعيد لأعلى";
    return a;
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>الاعتراضات المعلّقة</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : items.length === 0 ? (
          <p style={styles.muted}>لا توجد اعتراضات بحاجة لقرارك. 👍</p>
        ) : (
          <div style={styles.list}>
            {items.map((ex) => (
              <div key={ex.id} style={styles.card}>
                <div style={styles.cardHead}>
                  <div>
                    <strong style={styles.subject}>{ex.subjectName || "عامل"}</strong>
                    <span style={styles.type}>
                      {ex.exceptionType === "absent" ? "غياب" : "تأخير"}
                    </span>
                  </div>
                  <span style={styles.date}>{ex.date}</span>
                </div>

                {/* اعتراض العامل */}
                <div style={styles.objection}>
                  <span style={styles.objLabel}>اعتراض العامل:</span>
                  <p style={styles.objText}>{ex.workerResponse || "—"}</p>
                </div>

                {/* ملاحظة المشرف الأصلية إن وُجدت */}
                {ex.supervisorNote ? (
                  <p style={styles.supNote}>ملاحظة المشرف: {ex.supervisorNote}</p>
                ) : null}

                {/* سجل التصعيد إن وُجد */}
                {Array.isArray(ex.escalationHistory) && ex.escalationHistory.length > 0 ? (
                  <div style={styles.history}>
                    <span style={styles.histLabel}>سجل المعالجة:</span>
                    {ex.escalationHistory.map((h, i) => (
                      <div key={i} style={styles.histItem}>
                        • {h.byName || "—"}: {actionLabel(h.action)}
                        {h.note ? ` — ${h.note}` : ""}
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* صندوق الملاحظة + التأكيد */}
                {noteFor === ex.id ? (
                  <div style={styles.noteBox}>
                    <p style={styles.confirmLabel}>
                      {actionLabel(pendingAction)} — أضف ملاحظة (اختياري):
                    </p>
                    <textarea
                      style={styles.textarea}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      placeholder="سبب القرار..."
                      rows={2}
                      disabled={busy === ex.id}
                    />
                    <div style={styles.noteActions}>
                      <button
                        style={styles.cancelBtn}
                        onClick={() => { setNoteFor(""); setPendingAction(""); }}
                        disabled={busy === ex.id}
                      >
                        إلغاء
                      </button>
                      <button
                        style={styles.confirmBtn}
                        onClick={() => act(ex.id, pendingAction, noteText)}
                        disabled={busy === ex.id}
                      >
                        {busy === ex.id ? "..." : `تأكيد: ${actionLabel(pendingAction)}`}
                      </button>
                    </div>
                  </div>
                ) : (
                  // أزرار الإجراءات الثلاثة
                  <div style={styles.actions}>
                    <button
                      style={styles.acceptBtn}
                      onClick={() => openNote(ex.id, "accept_excuse")}
                      disabled={busy === ex.id}
                    >
                      قبول العذر
                    </button>
                    <button
                      style={styles.confirmAbsBtn}
                      onClick={() => openNote(ex.id, "confirm_absence")}
                      disabled={busy === ex.id}
                    >
                      تثبيت الغياب
                    </button>
                    <button
                      style={styles.escalateBtn}
                      onClick={() => openNote(ex.id, "escalate")}
                      disabled={busy === ex.id}
                    >
                      تصعيد ↑
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <p style={styles.hint}>
          «قبول العذر» يُلغي الغياب ويعيد العامل حاضرًا. «تثبيت الغياب» يثبّته نهائيًا. «تصعيد» يرفعه لمديرك.
        </p>
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
    width: "100%", maxWidth: 580, background: "#fff", borderRadius: 12, padding: 28,
    fontFamily: "system-ui, sans-serif", direction: "rtl", textAlign: "right",
    maxHeight: "90vh", overflowY: "auto",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  list: { display: "flex", flexDirection: "column", gap: 14 },
  card: { padding: 18, border: "1px solid #fecaca", borderRadius: 12, background: "#fef2f2" },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  subject: { fontSize: 16 },
  type: { marginRight: 8, padding: "3px 10px", background: "#fee2e2", color: "#b91c1c", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  date: { fontSize: 13, color: "#64748b" },
  objection: { padding: "10px 12px", background: "#fff", borderRadius: 8, marginBottom: 8 },
  objLabel: { fontSize: 12, fontWeight: 700, color: "#9a3412" },
  objText: { margin: "4px 0 0", fontSize: 14, color: "#0f172a" },
  supNote: { margin: "0 0 8px", fontSize: 13, color: "#64748b" },
  history: { padding: "10px 12px", background: "#f8fafc", borderRadius: 8, marginBottom: 8 },
  histLabel: { fontSize: 12, fontWeight: 700, color: "#475569" },
  histItem: { fontSize: 13, color: "#475569", marginTop: 4 },
  actions: { display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" },
  acceptBtn: {
    flex: 1, minWidth: 100, padding: "10px", fontSize: 13, fontWeight: 600, color: "#fff",
    background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer",
  },
  confirmAbsBtn: {
    flex: 1, minWidth: 100, padding: "10px", fontSize: 13, fontWeight: 600, color: "#fff",
    background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer",
  },
  escalateBtn: {
    flex: 1, minWidth: 100, padding: "10px", fontSize: 13, fontWeight: 600, color: "#fff",
    background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer",
  },
  noteBox: { marginTop: 12, padding: 12, background: "#fff", borderRadius: 8, border: "1px solid #e2e8f0" },
  confirmLabel: { margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "#0f172a" },
  textarea: {
    width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc",
    borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical",
  },
  noteActions: { display: "flex", gap: 8, marginTop: 8 },
  cancelBtn: {
    flex: 1, padding: "10px", fontSize: 14, color: "#475569", background: "#f1f5f9",
    border: "none", borderRadius: 8, cursor: "pointer",
  },
  confirmBtn: {
    flex: 2, padding: "10px", fontSize: 14, fontWeight: 600, color: "#fff",
    background: "#0f766e", border: "none", borderRadius: 8, cursor: "pointer",
  },
  hint: { marginTop: 16, padding: "10px 12px", background: "#f0fdfa", color: "#0f766e", borderRadius: 8, fontSize: 13 },
  error: { marginBottom: 16, padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
  muted: { color: "#94a3b8", fontSize: 14 },
};