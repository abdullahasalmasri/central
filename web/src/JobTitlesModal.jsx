import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// إدارة المهن (الموارد البشرية) — تُستخدم في طلبات العمالة وتصنيف العمّال.
export default function JobTitlesModal({ tenantId, onClose }) {
  const [titles, setTitles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "jobTitles"), where("tenantId", "==", tenantId)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
      setTitles(list);
    } catch (err) {
      setError("تعذّر تحميل المهن.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  async function addTitle() {
    setError("");
    if (name.trim().length < 2) { setError("اسم المهنة مطلوب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createJobTitle");
      await fn({ name: name.trim(), description: description.trim() });
      setName(""); setDescription(""); setShowAdd(false);
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر الإضافة.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(title) {
    setBusyId(title.id);
    setError("");
    try {
      const fn = httpsCallable(functions, "updateJobTitle");
      await fn({ jobTitleId: title.id, isActive: !(title.isActive !== false) });
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر التعديل.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>المهن ({titles.length})</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <p style={styles.intro}>عرّف المهن التي توظّف عليها (عامل بناء، سائق، مهندس...). تُستخدم في طلبات العمالة وتصنيف العمّال.</p>

        <button style={styles.addBtn} onClick={() => setShowAdd(!showAdd)}>+ إضافة مهنة</button>

        {showAdd ? (
          <div style={styles.addBox}>
            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>اسم المهنة *</label>
                <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: عامل بناء" disabled={saving} />
              </div>
              <div style={{ flex: 2 }}>
                <label style={styles.label}>الوصف</label>
                <input style={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
              </div>
            </div>
            <div style={styles.addActions}>
              <button style={styles.confirmBtn} onClick={addTitle} disabled={saving}>{saving ? "..." : "حفظ"}</button>
              <button style={styles.cancelBtn} onClick={() => { setShowAdd(false); setName(""); setDescription(""); }} disabled={saving}>إلغاء</button>
            </div>
          </div>
        ) : null}

        {error ? <div style={styles.error}>{error}</div> : null}

        {loading ? (
          <p style={styles.muted}>جارٍ التحميل...</p>
        ) : titles.length === 0 ? (
          <p style={styles.muted}>لا توجد مهن بعد. أضف أول مهنة.</p>
        ) : (
          <div style={styles.list}>
            {titles.map((t) => {
              const isActive = t.isActive !== false;
              return (
                <div key={t.id} style={{ ...styles.titleCard, ...(isActive ? {} : styles.inactiveCard) }}>
                  <div style={styles.titleInfo}>
                    <strong style={styles.titleName}>{t.name}</strong>
                    {!isActive ? <span style={styles.inactiveTag}>معطّلة</span> : null}
                    {t.description ? <div style={styles.titleDesc}>{t.description}</div> : null}
                  </div>
                  <button
                    style={isActive ? styles.disableBtn : styles.enableBtn}
                    onClick={() => toggleActive(t)}
                    disabled={busyId === t.id}
                  >
                    {busyId === t.id ? "..." : (isActive ? "تعطيل" : "تفعيل")}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 560, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  intro: { fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 16, padding: "10px 14px", background: "#f8fafc", borderRadius: 8 },
  addBtn: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#0f766e", border: "none", borderRadius: 8, cursor: "pointer", marginBottom: 16 },
  addBox: { padding: 16, background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 10, marginBottom: 16 },
  addActions: { display: "flex", gap: 8, marginTop: 12 },
  confirmBtn: { padding: "9px 20px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#0f766e", border: "none", borderRadius: 7, cursor: "pointer" },
  cancelBtn: { padding: "9px 18px", fontSize: 14, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  titleCard: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, gap: 12 },
  inactiveCard: { opacity: 0.6, background: "#f8fafc" },
  titleInfo: { flex: 1, minWidth: 0 },
  titleName: { fontSize: 15, color: "#0f172a" },
  titleDesc: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  inactiveTag: { marginRight: 8, fontSize: 10, color: "#b45309", background: "#fef3c7", padding: "1px 7px", borderRadius: 8, fontWeight: 600 },
  disableBtn: { padding: "7px 16px", fontSize: 13, fontWeight: 600, color: "#b45309", background: "#fef3c7", border: "none", borderRadius: 7, cursor: "pointer", flexShrink: 0 },
  enableBtn: { padding: "7px 16px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 7, cursor: "pointer", flexShrink: 0 },
  label: { display: "block", margin: "0 0 6px", fontSize: 13, fontWeight: 600 },
  input: { width: "100%", padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
};