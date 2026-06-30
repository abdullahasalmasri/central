import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   المخزون — قسم العمليات
   أصناف (منتجات/خدمات) + حركة مخزون (وارد/صادر/تسوية).
   getInventory / createProduct / updateProduct / deleteProduct /
   addStockMovement. الأساس لنظام POS.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const UNIT_HINTS = ["قطعة", "كرتون", "كيلو", "لتر", "متر", "علبة", "ساعة", "يوم"];
const MOVE_INFO = {
  in: { label: "وارد", color: "#16a34a", sign: "+" },
  out: { label: "صادر", color: "#dc2626", sign: "−" },
  adjust: { label: "تسوية", color: "#2563eb", sign: "=" },
};

export default function InventoryView() {
  const [tenantId, setTenantId] = useState("");
  const [tab, setTab] = useState("products");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
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
      const res = await httpsCallable(functions, "getInventory")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { totalProducts: 0, serviceCount: 0, totalStockValue: 0, totalRetailValue: 0, lowStockCount: 0 };
  const products = data ? data.products : [];
  const movements = data ? data.movements : [];
  const lowStockItems = products.filter((p) => p.lowStock);
  const q = search.trim().toLowerCase();
  const filtered = q ? products.filter((p) => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q)) : products;

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>المخزون</h1>
          <p style={styles.pageSub}>إدارة الأصناف والكميات وحركة المخزون.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal({ newProduct: true })}>+ صنف جديد</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {/* KPIs */}
          <div style={styles.kpiGrid}>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>إجمالي الأصناف</span><span style={{ ...styles.kpiValue, color: "#ea580c" }}>{s.totalProducts}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>قيمة المخزون (تكلفة)</span><span style={{ ...styles.kpiValue, color: "#2563eb" }} dir="ltr">{fmt(s.totalStockValue)}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>قيمة البيع المتوقّعة</span><span style={{ ...styles.kpiValue, color: "#16a34a" }} dir="ltr">{fmt(s.totalRetailValue)}</span></div>
            <div style={styles.kpiCard}><span style={styles.kpiLabel}>أصناف تحت الحد</span><span style={{ ...styles.kpiValue, color: s.lowStockCount > 0 ? "#dc2626" : "#16a34a" }}>{s.lowStockCount}</span></div>
          </div>

          {/* تنبيه نقص المخزون */}
          {lowStockItems.length > 0 ? (
            <div style={styles.lowBanner}>
              <div style={styles.lowHead}>⚠️ أصناف وصلت حد التنبيه ({lowStockItems.length})</div>
              <div style={styles.lowList}>
                {lowStockItems.slice(0, 6).map((p) => (
                  <span key={p.id} style={styles.lowChip}>{p.name}: <b dir="ltr">{fmt(p.quantity)}</b> {p.unit}</span>
                ))}
              </div>
            </div>
          ) : null}

          {/* تبويب */}
          <div style={styles.tabs}>
            <button style={tab === "products" ? styles.tabActive : styles.tab} onClick={() => setTab("products")}>📦 الأصناف</button>
            <button style={tab === "movements" ? styles.tabActive : styles.tab} onClick={() => setTab("movements")}>🔄 حركة المخزون</button>
          </div>

          {tab === "products" ? (
            <>
              <input style={styles.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث بالاسم أو الرمز أو الفئة..." />
              {filtered.length === 0 ? (
                <div style={styles.warnBox}>{q ? "لا توجد نتائج." : "لا توجد أصناف. أضف صنفًا جديدًا."}</div>
              ) : (
                <div style={styles.prodList}>
                  {filtered.map((p) => (
                    <div key={p.id} style={styles.prodCard}>
                      <div style={styles.pTop}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={styles.pNameRow}>
                            <span style={styles.pName}>{p.name}</span>
                            {p.isService ? <span style={styles.serviceBadge}>خدمة</span> : null}
                            {p.lowStock ? <span style={styles.lowBadge}>تحت الحد</span> : null}
                          </div>
                          <div style={styles.pMeta}>
                            {p.sku ? <span style={styles.pChip} dir="ltr">#{p.sku}</span> : null}
                            {p.category ? <span style={styles.pChip}>{p.category}</span> : null}
                          </div>
                        </div>
                        {!p.isService ? (
                          <div style={styles.pQty}>
                            <span style={{ ...styles.pQtyNum, color: p.lowStock ? "#dc2626" : "#0f172a" }} dir="ltr">{fmt(p.quantity)}</span>
                            <span style={styles.pQtyUnit}>{p.unit}</span>
                          </div>
                        ) : <div style={styles.pQty}><span style={styles.pServiceMark}>∞</span></div>}
                      </div>
                      <div style={styles.pPrices}>
                        <span style={styles.pPrice}>البيع: <b dir="ltr">{fmt(p.salePrice)}</b> ر.س</span>
                        {p.cost > 0 ? <span style={styles.pCost}>التكلفة: <span dir="ltr">{fmt(p.cost)}</span></span> : null}
                      </div>
                      <div style={styles.pActions}>
                        {!p.isService ? <button style={styles.moveBtn} onClick={() => setModal({ movement: p })}>🔄 حركة</button> : null}
                        <button style={styles.editBtn} onClick={() => setModal({ editProduct: p })}>✏️ تعديل</button>
                        <DeleteBtn productId={p.id} name={p.name} onDone={loadData} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={styles.section}>
              {movements.length === 0 ? <p style={styles.muted}>لا توجد حركات بعد.</p> : (
                <div style={styles.moveList}>
                  {movements.map((m) => {
                    const info = MOVE_INFO[m.type] || MOVE_INFO.in;
                    return (
                      <div key={m.id} style={styles.moveItem}>
                        <span style={{ ...styles.moveType, color: info.color, background: `${info.color}15` }}>{info.label}</span>
                        <div style={styles.moveBody}>
                          <span style={styles.moveName}>{m.productName || "صنف"}</span>
                          {m.reason ? <span style={styles.moveReason}>{m.reason}</span> : null}
                        </div>
                        <div style={styles.moveRight}>
                          <span style={{ ...styles.moveQty, color: info.color }} dir="ltr">{info.sign}{fmt(m.quantity)}</span>
                          <span style={styles.moveBalance} dir="ltr">→ {fmt(m.balanceAfter)}</span>
                        </div>
                        {m.source === "pos" ? <span style={styles.posTag}>POS</span> : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {modal && modal.newProduct ? <ProductModal onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.editProduct ? <ProductModal product={modal.editProduct} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.movement ? <MovementModal product={modal.movement} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

function DeleteBtn({ productId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف صنف «${name}»؟`)) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "deleteProduct")({ productId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑"}</button>;
}

function ProductModal({ product, onClose, onSaved }) {
  const isEdit = !!product;
  const p = product || {};
  const [f, setF] = useState({
    name: p.name || "", sku: p.sku || "", category: p.category || "", unit: p.unit || "قطعة",
    isService: !!p.isService, salePrice: p.salePrice ? String(p.salePrice) : "",
    cost: p.cost ? String(p.cost) : "", quantity: p.quantity != null && !isEdit ? String(p.quantity) : (p.quantity != null ? String(p.quantity) : ""),
    minQuantity: p.minQuantity ? String(p.minQuantity) : "", notes: p.notes || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p2) => ({ ...p2, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم الصنف مطلوب."); return; }
    setSaving(true);
    try {
      const base = {
        name: f.name.trim(), sku: f.sku.trim(), category: f.category.trim(), unit: f.unit.trim(),
        salePrice: Number(f.salePrice) || 0, cost: Number(f.cost) || 0, minQuantity: Number(f.minQuantity) || 0,
        notes: f.notes.trim(),
      };
      if (isEdit) {
        await httpsCallable(functions, "updateProduct")({ productId: product.id, ...base });
      } else {
        await httpsCallable(functions, "createProduct")({ ...base, isService: f.isService, quantity: Number(f.quantity) || 0 });
      }
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>{isEdit ? "تعديل الصنف" : "صنف جديد"}</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}

        {!isEdit ? (
          <div style={styles.typeToggle}>
            <button style={!f.isService ? styles.typeOn : styles.typeOff} onClick={() => set("isService", false)} disabled={saving}>📦 منتج (له مخزون)</button>
            <button style={f.isService ? styles.typeOn : styles.typeOff} onClick={() => set("isService", true)} disabled={saving}>🛎 خدمة</button>
          </div>
        ) : null}

        <div style={styles.field}><label style={styles.label}>اسم الصنف *</label><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} /></div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الرمز/الباركود</label><input style={styles.input} value={f.sku} onChange={(e) => set("sku", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الفئة</label><input style={styles.input} value={f.category} onChange={(e) => set("category", e.target.value)} disabled={saving} /></div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>سعر البيع *</label><input style={styles.input} type="number" min="0" value={f.salePrice} onChange={(e) => set("salePrice", e.target.value)} disabled={saving} dir="ltr" /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>التكلفة</label><input style={styles.input} type="number" min="0" value={f.cost} onChange={(e) => set("cost", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        {!f.isService ? (
          <>
            <div style={styles.row}>
              <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الوحدة</label>
                <input style={styles.input} value={f.unit} onChange={(e) => set("unit", e.target.value)} disabled={saving} list="unitHints" />
                <datalist id="unitHints">{UNIT_HINTS.map((u) => <option key={u} value={u} />)}</datalist>
              </div></div>
              {!isEdit ? <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الكمية الأولية</label><input style={styles.input} type="number" min="0" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} disabled={saving} dir="ltr" /></div></div> : null}
              <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>حد التنبيه</label><input style={styles.input} type="number" min="0" value={f.minQuantity} onChange={(e) => set("minQuantity", e.target.value)} disabled={saving} dir="ltr" /></div></div>
            </div>
            {isEdit ? <div style={styles.hint}>💡 لتعديل الكمية، استخدم زر «حركة» على الصنف.</div> : null}
          </>
        ) : null}
        <div style={styles.field}><label style={styles.label}>ملاحظات</label><textarea style={styles.textarea} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} rows={2} /></div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : isEdit ? "حفظ" : "إضافة"}</button>
        </div>
      </div>
    </div>
  );
}

function MovementModal({ product, onClose, onSaved }) {
  const [f, setF] = useState({ type: "in", quantity: "", reason: "", note: "" });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    const qty = Number(f.quantity);
    if (!Number.isFinite(qty) || qty <= 0) { setErr("الكمية يجب أن تكون أكبر من صفر."); return; }
    setSaving(true);
    try {
      await httpsCallable(functions, "addStockMovement")({ productId: product.id, type: f.type, quantity: qty, reason: f.reason.trim(), note: f.note.trim() });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>حركة مخزون</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <div style={styles.prodBanner}>
          <span style={styles.prodBannerName}>{product.name}</span>
          <span style={styles.prodBannerQty}>الرصيد الحالي: <b dir="ltr">{fmt(product.quantity)}</b> {product.unit}</span>
        </div>

        <div style={styles.field}><label style={styles.label}>نوع الحركة</label>
          <div style={styles.moveTypeToggle}>
            <button style={f.type === "in" ? { ...styles.mtBtn, ...styles.mtIn } : styles.mtBtn} onClick={() => set("type", "in")} disabled={saving}>+ وارد</button>
            <button style={f.type === "out" ? { ...styles.mtBtn, ...styles.mtOut } : styles.mtBtn} onClick={() => set("type", "out")} disabled={saving}>− صادر</button>
            <button style={f.type === "adjust" ? { ...styles.mtBtn, ...styles.mtAdj } : styles.mtBtn} onClick={() => set("type", "adjust")} disabled={saving}>= تسوية</button>
          </div>
        </div>
        <div style={styles.field}><label style={styles.label}>{f.type === "adjust" ? "الرصيد الفعلي الجديد *" : "الكمية *"}</label><input style={styles.input} type="number" min="0" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} disabled={saving} dir="ltr" autoFocus /></div>
        <div style={styles.field}><label style={styles.label}>السبب</label><input style={styles.input} value={f.reason} onChange={(e) => set("reason", e.target.value)} disabled={saving} placeholder={f.type === "in" ? "شراء / إرجاع" : f.type === "out" ? "صرف / تالف" : "جرد"} /></div>
        <div style={styles.field}><label style={styles.label}>ملاحظة</label><input style={styles.input} value={f.note} onChange={(e) => set("note", e.target.value)} disabled={saving} /></div>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "تسجيل الحركة"}</button>
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

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  lowBanner: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "14px 18px", marginBottom: 18 },
  lowHead: { fontSize: 14, fontWeight: 800, color: "#b91c1c", marginBottom: 10 },
  lowList: { display: "flex", gap: 8, flexWrap: "wrap" },
  lowChip: { fontSize: 13, color: "#7f1d1d", background: "#fff", border: "1px solid #fecaca", borderRadius: 8, padding: "4px 12px" },

  tabs: { display: "flex", gap: 8, marginBottom: 18, borderBottom: "2px solid #e2e8f0" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#64748b", background: "none", border: "none", borderBottom: "2px solid transparent", marginBottom: -2, cursor: "pointer" },
  tabActive: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#ea580c", background: "none", border: "none", borderBottom: "2px solid #ea580c", marginBottom: -2, cursor: "pointer" },

  search: { width: "100%", padding: "11px 14px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 10, boxSizing: "border-box", fontFamily: "inherit", marginBottom: 16 },

  prodList: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 },
  prodCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" },
  pTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 },
  pNameRow: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 },
  pName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  serviceBadge: { fontSize: 11, fontWeight: 700, color: "#7c3aed", background: "#ede9fe", borderRadius: 5, padding: "2px 8px" },
  lowBadge: { fontSize: 11, fontWeight: 700, color: "#dc2626", background: "#fee2e2", borderRadius: 5, padding: "2px 8px" },
  pMeta: { display: "flex", gap: 6, flexWrap: "wrap" },
  pChip: { fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: "2px 8px" },
  pQty: { display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 },
  pQtyNum: { fontSize: 22, fontWeight: 800, fontFamily: "monospace", lineHeight: 1 },
  pQtyUnit: { fontSize: 11, color: "#94a3b8", marginTop: 3 },
  pServiceMark: { fontSize: 24, color: "#c4b5fd", fontWeight: 800 },
  pPrices: { display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 12, paddingTop: 10, borderTop: "1px solid #f1f5f9" },
  pPrice: { fontSize: 13, color: "#16a34a", fontWeight: 600 },
  pCost: { fontSize: 12, color: "#94a3b8" },
  pActions: { display: "flex", gap: 7, flexWrap: "wrap" },
  moveBtn: { padding: "7px 12px", fontSize: 12, fontWeight: 700, color: "#ea580c", background: "#fff7ed", border: "none", borderRadius: 7, cursor: "pointer" },
  editBtn: { padding: "7px 12px", fontSize: 12, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  delBtn: { padding: "7px 11px", fontSize: 12, background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer" },

  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px" },
  moveList: { display: "flex", flexDirection: "column", gap: 8 },
  moveItem: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: "1px solid #f1f5f9" },
  moveType: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "4px 12px", whiteSpace: "nowrap", flexShrink: 0 },
  moveBody: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  moveName: { fontSize: 14, fontWeight: 600, color: "#0f172a" },
  moveReason: { fontSize: 12, color: "#94a3b8" },
  moveRight: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, flexShrink: 0 },
  moveQty: { fontSize: 15, fontWeight: 800, fontFamily: "monospace" },
  moveBalance: { fontSize: 11, color: "#94a3b8", fontFamily: "monospace" },
  posTag: { fontSize: 10, fontWeight: 700, color: "#ea580c", background: "#fff7ed", borderRadius: 4, padding: "2px 6px", flexShrink: 0 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },
  hint: { fontSize: 12, color: "#94a3b8", marginBottom: 12, marginTop: -4 },

  typeToggle: { display: "flex", gap: 8, marginBottom: 16 },
  typeOn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
  typeOff: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },

  prodBanner: { background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", flexDirection: "column", gap: 4 },
  prodBannerName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  prodBannerQty: { fontSize: 13, color: "#64748b" },
  moveTypeToggle: { display: "flex", gap: 8 },
  mtBtn: { flex: 1, padding: "10px", fontSize: 14, fontWeight: 700, color: "#64748b", background: "#f1f5f9", border: "2px solid transparent", borderRadius: 8, cursor: "pointer" },
  mtIn: { color: "#16a34a", background: "#dcfce7", borderColor: "#16a34a" },
  mtOut: { color: "#dc2626", background: "#fee2e2", borderColor: "#dc2626" },
  mtAdj: { color: "#2563eb", background: "#dbeafe", borderColor: "#2563eb" },

  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },
};
