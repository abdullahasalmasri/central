import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الكاشير — قسم المالية
   جلسات وردية (فتح/إغلاق + تسوية الدرج) + مرتجعات (ترجع المخزون) + تقارير.
   getCashierData / openSession / closeSession / createReturn.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PAY_LABEL = { cash: "نقدي", card: "شبكة", transfer: "تحويل" };
function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-GB")} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function CashierView() {
  const [tenantId, setTenantId] = useState("");
  const [tab, setTab] = useState("sales");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);

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
      const res = await httpsCallable(functions, "getCashierData")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div style={styles.page}><p style={styles.muted}>جارٍ التحميل...</p></div>;

  const session = data ? data.activeSession : null;
  const summary = data ? data.activeSummary : null;
  const orders = data ? data.recentOrders : [];
  const returns = data ? data.returns : [];
  const pastSessions = data ? data.pastSessions : [];
  const products = data ? data.products : [];

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>الكاشير</h1>
          <p style={styles.pageSub}>إدارة الورديات والمرتجعات وتسوية الصندوق.</p>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {!session ? (
        /* لا جلسة مفتوحة */
        <div style={styles.openCard}>
          <div style={styles.openIcon}>🔓</div>
          <h2 style={styles.openTitle}>لا توجد وردية مفتوحة</h2>
          <p style={styles.openSub}>افتح وردية جديدة لبدء استقبال المبيعات وتتبّع الصندوق.</p>
          <button style={styles.openBtn} onClick={() => setModal("open")}>فتح وردية جديدة</button>
        </div>
      ) : (
        /* جلسة مفتوحة */
        <div style={styles.sessionCard}>
          <div style={styles.sessionTop}>
            <div>
              <div style={styles.sessionBadge}>● وردية مفتوحة #{String(session.sessionNumber).padStart(4, "0")}</div>
              <div style={styles.sessionInfo}>
                {session.cashierName ? <span>الكاشير: {session.cashierName}</span> : null}
                <span>الفتح: {fmtTime(session.openedAt)}</span>
                <span>رصيد البداية: <b dir="ltr">{fmt(session.openingBalance)}</b></span>
              </div>
            </div>
            <button style={styles.closeSessionBtn} onClick={() => setModal({ close: session, summary })}>إغلاق الوردية</button>
          </div>

          {summary ? (
            <div style={styles.sessionStats}>
              <div style={styles.statBox}><span style={styles.statLabel}>المبيعات</span><span style={styles.statVal} dir="ltr">{fmt(summary.salesTotal)}</span><span style={styles.statSub}>{summary.salesCount} فاتورة</span></div>
              <div style={styles.statBox}><span style={styles.statLabel}>نقدي 💵</span><span style={{ ...styles.statVal, color: "#16a34a" }} dir="ltr">{fmt(summary.cashTotal)}</span></div>
              <div style={styles.statBox}><span style={styles.statLabel}>شبكة 💳</span><span style={{ ...styles.statVal, color: "#2563eb" }} dir="ltr">{fmt(summary.cardTotal)}</span></div>
              <div style={styles.statBox}><span style={styles.statLabel}>مرتجعات</span><span style={{ ...styles.statVal, color: "#dc2626" }} dir="ltr">{fmt(summary.returnsTotal)}</span><span style={styles.statSub}>{summary.returnsCount} مرتجع</span></div>
              <div style={{ ...styles.statBox, ...styles.statExpected }}><span style={styles.statLabel}>المتوقّع بالدرج</span><span style={{ ...styles.statVal, color: "#0891b2" }} dir="ltr">{fmt(summary.expectedCash)}</span></div>
            </div>
          ) : null}
        </div>
      )}

      {/* تبويب */}
      <div style={styles.tabs}>
        <button style={tab === "sales" ? styles.tabActive : styles.tab} onClick={() => setTab("sales")}>🧾 الفواتير</button>
        <button style={tab === "returns" ? styles.tabActive : styles.tab} onClick={() => setTab("returns")}>↩️ المرتجعات</button>
        <button style={tab === "sessions" ? styles.tabActive : styles.tab} onClick={() => setTab("sessions")}>📋 الورديات السابقة</button>
      </div>

      {tab === "sales" ? (
        <div style={styles.section}>
          {orders.length === 0 ? <p style={styles.muted}>لا توجد فواتير بعد.</p> : (
            <div style={styles.list}>
              {orders.map((o) => (
                <div key={o.id} style={styles.orderRow}>
                  <span style={styles.orderNum}>#{String(o.orderNumber).padStart(4, "0")}</span>
                  <div style={styles.orderBody}>
                    <span style={styles.orderItems}>{(o.items || []).length} صنف{o.customerName ? ` · ${o.customerName}` : ""}</span>
                    <span style={styles.orderTime}>{fmtTime(o.createdAt)}</span>
                  </div>
                  <span style={styles.orderPay}>{PAY_LABEL[o.paymentMethod] || o.paymentMethod}</span>
                  <span style={styles.orderTotal} dir="ltr">{fmt(o.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "returns" ? (
        <div style={styles.section}>
          <div style={styles.secHead}>
            <h3 style={styles.sectionTitle}>المرتجعات</h3>
            <button style={styles.addBtn} onClick={() => setModal({ return: true, products })}>+ مرتجع جديد</button>
          </div>
          {returns.length === 0 ? <p style={styles.muted}>لا توجد مرتجعات.</p> : (
            <div style={styles.list}>
              {returns.map((r) => (
                <div key={r.id} style={styles.returnRow}>
                  <span style={styles.returnNum}>#{String(r.returnNumber).padStart(4, "0")}</span>
                  <div style={styles.orderBody}>
                    <span style={styles.orderItems}>{(r.items || []).length} صنف{r.reason ? ` · ${r.reason}` : ""}</span>
                    <span style={styles.orderTime}>{fmtTime(r.createdAt)}</span>
                  </div>
                  <span style={styles.returnTotal} dir="ltr">− {fmt(r.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "sessions" ? (
        <div style={styles.section}>
          {pastSessions.length === 0 ? <p style={styles.muted}>لا توجد ورديات مغلقة.</p> : (
            <div style={styles.list}>
              {pastSessions.map((ps) => (
                <div key={ps.id} style={styles.pastSession}>
                  <div style={styles.psTop}>
                    <span style={styles.psNum}>وردية #{String(ps.sessionNumber).padStart(4, "0")}</span>
                    <span style={styles.psTime}>{fmtTime(ps.closedAt)}</span>
                  </div>
                  <div style={styles.psStats}>
                    <span>المبيعات: <b dir="ltr">{fmt(ps.salesTotal)}</b> ({ps.salesCount})</span>
                    <span>المتوقّع: <b dir="ltr">{fmt(ps.expectedCash)}</b></span>
                    <span>المعدود: <b dir="ltr">{fmt(ps.countedCash)}</b></span>
                    <span style={{ color: Math.abs(ps.difference) < 0.01 ? "#16a34a" : ps.difference > 0 ? "#2563eb" : "#dc2626" }}>
                      الفرق: <b dir="ltr">{ps.difference > 0 ? "+" : ""}{fmt(ps.difference)}</b>
                      {Math.abs(ps.difference) < 0.01 ? " ✓" : ps.difference > 0 ? " (زيادة)" : " (عجز)"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {modal === "open" ? <OpenModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.close ? <CloseModal session={modal.close} summary={modal.summary} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.return ? <ReturnModal products={modal.products} hasSession={!!session} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function OpenModal({ onClose, onSaved }) {
  const [balance, setBalance] = useState("");
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  async function save() {
    setErr("");
    setSaving(true);
    try {
      await httpsCallable(functions, "openSession")({ openingBalance: Number(balance) || 0 });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الفتح."); setSaving(false); }
  }
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>فتح وردية</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <div style={styles.field}><label style={styles.label}>رصيد بداية الدرج (نقدًا)</label><input style={styles.input} type="number" min="0" value={balance} onChange={(e) => setBalance(e.target.value)} disabled={saving} dir="ltr" placeholder="0" autoFocus /></div>
        <div style={styles.hint}>💡 المبلغ النقدي الموجود في الدرج عند بداية الوردية.</div>
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الفتح..." : "فتح الوردية"}</button>
        </div>
      </div>
    </div>
  );
}

function CloseModal({ session, summary, onClose, onSaved }) {
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const expected = summary ? summary.expectedCash : (Number(session.openingBalance) || 0);
  const diff = counted !== "" ? (Number(counted) || 0) - expected : null;

  async function save() {
    setErr("");
    if (counted === "") { setErr("أدخل المبلغ المعدود."); return; }
    setSaving(true);
    try {
      await httpsCallable(functions, "closeSession")({ sessionId: session.id, countedCash: Number(counted) || 0, closingNotes: notes.trim() });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الإغلاق."); setSaving(false); }
  }
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>إغلاق الوردية #{String(session.sessionNumber).padStart(4, "0")}</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.closeStats}>
          <div style={styles.csRow}><span>رصيد البداية</span><span dir="ltr">{fmt(session.openingBalance)}</span></div>
          {summary ? <div style={styles.csRow}><span>مبيعات نقدية</span><span dir="ltr">+ {fmt(summary.cashTotal)}</span></div> : null}
          {summary && summary.returnsTotal > 0 ? <div style={styles.csRow}><span>مرتجعات</span><span dir="ltr">− {fmt(summary.returnsTotal)}</span></div> : null}
          <div style={styles.csExpected}><span>المتوقّع بالدرج</span><span dir="ltr">{fmt(expected)} ر.س</span></div>
        </div>

        <div style={styles.field}><label style={styles.label}>المبلغ المعدود فعليًا *</label><input style={styles.input} type="number" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} disabled={saving} dir="ltr" autoFocus /></div>

        {diff !== null ? (
          <div style={{ ...styles.diffBox, background: Math.abs(diff) < 0.01 ? "#dcfce7" : diff > 0 ? "#dbeafe" : "#fee2e2", color: Math.abs(diff) < 0.01 ? "#15803d" : diff > 0 ? "#1e40af" : "#b91c1c" }}>
            {Math.abs(diff) < 0.01 ? "✓ مطابق تمامًا" : <>الفرق: <b dir="ltr">{diff > 0 ? "+" : ""}{fmt(diff)}</b> {diff > 0 ? "(زيادة)" : "(عجز)"}</>}
          </div>
        ) : null}

        <div style={styles.field}><label style={styles.label}>ملاحظات الإغلاق</label><textarea style={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={saving} rows={2} /></div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الإغلاق..." : "إغلاق وتسوية"}</button>
        </div>
      </div>
    </div>
  );
}

function ReturnModal({ products, hasSession, onClose, onSaved }) {
  const [items, setItems] = useState([]); // [{productId, name, salePrice, qty, isService}]
  const [reason, setReason] = useState("");
  const [orderNum, setOrderNum] = useState("");
  const [search, setSearch] = useState("");
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);

  const q = search.trim().toLowerCase();
  const filtered = q ? products.filter((p) => (p.name || "").toLowerCase().includes(q)) : products;
  const total = items.reduce((s, it) => s + it.salePrice * it.qty, 0);

  function addItem(p) {
    setItems((prev) => {
      const ex = prev.find((it) => it.productId === p.id);
      if (ex) return prev.map((it) => it.productId === p.id ? { ...it, qty: it.qty + 1 } : it);
      return [...prev, { productId: p.id, name: p.name, salePrice: p.salePrice, qty: 1, isService: p.isService }];
    });
  }
  function changeQty(pid, delta) {
    setItems((prev) => prev.flatMap((it) => {
      if (it.productId !== pid) return [it];
      const nq = it.qty + delta;
      return nq < 1 ? [] : [{ ...it, qty: nq }];
    }));
  }

  async function save() {
    setErr("");
    if (items.length === 0) { setErr("اختر صنفًا واحدًا على الأقل."); return; }
    setSaving(true);
    try {
      await httpsCallable(functions, "createReturn")({
        items: items.map((it) => ({ productId: it.productId, qty: it.qty })),
        reason: reason.trim(),
        originalOrderNumber: orderNum.trim() ? Number(orderNum.trim()) : null,
      });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر التسجيل."); setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>مرتجع جديد</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}
        {!hasSession ? <div style={styles.warnInline}>⚠️ لا توجد وردية مفتوحة — سيُسجّل المرتجع بدون ربطه بوردية.</div> : null}

        <div style={styles.returnGrid}>
          {/* اختيار الأصناف */}
          <div>
            <input style={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث عن صنف للإرجاع..." />
            <div style={styles.returnProducts}>
              {filtered.slice(0, 30).map((p) => (
                <button key={p.id} style={styles.returnProdBtn} onClick={() => addItem(p)}>
                  <span style={styles.rpName}>{p.name}</span>
                  <span style={styles.rpPrice} dir="ltr">{fmt(p.salePrice)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* الأصناف المختارة */}
          <div>
            <div style={styles.returnCartHead}>الأصناف المرتجعة ({items.length})</div>
            {items.length === 0 ? <div style={styles.emptyReturn}>اختر أصنافًا من اليمين</div> : (
              <div style={styles.returnItems}>
                {items.map((it) => (
                  <div key={it.productId} style={styles.returnItem}>
                    <span style={styles.riName}>{it.name}</span>
                    <div style={styles.riControls}>
                      <button style={styles.qtyBtn} onClick={() => changeQty(it.productId, -1)}>−</button>
                      <span style={styles.qtyNum}>{it.qty}</span>
                      <button style={styles.qtyBtn} onClick={() => changeQty(it.productId, 1)}>+</button>
                    </div>
                    <span style={styles.riTotal} dir="ltr">{fmt(it.salePrice * it.qty)}</span>
                  </div>
                ))}
                <div style={styles.returnTotalRow}><span>إجمالي الإرجاع</span><span dir="ltr">{fmt(total)} ر.س</span></div>
              </div>
            )}
          </div>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>رقم الفاتورة الأصلية (اختياري)</label><input style={styles.input} value={orderNum} onChange={(e) => setOrderNum(e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 2 }}><div style={styles.field}><label style={styles.label}>سبب الإرجاع</label><input style={styles.input} value={reason} onChange={(e) => setReason(e.target.value)} disabled={saving} placeholder="تالف / لم يناسب العميل" /></div></div>
        </div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ التسجيل..." : `تسجيل المرتجع · ${fmt(total)}`}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { marginBottom: 18 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#0891b2", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  openCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "44px 24px", textAlign: "center", marginBottom: 22 },
  openIcon: { fontSize: 44, marginBottom: 12 },
  openTitle: { fontSize: 19, fontWeight: 800, color: "#0f172a", margin: "0 0 8px" },
  openSub: { fontSize: 14, color: "#64748b", margin: "0 0 20px" },
  openBtn: { padding: "13px 32px", fontSize: 15, fontWeight: 700, color: "#fff", background: "#0891b2", border: "none", borderRadius: 10, cursor: "pointer" },

  sessionCard: { background: "#fff", border: "2px solid #a5f3fc", borderRadius: 16, padding: "20px 24px", marginBottom: 22 },
  sessionTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 18, flexWrap: "wrap" },
  sessionBadge: { fontSize: 15, fontWeight: 800, color: "#0891b2", marginBottom: 8 },
  sessionInfo: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#64748b" },
  closeSessionBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },
  sessionStats: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 },
  statBox: { background: "#f8fafc", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 3 },
  statExpected: { background: "#ecfeff", border: "1px solid #a5f3fc" },
  statLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },
  statVal: { fontSize: 18, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  statSub: { fontSize: 11, color: "#94a3b8" },

  tabs: { display: "flex", gap: 8, marginBottom: 18, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#64748b", background: "none", border: "none", borderBottom: "2px solid transparent", marginBottom: -2, cursor: "pointer" },
  tabActive: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#0891b2", background: "none", border: "none", borderBottom: "2px solid #0891b2", marginBottom: -2, cursor: "pointer" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px" },
  secHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0 },
  addBtn: { padding: "9px 18px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#0891b2", border: "none", borderRadius: 8, cursor: "pointer" },
  list: { display: "flex", flexDirection: "column", gap: 8 },

  orderRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: "1px solid #f1f5f9" },
  orderNum: { fontSize: 13, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace", flexShrink: 0 },
  orderBody: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  orderItems: { fontSize: 14, fontWeight: 600, color: "#0f172a" },
  orderTime: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  orderPay: { fontSize: 12, color: "#475569", background: "#f1f5f9", borderRadius: 6, padding: "3px 10px", flexShrink: 0 },
  orderTotal: { fontSize: 15, fontWeight: 800, color: "#0891b2", fontFamily: "monospace", flexShrink: 0 },

  returnRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: "1px solid #f1f5f9" },
  returnNum: { fontSize: 13, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace", flexShrink: 0 },
  returnTotal: { fontSize: 15, fontWeight: 800, color: "#dc2626", fontFamily: "monospace", flexShrink: 0 },

  pastSession: { border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px" },
  psTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  psNum: { fontSize: 14, fontWeight: 800, color: "#0f172a" },
  psTime: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  psStats: { display: "flex", gap: 18, flexWrap: "wrap", fontSize: 13, color: "#475569" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalWide: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 720, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },
  hint: { fontSize: 12, color: "#94a3b8", marginBottom: 12, marginTop: -4 },
  warnInline: { padding: "10px 12px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e", marginBottom: 14 },

  closeStats: { background: "#f8fafc", borderRadius: 10, padding: "14px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 },
  csRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", fontFamily: "monospace" },
  csExpected: { display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: "#0891b2", fontFamily: "monospace", paddingTop: 8, borderTop: "1px dashed #cbd5e1" },
  diffBox: { padding: "12px 16px", borderRadius: 10, fontSize: 15, textAlign: "center", marginBottom: 14, fontWeight: 600 },

  returnGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  returnProducts: { display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto", marginTop: 10 },
  returnProdBtn: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "right" },
  rpName: { fontSize: 13, fontWeight: 600, color: "#0f172a" },
  rpPrice: { fontSize: 13, fontWeight: 700, color: "#0891b2", fontFamily: "monospace" },
  returnCartHead: { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 },
  emptyReturn: { textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "30px 0", background: "#f8fafc", borderRadius: 10 },
  returnItems: { display: "flex", flexDirection: "column", gap: 8, maxHeight: 240, overflowY: "auto" },
  returnItem: { display: "flex", alignItems: "center", gap: 8 },
  riName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" },
  riControls: { display: "flex", alignItems: "center", gap: 4, flexShrink: 0 },
  riTotal: { fontSize: 13, fontWeight: 700, color: "#dc2626", fontFamily: "monospace", minWidth: 60, textAlign: "left", flexShrink: 0 },
  returnTotalRow: { display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#0f172a", fontFamily: "monospace", paddingTop: 10, borderTop: "1px dashed #cbd5e1", marginTop: 4 },
  qtyBtn: { width: 24, height: 24, fontSize: 15, fontWeight: 800, color: "#0891b2", background: "#ecfeff", border: "none", borderRadius: 6, cursor: "pointer", lineHeight: 1 },
  qtyNum: { fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center", fontFamily: "monospace" },

  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#0891b2", border: "none", borderRadius: 8, cursor: "pointer" },
};
