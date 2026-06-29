import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   المرافق — قسم العمليات
   تكامل مع قسم الأصول: إسناد الأصول/المعدات للمشاريع.
   التكلفة (إيجار الأصل) تتوزّع عند مشاركة الأصل بين مشاريع.
   ============================================================ */

const ASSET_TYPE_LABEL = { housing: "سكن", vehicle: "مركبة", equipment: "معدة", other: "أخرى" };
const ASSET_TYPE_ICON = { housing: "🏠", vehicle: "🚗", equipment: "🔧", other: "📦" };
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");

export default function FacilitiesView() {
  const [tenantId, setTenantId] = useState("");
  const [projects, setProjects] = useState([]);
  const [assets, setAssets] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [costing, setCosting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [costingLoading, setCostingLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [showAssign, setShowAssign] = useState(false);

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

  useEffect(() => {
    if (tenantId && selectedProjectId) loadCosting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [pSnap, aSnap, asgSnap] = await Promise.all([
        getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "assets"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "assetAssignments"), where("tenantId", "==", tenantId), where("status", "==", "active"))),
      ]);
      const pList = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      pList.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
      setProjects(pList);
      setAssets(aSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setAssignments(asgSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      if (!selectedProjectId && pList.length > 0) setSelectedProjectId(pList[0].id);
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCosting() {
    setCostingLoading(true);
    try {
      const fn = httpsCallable(functions, "getAssetsCosting");
      const res = await fn({ projectId: selectedProjectId });
      setCosting(res.data);
    } catch (e) {
      setCosting(null);
    } finally {
      setCostingLoading(false);
    }
  }

  function reloadAll() { loadData(); loadCosting(); }

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;
  const rows = costing ? costing.assignments : [];

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>المرافق</h1>
          <p style={styles.pageSub}>إسناد الأصول والمعدات للمشاريع — متكامل مع قسم الأصول.</p>
        </div>
        {selectedProject ? (
          <button style={styles.addBtn} onClick={() => setShowAssign(true)} disabled={assets.length === 0}>+ إسناد أصل</button>
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

          {assets.length === 0 ? (
            <div style={styles.warnBox}>⚠ لا توجد أصول. أضف أصولًا من <strong>الأصول والمرافق</strong>.</div>
          ) : null}

          {costing && costing.summary && costing.summary.count > 0 ? (
            <div style={styles.summaryCards}>
              <div style={styles.sumCard}>
                <span style={styles.sumLabel}>إجمالي الإيراد</span>
                <span style={styles.sumValue} dir="ltr">{fmt(costing.summary.totalRevenue)}</span>
              </div>
              <div style={styles.sumCard}>
                <span style={styles.sumLabel}>إجمالي التكلفة</span>
                <span style={{ ...styles.sumValue, color: "#c2410c" }} dir="ltr">{fmt(costing.summary.totalCost)}</span>
              </div>
              <div style={styles.sumCard}>
                <span style={styles.sumLabel}>صافي الربح</span>
                <span style={{ ...styles.sumValue, color: costing.summary.totalNetProfit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{fmt(costing.summary.totalNetProfit)}</span>
              </div>
            </div>
          ) : null}

          {costingLoading ? <p style={styles.muted}>جارٍ حساب التكاليف...</p> : rows.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>🏭</div>
              <p style={styles.emptyTitle}>لا توجد أصول مسندة لهذا المشروع</p>
              <p style={styles.muted}>اضغط «+ إسناد أصل» لإسناد أول أصل.</p>
            </div>
          ) : (
            <div style={styles.cardsGrid}>
              {rows.map((r) => (
                <div key={r.assignmentId} style={styles.assetCard}>
                  <div style={styles.assetCardTop}>
                    <div style={styles.assetInfo}>
                      <span style={styles.assetIcon}>{ASSET_TYPE_ICON[r.assetType] || "📦"}</span>
                      <div>
                        <div style={styles.assetNameRow}>
                          {r.assetCode ? <span style={styles.codeTag}>#{r.assetCode}</span> : null}
                          <span style={styles.assetName}>{r.assetName}</span>
                          {r.isShared ? <span style={styles.sharedTag} title={`مشترك في ${r.projectsCount} مشاريع`}>🔗 مشترك ({r.projectsCount})</span> : null}
                        </div>
                        <div style={styles.assetType}>{ASSET_TYPE_LABEL[r.assetType] || r.assetTypeName || "أصل"}</div>
                      </div>
                    </div>
                    <RemoveBtn assignmentId={r.assignmentId} name={r.assetName} onDone={reloadAll} />
                  </div>

                  <div style={styles.assetFooter}>
                    {r.isShared ? (
                      <div style={styles.footItem}><span style={styles.footLabel}>التكلفة الكلية</span><span style={styles.footFull} dir="ltr">{fmt(r.fullCost)}</span></div>
                    ) : null}
                    <div style={styles.footItem}><span style={styles.footLabel}>{r.isShared ? "نصيب المشروع" : "التكلفة"}</span><span style={styles.footCost} dir="ltr">{fmt(r.costShare)}</span></div>
                    <div style={styles.footItem}><span style={styles.footLabel}>الإيراد</span><span style={styles.footRev} dir="ltr">{fmt(r.revenue)}</span></div>
                    <div style={styles.footItem}><span style={styles.footLabel}>صافي الربح</span><span style={{ ...styles.footNet, color: r.netProfit >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{r.netProfit >= 0 ? "+" : ""}{fmt(r.netProfit)}</span></div>
                  </div>
                </div>
              ))}
              <p style={styles.hint}>💡 تكلفة الأصل (الإيجار) تتوزّع بالتساوي عند مشاركته بين مشاريع متعددة.</p>
            </div>
          )}
        </>
      )}

      {showAssign && selectedProject ? (
        <AssignModal
          project={selectedProject}
          assets={assets}
          allAssignments={assignments}
          onClose={() => setShowAssign(false)}
          onSaved={() => { setShowAssign(false); reloadAll(); }}
        />
      ) : null}
    </div>
  );
}

function RemoveBtn({ assignmentId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`إزالة إسناد ${name} من هذا المشروع؟`)) return;
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "removeAssetAssignment");
      await fn({ assignmentId });
      onDone();
    } catch (e) {
      alert(e.message || "تعذّر الإزالة.");
      setBusy(false);
    }
  }
  return <button style={styles.removeBtn} onClick={remove} disabled={busy}>{busy ? "..." : "إزالة"}</button>;
}

// ═══════════ مودال الإسناد ═══════════
function AssignModal({ project, assets, allAssignments, onClose, onSaved }) {
  const [assetId, setAssetId] = useState("");
  const [rentalPrice, setRentalPrice] = useState("");
  const [rentalPeriod, setRentalPeriod] = useState("monthly");
  const [monthlyCost, setMonthlyCost] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const assignedHere = new Set(allAssignments.filter((a) => a.projectId === project.id).map((a) => a.assetId));
  const available = assets.filter((a) => a.status === "active" && !assignedHere.has(a.id));

  const selectedAsset = assets.find((a) => a.id === assetId) || null;
  const currentAssignments = assetId ? allAssignments.filter((a) => a.assetId === assetId && a.projectId !== project.id) : [];

  function onSelectAsset(id) {
    setAssetId(id);
    const asset = assets.find((a) => a.id === id);
    if (asset && asset.monthlyRent != null) setMonthlyCost(String(asset.monthlyRent));
    else setMonthlyCost("");
  }

  async function save() {
    setErr("");
    if (!assetId) { setErr("اختر أصلًا."); return; }
    if (rentalPrice === "" || Number(rentalPrice) < 0) { setErr("أدخل سعر التأجير."); return; }
    if (startDate && endDate && endDate < startDate) { setErr("تاريخ النهاية قبل البداية."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "assignAssetToProject");
      await fn({
        projectId: project.id, assetId,
        rentalPrice: Number(rentalPrice) || 0, rentalPeriod,
        monthlyCost: Number(monthlyCost) || 0,
        startDate, endDate, notes,
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الإسناد.");
    } finally {
      setSaving(false);
    }
  }

  const profit = rentalPrice !== "" ? Number(rentalPrice) - (Number(monthlyCost) || 0) : null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>إسناد أصل — {project.name}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        {available.length === 0 ? (
          <p style={styles.muted}>كل الأصول الفعّالة مسندة لهذا المشروع، أو لا توجد أصول فعّالة.</p>
        ) : (
          <>
            <div style={styles.field}>
              <label style={styles.label}>الأصل *</label>
              <select style={styles.input} value={assetId} onChange={(e) => onSelectAsset(e.target.value)} disabled={saving}>
                <option value="">— اختر أصلًا —</option>
                {available.map((a) => <option key={a.id} value={a.id}>{ASSET_TYPE_ICON[a.type] || "📦"} {a.name}{a.assetNumber ? ` (#${a.assetNumber})` : ""}{a.location ? ` — ${a.location}` : ""}</option>)}
              </select>
            </div>

            {selectedAsset && currentAssignments.length > 0 ? (
              <div style={styles.currentBox}>
                <div style={styles.currentTitle}>⚠️ مشترك حاليًا في {currentAssignments.length} مشروع:</div>
                {currentAssignments.map((a) => (
                  <div key={a.id} style={styles.currentItem}>
                    <span>📋 {a.projectName}</span>
                    <span dir="ltr">إيراده: {fmt(a.rentalPrice)}</span>
                  </div>
                ))}
                <div style={styles.currentNote}>💡 ستتوزّع التكلفة على كل مشاريعه تلقائيًا.</div>
              </div>
            ) : selectedAsset ? (
              <div style={styles.freeBox}>✓ غير مسند لأي مشروع آخر حاليًا.</div>
            ) : null}

            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>سعر التأجير (للعميل) *</label>
                <input style={styles.input} type="number" min="0" value={rentalPrice} onChange={(e) => setRentalPrice(e.target.value)} disabled={saving} dir="ltr" />
              </div>
              <div style={{ width: 110 }}>
                <label style={styles.label}>الفترة</label>
                <select style={styles.input} value={rentalPeriod} onChange={(e) => setRentalPeriod(e.target.value)} disabled={saving}>
                  <option value="monthly">شهري</option><option value="daily">يومي</option>
                </select>
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>التكلفة الشهرية (إيجار الأصل — قابلة للتعديل)</label>
              <input style={styles.input} type="number" min="0" value={monthlyCost} onChange={(e) => setMonthlyCost(e.target.value)} disabled={saving} dir="ltr" />
              {selectedAsset ? <span style={styles.costHint}>إيجار الأصل: {fmt(selectedAsset.monthlyRent)} ﷼</span> : null}
            </div>

            {profit !== null ? (
              <div style={{ ...styles.profitPreview, background: profit >= 0 ? "#ecfdf5" : "#fef2f2", color: profit >= 0 ? "#065f46" : "#991b1b" }}>
                <span>الربح التقديري {currentAssignments.length > 0 ? "(قبل التوزيع)" : ""}</span>
                <span dir="ltr">{profit >= 0 ? "+" : ""}{fmt(profit)} ﷼</span>
              </div>
            ) : null}

            <div style={styles.row}>
              <div style={{ flex: 1 }}><label style={styles.label}>من تاريخ</label><input style={styles.input} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={saving} dir="ltr" /></div>
              <div style={{ flex: 1 }}><label style={styles.label}>إلى تاريخ</label><input style={styles.input} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={saving} dir="ltr" /></div>
            </div>
            <div style={styles.field}>
              <label style={styles.label}>ملاحظات</label>
              <input style={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} />
            </div>
          </>
        )}

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving || available.length === 0}>{saving ? "جارٍ الإسناد..." : "إسناد"}</button>
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

  summaryCards: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 },
  sumCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6 },
  sumLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },
  sumValue: { fontSize: 22, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  empty: { padding: 48, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },

  cardsGrid: { display: "flex", flexDirection: "column", gap: 14 },
  assetCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px" },
  assetCardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 14 },
  assetInfo: { display: "flex", alignItems: "flex-start", gap: 12 },
  assetIcon: { fontSize: 28 },
  assetNameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  codeTag: { display: "inline-block", padding: "1px 8px", background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },
  assetName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  sharedTag: { padding: "2px 10px", background: "#fff7ed", color: "#c2410c", borderRadius: 10, fontSize: 11, fontWeight: 700 },
  assetType: { fontSize: 13, color: "#64748b", marginTop: 2 },

  assetFooter: { display: "flex", justifyContent: "space-around", gap: 10, paddingTop: 14, borderTop: "1px solid #f1f5f9" },
  footItem: { display: "flex", flexDirection: "column", gap: 4, textAlign: "center" },
  footLabel: { fontSize: 11, color: "#64748b", fontWeight: 600 },
  footFull: { fontSize: 16, fontWeight: 700, color: "#94a3b8", fontFamily: "monospace", textDecoration: "line-through" },
  footCost: { fontSize: 17, fontWeight: 800, color: "#c2410c", fontFamily: "monospace" },
  footRev: { fontSize: 17, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  footNet: { fontSize: 17, fontWeight: 800, fontFamily: "monospace" },
  hint: { fontSize: 12, color: "#94a3b8", margin: "4px 0 0", lineHeight: 1.6 },

  removeBtn: { padding: "5px 12px", fontSize: 12, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  row: { display: "flex", gap: 12, marginBottom: 12 },

  currentBox: { background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: "12px 14px", marginBottom: 12 },
  currentTitle: { fontSize: 13, fontWeight: 700, color: "#9a3412", marginBottom: 8 },
  currentItem: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#7c2d12", padding: "3px 0", fontFamily: "monospace" },
  currentNote: { fontSize: 11, color: "#c2410c", marginTop: 6 },
  freeBox: { background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#065f46", fontWeight: 600, marginBottom: 12 },

  costHint: { fontSize: 12, color: "#94a3b8", marginTop: 5 },
  profitPreview: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderRadius: 10, fontSize: 15, fontWeight: 800, fontFamily: "monospace", marginBottom: 12 },

  modalActions: { display: "flex", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
};
