import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   المواد — قسم العمليات
   تكامل مع المشتريات: تخصيص الأصناف/المواد للمشاريع بكمية.
   المادة تُستهلك (كمية × سعر) — لا توزيع شهري.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const suggestedCost = (item) => (item.approvedCost != null ? item.approvedCost : (item.estimatedCost != null ? item.estimatedCost : 0));

export default function MaterialsView() {
  const [tenantId, setTenantId] = useState("");
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showAllocate, setShowAllocate] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة."); setLoading(false); return; }
        setTenantId(tid);
      } catch (e) {
        setError("تعذّر تحميل بيانات المستخدم."); setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (tenantId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [pSnap, iSnap, alSnap] = await Promise.all([
        getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "items"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "materialAllocations"), where("tenantId", "==", tenantId), where("status", "==", "active"))),
      ]);
      const pList = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      pList.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
      setProjects(pList);
      setItems(iSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAllocations(alSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (!selectedProjectId && pList.length > 0) setSelectedProjectId(pList[0].id);
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const projectMaterials = allocations.filter((a) => a.projectId === selectedProjectId);
  const totalCost = projectMaterials.reduce((s, a) => s + (Number(a.totalCost) || 0), 0);
  const totalSell = projectMaterials.reduce((s, a) => s + (Number(a.totalSell) || 0), 0);
  const totalProfit = totalSell - totalCost;
  const hasSelling = projectMaterials.some((a) => (Number(a.totalSell) || 0) > 0);

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>المواد</h1>
          <p style={styles.pageSub}>تخصيص المواد والأصناف للمشاريع — متكامل مع المشتريات.</p>
        </div>
        {selectedProject ? (
          <button style={styles.addBtn} onClick={() => setShowAllocate(true)} disabled={items.length === 0}>+ تخصيص مادة</button>
        ) : null}
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : projects.length === 0 ? (
        <div style={styles.warnBox}>⚠ لا توجد مشاريع. أنشئ مشروعًا أولًا من <strong>العمليات ← المشاريع</strong>.</div>
      ) : (
        <>
          <div style={styles.selectorRow}>
            <label style={styles.selectorLabel}>المشروع:</label>
            <select style={styles.projectSelect} value={selectedProjectId} onChange={(e) => setSelectedProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>#{p.projectNumber} — {p.name}{p.customerName ? ` (${p.customerName})` : ""}</option>)}
            </select>
          </div>

          {items.length === 0 ? (
            <div style={styles.warnBox}>⚠ لا توجد أصناف. أضف أصنافًا من <strong>المالية ← المشتريات</strong>.</div>
          ) : null}

          {projectMaterials.length > 0 ? (
            <div style={styles.summaryCards}>
              <div style={styles.sumCard}>
                <span style={styles.sumLabel}>تكلفة المواد</span>
                <span style={{ ...styles.sumValue, color: "#c2410c" }} dir="ltr">{fmt(totalCost)}</span>
              </div>
              {hasSelling ? (
                <>
                  <div style={styles.sumCard}>
                    <span style={styles.sumLabel}>إجمالي البيع</span>
                    <span style={styles.sumValue} dir="ltr">{fmt(totalSell)}</span>
                  </div>
                  <div style={styles.sumCard}>
                    <span style={styles.sumLabel}>الربح</span>
                    <span style={{ ...styles.sumValue, color: totalProfit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{fmt(totalProfit)}</span>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {projectMaterials.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>📦</div>
              <p style={styles.emptyTitle}>لا توجد مواد مخصّصة لهذا المشروع</p>
              <p style={styles.muted}>اضغط «+ تخصيص مادة» لتخصيص أول مادة.</p>
            </div>
          ) : (
            <div style={styles.panel}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>الصنف</th>
                    <th style={styles.thCenter}>الكمية</th>
                    <th style={styles.thNum}>سعر الوحدة</th>
                    <th style={styles.thNum}>التكلفة</th>
                    {hasSelling ? <th style={styles.thNum}>سعر البيع</th> : null}
                    {hasSelling ? <th style={styles.thNum}>الربح</th> : null}
                    <th style={styles.thCenter}>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {projectMaterials.map((a) => {
                    const profit = (Number(a.totalSell) || 0) - (Number(a.totalCost) || 0);
                    return (
                      <tr key={a.id}>
                        <td style={styles.tdName}>
                          {a.itemCode ? <span style={styles.codeTag}>{a.itemCode}</span> : null}
                          <strong>{a.itemName}</strong>
                        </td>
                        <td style={styles.tdCenter}>{fmt(a.quantity)} {a.unit || ""}</td>
                        <td style={styles.tdNum} dir="ltr">{fmt(a.unitCost)}</td>
                        <td style={styles.tdNum} dir="ltr">{fmt(a.totalCost)}</td>
                        {hasSelling ? <td style={styles.tdNum} dir="ltr">{(Number(a.totalSell) || 0) > 0 ? fmt(a.totalSell) : "—"}</td> : null}
                        {hasSelling ? <td style={{ ...styles.tdNum, color: profit >= 0 ? "#059669" : "#dc2626", fontWeight: 700 }} dir="ltr">{(Number(a.totalSell) || 0) > 0 ? (profit >= 0 ? "+" : "") + fmt(profit) : "—"}</td> : null}
                        <td style={styles.tdCenter}>
                          <RemoveBtn allocationId={a.id} name={a.itemName} onDone={loadData} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={styles.totalRow}>
                    <td colSpan={3} style={styles.tdTotal}>الإجمالي ({projectMaterials.length} مادة)</td>
                    <td style={styles.tdTotalNum} dir="ltr">{fmt(totalCost)}</td>
                    {hasSelling ? <td style={styles.tdTotalNum} dir="ltr">{fmt(totalSell)}</td> : null}
                    {hasSelling ? <td style={{ ...styles.tdTotalNum, color: totalProfit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{fmt(totalProfit)}</td> : null}
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <p style={styles.hint}>💡 المادة تُستهلك بالكامل في المشروع (لا توزيع). سعر البيع اختياري — للمواد التي تُباع للعميل.</p>
            </div>
          )}
        </>
      )}

      {showAllocate && selectedProject ? (
        <AllocateModal
          project={selectedProject}
          items={items}
          onClose={() => setShowAllocate(false)}
          onSaved={() => { setShowAllocate(false); loadData(); }}
        />
      ) : null}
    </div>
  );
}

function RemoveBtn({ allocationId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`إزالة ${name} من هذا المشروع؟`)) return;
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "removeMaterialAllocation");
      await fn({ allocationId });
      onDone();
    } catch (e) {
      alert(e.message || "تعذّر الإزالة.");
      setBusy(false);
    }
  }
  return <button style={styles.removeBtn} onClick={remove} disabled={busy}>{busy ? "..." : "إزالة"}</button>;
}

// ═══════════ مودال التخصيص ═══════════
function AllocateModal({ project, items, onClose, onSaved }) {
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitSellPrice, setUnitSellPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedItem = items.find((i) => i.id === itemId) || null;

  function onSelectItem(id) {
    setItemId(id);
    const item = items.find((i) => i.id === id);
    if (item) {
      setUnitCost(String(suggestedCost(item)));
      setUnitSellPrice(item.sellingPrice != null ? String(item.sellingPrice) : "");
    } else {
      setUnitCost(""); setUnitSellPrice("");
    }
  }

  const qty = Number(quantity) || 0;
  const totalCost = Math.round(qty * (Number(unitCost) || 0) * 100) / 100;
  const totalSell = Math.round(qty * (Number(unitSellPrice) || 0) * 100) / 100;
  const profit = totalSell - totalCost;

  async function save() {
    setErr("");
    if (!itemId) { setErr("اختر صنفًا."); return; }
    if (qty <= 0) { setErr("أدخل كمية صحيحة."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "allocateMaterialToProject");
      await fn({
        projectId: project.id, itemId,
        quantity: qty, unitCost: Number(unitCost) || 0, unitSellPrice: Number(unitSellPrice) || 0,
        notes,
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر التخصيص.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>تخصيص مادة — {project.name}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        {items.length === 0 ? (
          <p style={styles.muted}>لا توجد أصناف. أضف أصنافًا من المشتريات أولًا.</p>
        ) : (
          <>
            <div style={styles.field}>
              <label style={styles.label}>الصنف *</label>
              <select style={styles.input} value={itemId} onChange={(e) => onSelectItem(e.target.value)} disabled={saving}>
                <option value="">— اختر صنفًا —</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.itemCode ? ` (${i.itemCode})` : ""}{i.unit ? ` — ${i.unit}` : ""}</option>)}
              </select>
            </div>

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>الكمية * {selectedItem && selectedItem.unit ? `(${selectedItem.unit})` : ""}</label>
                <input style={styles.input} type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} disabled={saving} dir="ltr" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>سعر الوحدة (التكلفة)</label>
                <input style={styles.input} type="number" min="0" step="any" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} disabled={saving} dir="ltr" />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>سعr بيع الوحدة (اختياري — لو تُباع للعميل)</label>
              <input style={styles.input} type="number" min="0" step="any" value={unitSellPrice} onChange={(e) => setUnitSellPrice(e.target.value)} disabled={saving} dir="ltr" />
            </div>

            {qty > 0 ? (
              <div style={styles.preview}>
                <div style={styles.previewRow}><span>التكلفة الكلية</span><span style={styles.previewCost} dir="ltr">{fmt(totalCost)}</span></div>
                {totalSell > 0 ? <div style={styles.previewRow}><span>إجمالي البيع</span><span style={styles.previewSell} dir="ltr">{fmt(totalSell)}</span></div> : null}
                {totalSell > 0 ? <div style={styles.previewRow}><span>الربح</span><span style={{ ...styles.previewProfit, color: profit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{profit >= 0 ? "+" : ""}{fmt(profit)}</span></div> : null}
              </div>
            ) : null}

            <div style={styles.field}>
              <label style={styles.label}>ملاحظات</label>
              <input style={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
            </div>
          </>
        )}

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving || items.length === 0}>{saving ? "جارٍ التخصيص..." : "تخصيص"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#ea580c", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  selectorRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 18, background: "#fff", padding: "14px 18px", borderRadius: 12, border: "1px solid #e2e8f0" },
  selectorLabel: { fontSize: 14, fontWeight: 700, color: "#334155", whiteSpace: "nowrap" },
  projectSelect: { flex: 1, padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", background: "#fff" },

  summaryCards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 18 },
  sumCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6 },
  sumLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },
  sumValue: { fontSize: 22, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  empty: { padding: 48, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },

  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "auto" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 640 },
  th: { textAlign: "right", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" },
  thNum: { textAlign: "left", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" },
  thCenter: { textAlign: "center", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" },
  tdName: { padding: "11px 14px", fontSize: 14, borderBottom: "1px solid #f1f5f9", color: "#334155", whiteSpace: "nowrap" },
  tdNum: { padding: "11px 14px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" },
  tdCenter: { padding: "11px 14px", fontSize: 14, textAlign: "center", borderBottom: "1px solid #f1f5f9" },
  codeTag: { display: "inline-block", padding: "1px 8px", marginLeft: 8, background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },
  totalRow: { background: "#f8fafc" },
  tdTotal: { padding: "12px 14px", fontSize: 14, fontWeight: 800, color: "#0f172a", borderTop: "2px solid #e2e8f0" },
  tdTotalNum: { padding: "12px 14px", fontSize: 14, fontWeight: 800, color: "#0f172a", textAlign: "left", borderTop: "2px solid #e2e8f0", fontFamily: "monospace" },
  hint: { fontSize: 12, color: "#94a3b8", padding: "12px 14px", margin: 0, lineHeight: 1.6 },

  removeBtn: { padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  row: { display: "flex", gap: 12, marginBottom: 12 },

  preview: { background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 12 },
  previewRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, color: "#475569", padding: "4px 0" },
  previewCost: { fontSize: 16, fontWeight: 800, color: "#c2410c", fontFamily: "monospace" },
  previewSell: { fontSize: 16, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  previewProfit: { fontSize: 16, fontWeight: 800, fontFamily: "monospace" },

  modalActions: { display: "flex", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
};
