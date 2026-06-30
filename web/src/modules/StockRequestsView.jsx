import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   طلبات المخزون الداخلية — قسم العمليات
   موظف يطلب أصنافًا من المخزون → موافقة المدير → صرف (يخصم من المخزون).
   getStockRequests / createStockRequest / decideStockRequest /
   fulfillStockRequest / deleteStockRequest.
   ============================================================ */

const STATUS_INFO = {
  pending: { label: "بانتظار الموافقة", color: "#ea580c", bg: "#ffedd5" },
  approved: { label: "موافق عليه", color: "#2563eb", bg: "#dbeafe" },
  rejected: { label: "مرفوض", color: "#dc2626", bg: "#fee2e2" },
  fulfilled: { label: "تم الصرف", color: "#16a34a", bg: "#dcfce7" },
};
const PRIORITY_INFO = {
  high: { label: "عاجل", color: "#dc2626" },
  normal: { label: "عادي", color: "#64748b" },
  low: { label: "منخفض", color: "#94a3b8" },
};
const PRIORITY_ORDER = ["high", "normal", "low"];
function fmtTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-GB");
}

export default function StockRequestsView() {
  const [tenantId, setTenantId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState("");

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
      const res = await httpsCallable(functions, "getStockRequests")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function act(fn, payload, id) {
    setBusyId(id);
    try {
      await httpsCallable(functions, fn)(payload);
      await loadData();
    } catch (e) {
      alert(e.message || "تعذّر تنفيذ العملية.");
    } finally {
      setBusyId("");
    }
  }

  const s = data ? data.summary : { pendingCount: 0, approvedCount: 0, fulfilledCount: 0, totalCount: 0 };
  const requests = data ? data.requests : [];
  const products = data ? data.products : [];
  const filtered = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>طلبات المخزون</h1>
          <p style={styles.pageSub}>طلبات صرف داخلية: طلب → موافقة → صرف من المخزون.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal({ newRequest: true, products })}>+ طلب جديد</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>بانتظار الموافقة</span><span style={{ ...styles.kpiValue, color: s.pendingCount > 0 ? "#ea580c" : "#16a34a" }}>{s.pendingCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>موافق عليها</span><span style={{ ...styles.kpiValue, color: "#2563eb" }}>{s.approvedCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>تم صرفها</span><span style={{ ...styles.kpiValue, color: "#16a34a" }}>{s.fulfilledCount}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>إجمالي الطلبات</span><span style={{ ...styles.kpiValue, color: "#0f172a" }}>{s.totalCount}</span></div>
          </div>

          {/* فلتر */}
          <div style={styles.filters}>
            {[["all", "الكل"], ["pending", "بانتظار"], ["approved", "موافق"], ["fulfilled", "مصروف"], ["rejected", "مرفوض"]].map(([k, lbl]) => (
              <button key={k} style={filter === k ? styles.filterOn : styles.filterOff} onClick={() => setFilter(k)}>{lbl}</button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={styles.warnBox}>{filter === "all" ? "لا توجد طلبات. أنشئ طلبًا جديدًا." : "لا توجد طلبات بهذه الحالة."}</div>
          ) : (
            <div style={styles.list}>
              {filtered.map((r) => {
                const st = STATUS_INFO[r.status] || STATUS_INFO.pending;
                const pr = PRIORITY_INFO[r.priority] || PRIORITY_INFO.normal;
                const busy = busyId === r.id;
                return (
                  <div key={r.id} style={styles.reqCard}>
                    <div style={styles.rTop}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.rTitleRow}>
                          <span style={styles.rNum}>#{String(r.requestNumber).padStart(4, "0")}</span>
                          {r.priority === "high" ? <span style={{ ...styles.prChip, color: pr.color }}>⬆ {pr.label}</span> : null}
                          <span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={styles.rMeta}>
                          {r.requestedBy ? <span>👤 {r.requestedBy}</span> : null}
                          {r.department ? <span>🏢 {r.department}</span> : null}
                          {r.createdAt ? <span dir="ltr">{fmtTime(r.createdAt)}</span> : null}
                        </div>
                      </div>
                    </div>

                    {r.purpose ? <div style={styles.rPurpose}>الغرض: {r.purpose}</div> : null}

                    {/* الأصناف */}
                    <div style={styles.itemsList}>
                      {(r.items || []).map((it, idx) => (
                        <span key={idx} style={styles.itemChip}>{it.name} <b dir="ltr">×{it.qty}</b> {it.unit || ""}</span>
                      ))}
                    </div>

                    {r.status === "rejected" && r.decisionReason ? <div style={styles.rejReason}>سبب الرفض: {r.decisionReason}</div> : null}
                    {r.decidedByName && (r.status === "approved" || r.status === "fulfilled") ? <div style={styles.decidedBy}>اعتمده: {r.decidedByName}</div> : null}

                    {/* إجراءات */}
                    <div style={styles.rActions}>
                      {r.status === "pending" ? (
                        <>
                          <button style={styles.approveBtn} onClick={() => act("decideStockRequest", { requestId: r.id, decision: "approve" }, r.id)} disabled={busy}>{busy ? "..." : "✓ موافقة"}</button>
                          <button style={styles.rejectBtn} onClick={() => { const reason = window.prompt("سبب الرفض (اختياري):") ?? ""; act("decideStockRequest", { requestId: r.id, decision: "reject", reason }, r.id); }} disabled={busy}>✕ رفض</button>
                          <DeleteBtn id={r.id} num={r.requestNumber} onDone={loadData} />
                        </>
                      ) : r.status === "approved" ? (
                        <>
                          <button style={styles.fulfillBtn} onClick={() => { if (window.confirm("صرف الطلب وخصمه من المخزون؟")) act("fulfillStockRequest", { requestId: r.id }, r.id); }} disabled={busy}>{busy ? "..." : "📦 صرف من المخزون"}</button>
                          <DeleteBtn id={r.id} num={r.requestNumber} onDone={loadData} />
                        </>
                      ) : r.status === "rejected" ? (
                        <DeleteBtn id={r.id} num={r.requestNumber} onDone={loadData} />
                      ) : (
                        <span style={styles.fulfilledNote}>✓ صُرف {r.fulfilledAt ? `بتاريخ ${fmtTime(r.fulfilledAt)}` : ""}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {modal && modal.newRequest ? <RequestModal products={modal.products} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ id, num, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف الطلب #${String(num).padStart(4, "0")}؟`)) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "deleteStockRequest")({ requestId: id });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑 حذف"}</button>;
}

function RequestModal({ products, onClose, onSaved }) {
  const [items, setItems] = useState([]); // [{productId, name, unit, qty}]
  const [purpose, setPurpose] = useState("");
  const [department, setDepartment] = useState("");
  const [priority, setPriority] = useState("normal");
  const [requestedBy, setRequestedBy] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);

  const q = search.trim().toLowerCase();
  const filtered = q ? products.filter((p) => (p.name || "").toLowerCase().includes(q)) : products;

  function addItem(p) {
    setItems((prev) => {
      const ex = prev.find((it) => it.productId === p.id);
      if (ex) return prev.map((it) => it.productId === p.id ? { ...it, qty: it.qty + 1 } : it);
      return [...prev, { productId: p.id, name: p.name, unit: p.unit, qty: 1, stock: p.quantity }];
    });
  }
  function changeQty(pid, delta) {
    setItems((prev) => prev.flatMap((it) => {
      if (it.productId !== pid) return [it];
      const nq = it.qty + delta;
      return nq < 1 ? [] : [{ ...it, qty: nq }];
    }));
  }
  function removeItem(pid) { setItems((prev) => prev.filter((it) => it.productId !== pid)); }

  async function save() {
    setErr("");
    if (items.length === 0) { setErr("اختر صنفًا واحدًا على الأقل."); return; }
    setSaving(true);
    try {
      await httpsCallable(functions, "createStockRequest")({
        items: items.map((it) => ({ productId: it.productId, qty: it.qty })),
        purpose: purpose.trim(),
        department: department.trim(),
        priority,
        requestedBy: requestedBy.trim(),
      });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الإنشاء."); setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>طلب مخزون جديد</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}

        {products.length === 0 ? <div style={styles.warnBox}>لا توجد أصناف في المخزون. أضفها أولًا من صفحة المخزون.</div> : (
          <div style={styles.reqGrid}>
            {/* اختيار الأصناف */}
            <div>
              <input style={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث عن صنف..." />
              <div style={styles.prodPick}>
                {filtered.slice(0, 30).map((p) => (
                  <button key={p.id} style={styles.prodPickBtn} onClick={() => addItem(p)}>
                    <span style={styles.ppName}>{p.name}</span>
                    <span style={styles.ppStock} dir="ltr">متوفّر: {p.quantity}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* الأصناف المطلوبة */}
            <div>
              <div style={styles.cartHead}>الأصناف المطلوبة ({items.length})</div>
              {items.length === 0 ? <div style={styles.emptyCart}>اختر أصنافًا من اليمين</div> : (
                <div style={styles.cartItems}>
                  {items.map((it) => (
                    <div key={it.productId} style={styles.cartItem}>
                      <span style={styles.ciName}>{it.name}</span>
                      <div style={styles.ciControls}>
                        <button style={styles.qtyBtn} onClick={() => changeQty(it.productId, -1)}>−</button>
                        <span style={styles.qtyNum}>{it.qty}</span>
                        <button style={styles.qtyBtn} onClick={() => changeQty(it.productId, 1)}>+</button>
                        <button style={styles.rmBtn} onClick={() => removeItem(it.productId)}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الطالب</label><input style={styles.input} value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} disabled={saving} placeholder="(فارغ = اسمك)" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>القسم</label><input style={styles.input} value={department} onChange={(e) => setDepartment(e.target.value)} disabled={saving} /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الأولوية</label>
            <select style={styles.input} value={priority} onChange={(e) => setPriority(e.target.value)} disabled={saving}>{PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_INFO[p].label}</option>)}</select>
          </div></div>
        </div>
        <div style={styles.field}><label style={styles.label}>الغرض من الطلب</label><input style={styles.input} value={purpose} onChange={(e) => setPurpose(e.target.value)} disabled={saving} placeholder="مثلاً: صيانة موقع نيوم" /></div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving || products.length === 0}>{saving ? "جارٍ الإرسال..." : "إرسال الطلب"}</button>
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

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 26, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  filters: { display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" },
  filterOn: { padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 20, cursor: "pointer" },
  filterOff: { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#64748b", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 20, cursor: "pointer" },

  list: { display: "flex", flexDirection: "column", gap: 12 },
  reqCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px" },
  rTop: { marginBottom: 10 },
  rTitleRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 },
  rNum: { fontSize: 14, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace" },
  prChip: { fontSize: 12, fontWeight: 700 },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px", whiteSpace: "nowrap" },
  rMeta: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, color: "#64748b" },
  rPurpose: { fontSize: 13, color: "#475569", marginBottom: 10 },
  itemsList: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  itemChip: { fontSize: 13, color: "#334155", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 12px" },
  rejReason: { fontSize: 13, color: "#b91c1c", background: "#fef2f2", borderRadius: 8, padding: "8px 12px", marginBottom: 12 },
  decidedBy: { fontSize: 12, color: "#94a3b8", marginBottom: 12 },
  rActions: { display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  approveBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#16a34a", border: "none", borderRadius: 7, cursor: "pointer" },
  rejectBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer" },
  fulfillBtn: { padding: "8px 18px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 7, cursor: "pointer" },
  delBtn: { padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  fulfilledNote: { fontSize: 13, color: "#16a34a", fontWeight: 600 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modalWide: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  row: { display: "flex", gap: 12 },

  reqGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  prodPick: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto", marginTop: 10 },
  prodPickBtn: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "right" },
  ppName: { fontSize: 13, fontWeight: 600, color: "#0f172a" },
  ppStock: { fontSize: 12, color: "#94a3b8" },
  cartHead: { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 },
  emptyCart: { textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "30px 0", background: "#f8fafc", borderRadius: 10 },
  cartItems: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto" },
  cartItem: { display: "flex", alignItems: "center", gap: 8 },
  ciName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" },
  ciControls: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
  qtyBtn: { width: 24, height: 24, fontSize: 15, fontWeight: 800, color: "#ea580c", background: "#fff7ed", border: "none", borderRadius: 6, cursor: "pointer", lineHeight: 1 },
  qtyNum: { fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center", fontFamily: "monospace" },
  rmBtn: { fontSize: 12, background: "none", border: "none", cursor: "pointer", marginRight: 2 },

  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
};
