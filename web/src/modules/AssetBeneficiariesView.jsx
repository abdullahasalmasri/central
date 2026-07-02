import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   ربط السكن والمواصلات بالمستفيدين
   يربط الموظفين بأصول السكن/المركبات (beneficiaries)، فتُحسب
   حصة السكن/المواصلات تلقائيًا في التسعير المرجعي.
   المستفيد = معرّف الموظف (employee document ID).
   ============================================================ */

const typeLabel = (t) => (t === "housing" ? "🏠 سكن" : t === "vehicle" ? "🚗 مركبة" : t);

export default function AssetBeneficiariesView() {
  const [tenantId, setTenantId] = useState("");
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [editAsset, setEditAsset] = useState(null); // أصل يُعدّل مستفيديه
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("يجب تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("حسابك غير مرتبط بشركة."); setLoading(false); return; }
        setTenantId(tid);
      } catch (e) { setError(e.message || "خطأ."); setLoading(false); }
    })();
  }, []);

  useEffect(() => { if (tenantId) loadData(); /* eslint-disable-next-line */ }, [tenantId]);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [aSnap, eSnap] = await Promise.all([
        getDocs(query(collection(db, "assets"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "employees"), where("tenantId", "==", tenantId))),
      ]);
      const allAssets = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((a) => (a.type === "housing" || a.type === "vehicle") && a.status !== "inactive");
      allAssets.sort((a, b) => (a.type || "").localeCompare(b.type || ""));
      setAssets(allAssets);
      const emps = eSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((e) => e.status !== "inactive");
      emps.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
      setEmployees(emps);
    } catch (e) {
      setError(e.message || "تعذّر التحميل.");
    } finally { setLoading(false); }
  }

  function openEdit(asset) {
    setEditAsset(asset);
    setSelected(Array.isArray(asset.beneficiaries) ? [...asset.beneficiaries] : []);
    setMsg("");
  }

  function toggle(empId) {
    setSelected((prev) => prev.includes(empId) ? prev.filter((x) => x !== empId) : [...prev, empId]);
  }

  async function save() {
    if (!editAsset) return;
    const cap = Number(editAsset.capacity) || 0;
    if (cap > 0 && selected.length > cap) {
      setError(`السعة ${cap} فقط، اخترت ${selected.length}.`); return;
    }
    setBusy(true); setError("");
    try {
      await httpsCallable(functions, "setAssetBeneficiaries")({ assetId: editAsset.id, beneficiaries: selected });
      setMsg(`حُفظ المستفيدون للأصل «${editAsset.name}».`);
      setEditAsset(null); setSelected([]);
      await loadData();
    } catch (e) {
      setError(e.message || "تعذّر الحفظ.");
    } finally { setBusy(false); }
  }

  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? e.name : "—"; };

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>ربط السكن والمواصلات</h1>
          <p style={styles.pageSub}>اربط الموظفين بأصول السكن والمركبات، فتُحسب حصتهم تلقائيًا في التسعير المرجعي.</p>
        </div>
      </div>

      <div style={styles.hint}>💡 حصة السكن/المواصلات في عرض السعر = (الإيجار + المصروفات) ÷ عدد المستفيدين. بدون ربط، الحصة = صفر.</div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={styles.success}>{msg}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : assets.length === 0 ? (
        <div style={styles.emptyBox}>لا توجد أصول سكن أو مركبات. أضِفها من شاشة الأصول أولاً.</div>
      ) : (
        <div style={styles.list}>
          {assets.map((a) => {
            const bens = Array.isArray(a.beneficiaries) ? a.beneficiaries : [];
            const cap = Number(a.capacity) || 0;
            return (
              <div key={a.id} style={styles.card}>
                <div style={styles.cardMain}>
                  <div style={styles.cardHead}>
                    <span style={styles.typeBadge}>{typeLabel(a.type)}</span>
                    <span style={styles.assetName}>{a.name}</span>
                    {a.location ? <span style={styles.assetLoc}>{a.location}</span> : null}
                  </div>
                  <div style={styles.cardMeta}>
                    الإيجار: {(Number(a.monthlyRent) || 0).toLocaleString("en-US")} ر.س
                    {cap > 0 ? ` · السعة: ${bens.length}/${cap}` : ` · المستفيدون: ${bens.length}`}
                  </div>
                  {bens.length > 0 ? (
                    <div style={styles.bensRow}>
                      {bens.slice(0, 5).map((id) => <span key={id} style={styles.benChip}>{empName(id)}</span>)}
                      {bens.length > 5 ? <span style={styles.benMore}>+{bens.length - 5}</span> : null}
                    </div>
                  ) : <div style={styles.noBens}>لا مستفيدين — الحصة صفر</div>}
                </div>
                <button style={styles.editBtn} onClick={() => openEdit(a)}>👥 ربط المستفيدين</button>
              </div>
            );
          })}
        </div>
      )}

      {/* modal اختيار المستفيدين */}
      {editAsset ? (
        <div style={styles.overlay} onClick={() => setEditAsset(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <h2 style={styles.modalTitle}>مستفيدو «{editAsset.name}»</h2>
              <button style={styles.closeBtn} onClick={() => setEditAsset(null)}>✕</button>
            </div>
            <div style={styles.modalMeta}>
              {typeLabel(editAsset.type)} · اختَرت {selected.length}{Number(editAsset.capacity) > 0 ? ` من ${editAsset.capacity}` : ""}
            </div>
            <div style={styles.empList}>
              {employees.length === 0 ? <p style={styles.muted}>لا يوجد موظفون.</p> : employees.map((e) => (
                <label key={e.id} style={{ ...styles.empRow, ...(selected.includes(e.id) ? styles.empRowActive : {}) }}>
                  <input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} disabled={busy} style={styles.checkbox} />
                  <span style={styles.empName}>{e.name}</span>
                  <span style={styles.empInfo}>
                    {(e.job && e.job.title) || "—"}{e.nationality ? ` · ${e.nationality}` : ""}
                  </span>
                </label>
              ))}
            </div>
            <div style={styles.modalFoot}>
              <button style={styles.cancelBtn} onClick={() => setEditAsset(null)} disabled={busy}>إلغاء</button>
              <button style={styles.saveBtn} onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ..." : "حفظ المستفيدين"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { marginBottom: 16 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#b45309", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },

  hint: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 13, color: "#92400e", marginBottom: 16 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  success: { padding: "10px 12px", background: "#dcfce7", color: "#15803d", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
  emptyBox: { padding: "40px 20px", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#94a3b8", fontSize: 15 },

  list: { display: "flex", flexDirection: "column", gap: 12 },
  card: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", gap: 16, flexWrap: "wrap" },
  cardMain: { flex: 1, minWidth: 240 },
  cardHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" },
  typeBadge: { fontSize: 13, fontWeight: 700, color: "#b45309", background: "#fffbeb", padding: "4px 12px", borderRadius: 8 },
  assetName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  assetLoc: { fontSize: 12, color: "#94a3b8" },
  cardMeta: { fontSize: 13, color: "#64748b", marginBottom: 8 },
  bensRow: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  benChip: { fontSize: 12, fontWeight: 600, color: "#334155", background: "#f1f5f9", padding: "3px 10px", borderRadius: 6 },
  benMore: { fontSize: 12, fontWeight: 700, color: "#b45309" },
  noBens: { fontSize: 12, color: "#dc2626", fontWeight: 600 },
  editBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#b45309", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px 12px" },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  closeBtn: { width: 32, height: 32, border: "none", background: "#f1f5f9", borderRadius: 8, fontSize: 16, cursor: "pointer", color: "#64748b" },
  modalMeta: { padding: "0 22px 12px", fontSize: 13, color: "#b45309", fontWeight: 600, borderBottom: "1px solid #e2e8f0" },
  empList: { padding: "12px 16px", overflowY: "auto", flex: 1 },
  empRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 4 },
  empRowActive: { background: "#fffbeb" },
  checkbox: { width: 18, height: 18, cursor: "pointer", accentColor: "#b45309" },
  empName: { fontSize: 14, fontWeight: 600, color: "#0f172a", flex: 1 },
  empInfo: { fontSize: 12, color: "#94a3b8" },
  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: "1px solid #e2e8f0" },
  cancelBtn: { padding: "10px 18px", fontSize: 14, color: "#64748b", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  saveBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#b45309", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
};
