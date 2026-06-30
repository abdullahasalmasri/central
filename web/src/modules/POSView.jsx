import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   نقاط البيع (POS) — قسم المالية
   اختيار أصناف (منتجات/خدمات) → سلّة → فاتورة 15% ضريبة → خصم المخزون.
   getPOSData / createSale.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const VAT_RATE = 15;
const PAY_METHODS = [
  { id: "cash", label: "نقدي", icon: "💵" },
  { id: "card", label: "شبكة", icon: "💳" },
  { id: "transfer", label: "تحويل", icon: "🏦" },
];

export default function POSView() {
  const [tenantId, setTenantId] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]); // [{productId, name, salePrice, qty, isService, stock}]
  const [discount, setDiscount] = useState("");
  const [payment, setPayment] = useState("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState(null);

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
      const res = await httpsCallable(functions, "getPOSData")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const products = data ? data.products : [];
  const s = data ? data.summary : { todayCount: 0, todaySales: 0, todayVat: 0, totalOrders: 0 };
  const q = search.trim().toLowerCase();
  const filtered = q ? products.filter((p) => (p.name || "").toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q)) : products;

  // حسابات السلّة
  const subtotal = cart.reduce((sum, it) => sum + it.salePrice * it.qty, 0);
  const disc = Math.min(Number(discount) || 0, subtotal);
  const taxable = subtotal - disc;
  const vat = taxable * (VAT_RATE / 100);
  const total = taxable + vat;
  const paid = amountPaid !== "" ? Number(amountPaid) : 0;
  const change = payment === "cash" && paid > total ? paid - total : 0;

  function addToCart(p) {
    setCart((prev) => {
      const existing = prev.find((it) => it.productId === p.id);
      if (existing) {
        // تحقّق المخزون للمنتجات
        if (!p.isService && existing.qty + 1 > p.quantity) { alert(`الكمية المتوفّرة من «${p.name}»: ${p.quantity}`); return prev; }
        return prev.map((it) => it.productId === p.id ? { ...it, qty: it.qty + 1 } : it);
      }
      if (!p.isService && p.quantity < 1) { alert(`«${p.name}» غير متوفّر في المخزون.`); return prev; }
      return [...prev, { productId: p.id, name: p.name, salePrice: p.salePrice, qty: 1, isService: p.isService, stock: p.quantity }];
    });
  }
  function changeQty(productId, delta) {
    setCart((prev) => prev.flatMap((it) => {
      if (it.productId !== productId) return [it];
      const newQty = it.qty + delta;
      if (newQty < 1) return [];
      if (!it.isService && newQty > it.stock) { alert(`الكمية المتوفّرة: ${it.stock}`); return [it]; }
      return [{ ...it, qty: newQty }];
    }));
  }
  function removeItem(productId) { setCart((prev) => prev.filter((it) => it.productId !== productId)); }
  function clearCart() { setCart([]); setDiscount(""); setAmountPaid(""); setCustomerName(""); setPayment("cash"); }

  async function checkout() {
    if (cart.length === 0) return;
    if (payment === "cash" && amountPaid !== "" && paid < total) { alert("المبلغ المدفوع أقل من الإجمالي."); return; }
    setSubmitting(true);
    try {
      const res = await httpsCallable(functions, "createSale")({
        items: cart.map((it) => ({ productId: it.productId, qty: it.qty })),
        discount: disc,
        paymentMethod: payment,
        amountPaid: payment === "cash" && amountPaid !== "" ? paid : total,
        customerName: customerName.trim(),
      });
      setReceipt({ ...res.data, items: cart, payment, customerName: customerName.trim() });
      clearCart();
      loadData();
    } catch (e) {
      alert(e.message || "تعذّر إتمام البيع.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div style={styles.page}><p style={styles.muted}>جارٍ التحميل...</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>نقاط البيع</h1>
          <p style={styles.pageSub}>بيع سريع مع خصم تلقائي من المخزون.</p>
        </div>
        <div style={styles.todayStats}>
          <div style={styles.todayItem}><span style={styles.todayNum}>{s.todayCount}</span><span style={styles.todayLabel}>عمليات اليوم</span></div>
          <div style={styles.todayDivider} />
          <div style={styles.todayItem}><span style={styles.todayNum} dir="ltr">{fmt(s.todaySales)}</span><span style={styles.todayLabel}>مبيعات اليوم</span></div>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.posGrid}>
        {/* الأصناف */}
        <div style={styles.productsPanel}>
          <input style={styles.search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 ابحث عن صنف..." />
          {filtered.length === 0 ? (
            <div style={styles.warnBox}>{products.length === 0 ? "لا توجد أصناف. أضفها من المخزون أولًا." : "لا توجد نتائج."}</div>
          ) : (
            <div style={styles.productGrid}>
              {filtered.map((p) => {
                const out = !p.isService && p.quantity < 1;
                return (
                  <button key={p.id} style={{ ...styles.productBtn, ...(out ? styles.productOut : {}) }} onClick={() => addToCart(p)} disabled={out}>
                    <span style={styles.productName}>{p.name}</span>
                    <span style={styles.productPrice} dir="ltr">{fmt(p.salePrice)}</span>
                    {p.isService ? <span style={styles.productStock}>خدمة</span> : <span style={{ ...styles.productStock, color: out ? "#dc2626" : p.quantity <= 5 ? "#ea580c" : "#94a3b8" }}>متوفّر: {p.quantity}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* السلّة */}
        <div style={styles.cartPanel}>
          <div style={styles.cartHead}>
            <h3 style={styles.cartTitle}>🛒 السلّة ({cart.length})</h3>
            {cart.length > 0 ? <button style={styles.clearBtn} onClick={clearCart}>تفريغ</button> : null}
          </div>

          {cart.length === 0 ? (
            <div style={styles.emptyCart}>اختر أصنافًا لإضافتها للسلّة</div>
          ) : (
            <>
              <div style={styles.cartItems}>
                {cart.map((it) => (
                  <div key={it.productId} style={styles.cartItem}>
                    <div style={styles.ciInfo}>
                      <span style={styles.ciName}>{it.name}</span>
                      <span style={styles.ciPrice} dir="ltr">{fmt(it.salePrice)} × {it.qty} = {fmt(it.salePrice * it.qty)}</span>
                    </div>
                    <div style={styles.ciControls}>
                      <button style={styles.qtyBtn} onClick={() => changeQty(it.productId, -1)}>−</button>
                      <span style={styles.qtyNum}>{it.qty}</span>
                      <button style={styles.qtyBtn} onClick={() => changeQty(it.productId, 1)}>+</button>
                      <button style={styles.removeBtn} onClick={() => removeItem(it.productId)}>🗑</button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={styles.cartCalc}>
                <div style={styles.calcRow}><span>المجموع الفرعي</span><span dir="ltr">{fmt(subtotal)}</span></div>
                <div style={styles.calcRowInput}>
                  <span>الخصم</span>
                  <input style={styles.discInput} type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" dir="ltr" />
                </div>
                <div style={styles.calcRow}><span>الضريبة ({VAT_RATE}%)</span><span dir="ltr">{fmt(vat)}</span></div>
                <div style={styles.calcTotal}><span>الإجمالي</span><span dir="ltr">{fmt(total)} ر.س</span></div>
              </div>

              <div style={styles.payMethods}>
                {PAY_METHODS.map((m) => (
                  <button key={m.id} style={payment === m.id ? styles.payOn : styles.payOff} onClick={() => setPayment(m.id)}>{m.icon} {m.label}</button>
                ))}
              </div>

              {payment === "cash" ? (
                <div style={styles.cashRow}>
                  <input style={styles.cashInput} type="number" min="0" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder="المبلغ المستلم" dir="ltr" />
                  {change > 0 ? <div style={styles.changeBox}>الفكّة: <b dir="ltr">{fmt(change)}</b></div> : null}
                </div>
              ) : null}

              <input style={styles.custInput} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="اسم العميل (اختياري)" />

              <button style={styles.checkoutBtn} onClick={checkout} disabled={submitting}>{submitting ? "جارٍ الإتمام..." : `إتمام البيع · ${fmt(total)} ر.س`}</button>
            </>
          )}
        </div>
      </div>

      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}
    </div>
  );
}

function ReceiptModal({ receipt, onClose }) {
  const payLabel = (PAY_METHODS.find((m) => m.id === receipt.payment) || {}).label || receipt.payment;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.receipt} onClick={(e) => e.stopPropagation()}>
        <div style={styles.recHeader}>
          <div style={styles.recCheck}>✓</div>
          <h2 style={styles.recTitle}>تمّ البيع بنجاح</h2>
          <span style={styles.recNum}>فاتورة #{String(receipt.orderNumber).padStart(4, "0")}</span>
        </div>

        <div style={styles.recItems}>
          {receipt.items.map((it) => (
            <div key={it.productId} style={styles.recItem}>
              <span style={styles.recItemName}>{it.name} × {it.qty}</span>
              <span dir="ltr">{fmt(it.salePrice * it.qty)}</span>
            </div>
          ))}
        </div>

        <div style={styles.recCalc}>
          <div style={styles.recRow}><span>المجموع الفرعي</span><span dir="ltr">{fmt(receipt.subtotal)}</span></div>
          <div style={styles.recRow}><span>الضريبة</span><span dir="ltr">{fmt(receipt.vatAmount)}</span></div>
          <div style={styles.recTotal}><span>الإجمالي</span><span dir="ltr">{fmt(receipt.total)} ر.س</span></div>
          {receipt.change > 0 ? <div style={styles.recChange}><span>الفكّة</span><span dir="ltr">{fmt(receipt.change)}</span></div> : null}
        </div>

        <div style={styles.recMeta}>طريقة الدفع: {payLabel}{receipt.customerName ? ` · ${receipt.customerName}` : ""}</div>

        <button style={styles.recBtn} onClick={onClose}>بيع جديد</button>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "22px 26px 32px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 23, fontWeight: 800, color: "#0891b2", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  todayStats: { display: "flex", alignItems: "center", gap: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 20px" },
  todayItem: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2 },
  todayNum: { fontSize: 18, fontWeight: 800, color: "#0891b2", fontFamily: "monospace" },
  todayLabel: { fontSize: 11, color: "#94a3b8" },
  todayDivider: { width: 1, height: 30, background: "#e2e8f0" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e" },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  posGrid: { display: "grid", gridTemplateColumns: "1fr 380px", gap: 18, alignItems: "start" },

  productsPanel: { minWidth: 0 },
  search: { width: "100%", padding: "11px 14px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 10, boxSizing: "border-box", fontFamily: "inherit", marginBottom: 14 },
  productGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 },
  productBtn: { display: "flex", flexDirection: "column", gap: 5, padding: "14px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "right", transition: "border-color .15s" },
  productOut: { opacity: 0.5, cursor: "not-allowed" },
  productName: { fontSize: 14, fontWeight: 700, color: "#0f172a", lineHeight: 1.3 },
  productPrice: { fontSize: 16, fontWeight: 800, color: "#0891b2", fontFamily: "monospace" },
  productStock: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },

  cartPanel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "18px 20px", position: "sticky", top: 16 },
  cartHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 14, borderBottom: "2px solid #f1f5f9" },
  cartTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: 0 },
  clearBtn: { fontSize: 12, fontWeight: 600, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" },
  emptyCart: { textAlign: "center", color: "#94a3b8", fontSize: 14, padding: "40px 0" },

  cartItems: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, maxHeight: 280, overflowY: "auto" },
  cartItem: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  ciInfo: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 },
  ciName: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  ciPrice: { fontSize: 12, color: "#64748b", fontFamily: "monospace" },
  ciControls: { display: "flex", alignItems: "center", gap: 5, flexShrink: 0 },
  qtyBtn: { width: 26, height: 26, fontSize: 16, fontWeight: 800, color: "#0891b2", background: "#ecfeff", border: "none", borderRadius: 6, cursor: "pointer", lineHeight: 1 },
  qtyNum: { fontSize: 14, fontWeight: 700, minWidth: 22, textAlign: "center", fontFamily: "monospace" },
  removeBtn: { fontSize: 13, background: "none", border: "none", cursor: "pointer", marginRight: 4 },

  cartCalc: { background: "#f8fafc", borderRadius: 10, padding: "14px 16px", marginBottom: 14, display: "flex", flexDirection: "column", gap: 9 },
  calcRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", fontFamily: "monospace" },
  calcRowInput: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 14, color: "#475569" },
  discInput: { width: 90, padding: "5px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6, textAlign: "left", fontFamily: "monospace" },
  calcTotal: { display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, color: "#0f172a", fontFamily: "monospace", paddingTop: 9, borderTop: "1px dashed #cbd5e1" },

  payMethods: { display: "flex", gap: 7, marginBottom: 12 },
  payOn: { flex: 1, padding: "9px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#0891b2", border: "2px solid #0891b2", borderRadius: 8, cursor: "pointer" },
  payOff: { flex: 1, padding: "9px", fontSize: 13, fontWeight: 600, color: "#64748b", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 8, cursor: "pointer" },

  cashRow: { marginBottom: 12 },
  cashInput: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "monospace", textAlign: "left" },
  changeBox: { marginTop: 8, padding: "8px 12px", background: "#dcfce7", borderRadius: 8, fontSize: 14, color: "#15803d", textAlign: "center" },

  custInput: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", marginBottom: 14 },
  checkoutBtn: { width: "100%", padding: "14px", fontSize: 15, fontWeight: 800, color: "#fff", background: "#0891b2", border: "none", borderRadius: 10, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  receipt: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 380, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  recHeader: { display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginBottom: 18 },
  recCheck: { width: 50, height: 50, borderRadius: "50%", background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800 },
  recTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  recNum: { fontSize: 13, color: "#94a3b8", fontFamily: "monospace" },
  recItems: { display: "flex", flexDirection: "column", gap: 7, marginBottom: 14, paddingBottom: 14, borderBottom: "1px dashed #e2e8f0" },
  recItem: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", fontFamily: "monospace" },
  recItemName: { fontFamily: "'IBM Plex Sans Arabic', sans-serif" },
  recCalc: { display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 },
  recRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#64748b", fontFamily: "monospace" },
  recTotal: { display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 800, color: "#0f172a", fontFamily: "monospace", paddingTop: 8, borderTop: "1px solid #e2e8f0" },
  recChange: { display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#15803d", fontFamily: "monospace" },
  recMeta: { fontSize: 12, color: "#94a3b8", textAlign: "center", marginBottom: 16 },
  recBtn: { width: "100%", padding: "12px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#0891b2", border: "none", borderRadius: 8, cursor: "pointer" },
};
