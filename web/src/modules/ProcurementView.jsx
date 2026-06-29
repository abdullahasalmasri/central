import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   المشتريات واعتماد التكاليف — قسم المالية
   تبويبات: الموردين · الأصناف · اعتماد التكاليف (المالية)
   الدورة: المشتريات تنشئ صنفًا وترسل تكلفته → المالية تعتمد/ترفض مع تحديد الضرائب.
   ============================================================ */

const COST_STATUS_CFG = {
  draft: { label: "مسودة", bg: "#f1f5f9", color: "#64748b" },
  pending_finance: { label: "بانتظار المالية", bg: "#fef3c7", color: "#92400e" },
  approved: { label: "معتمد", bg: "#dcfce7", color: "#166534" },
  rejected: { label: "مرفوض", bg: "#fee2e2", color: "#b91c1c" },
};
const DEAL_LABELS = { sale: "بيع", rental: "تأجير", consumable: "استهلاك" };
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ProcurementView() {
  const [tenantId, setTenantId] = useState("");
  const [vendors, setVendors] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("items");
  const [modal, setModal] = useState(null); // "vendor" | "item" | {approve: item}

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
      const [vSnap, iSnap] = await Promise.all([
        getDocs(query(collection(db, "vendors"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "items"), where("tenantId", "==", tenantId))),
      ]);
      setVendors(vSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setItems(iSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  const vendorName = (id) => { const v = vendors.find((x) => x.id === id); return v ? v.name : "—"; };
  const pendingCount = items.filter((i) => i.costStatus === "pending_finance").length;

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>المشتريات واعتماد التكاليف</h1>
          <p style={styles.pageSub}>إدارة الموردين والأصناف، واعتماد تكاليفها من المالية مع تحديد الضرائب.</p>
        </div>
        <div style={styles.topBtns}>
          {tab === "vendors" ? <button style={styles.addBtn} onClick={() => setModal("vendor")}>+ مورّد</button> : null}
          {tab === "items" ? <button style={styles.addBtn} onClick={() => setModal("item")}>+ صنف</button> : null}
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "items" ? styles.tabActive : {}) }} onClick={() => setTab("items")}>
          📦 الأصناف
        </button>
        <button style={{ ...styles.tab, ...(tab === "vendors" ? styles.tabActive : {}) }} onClick={() => setTab("vendors")}>
          🏢 الموردون
        </button>
        <button style={{ ...styles.tab, ...(tab === "approvals" ? styles.tabActive : {}) }} onClick={() => setTab("approvals")}>
          ✅ اعتماد التكاليف
          {pendingCount > 0 ? <span style={styles.badge}>{pendingCount}</span> : null}
        </button>
      </div>

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : (
        <>
          {tab === "items" && <ItemsTab items={items} vendorName={vendorName} onReload={loadData} setError={setError} />}
          {tab === "vendors" && <VendorsTab vendors={vendors} />}
          {tab === "approvals" && <ApprovalsTab items={items} vendorName={vendorName} onApprove={(it) => setModal({ approve: it })} onReload={loadData} setError={setError} />}
        </>
      )}

      {modal === "vendor" ? <VendorForm onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal === "item" ? <ItemForm vendors={vendors} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.approve ? <ApproveForm item={modal.approve} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
    </div>
  );
}

// ═══════════ تبويب الأصناف ═══════════
function ItemsTab({ items, vendorName, onReload, setError }) {
  const [busyId, setBusyId] = useState("");

  async function sendToFinance(item) {
    if (item.estimatedCost == null) { setError("أدخل التكلفة التقديرية أولًا (عدّل الصنف)."); return; }
    setBusyId(item.id);
    setError("");
    try {
      const fn = httpsCallable(functions, "submitItemCost");
      await fn({ itemId: item.id, estimatedCost: Number(item.estimatedCost) });
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر إرسال التكلفة.");
    } finally {
      setBusyId("");
    }
  }

  if (items.length === 0) {
    return <div style={styles.empty}><p style={styles.muted}>لا توجد أصناف بعد. اضغط «+ صنف» لإضافة أول صنف.</p></div>;
  }
  return (
    <div style={styles.panel}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>الصنف</th>
            <th style={styles.th}>الفئة</th>
            <th style={styles.th}>التعامل</th>
            <th style={styles.thAmount}>تقديرية</th>
            <th style={styles.thAmount}>معتمدة</th>
            <th style={styles.thCenter}>الحالة</th>
            <th style={styles.thCenter}>إجراء</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const cfg = COST_STATUS_CFG[it.costStatus] || COST_STATUS_CFG.draft;
            const canSend = it.costStatus === "draft" || it.costStatus === "rejected";
            return (
              <tr key={it.id}>
                <td style={styles.tdName}>
                  {it.itemCode ? <span style={styles.codeTag}>{it.itemCode}</span> : null}
                  {it.name}
                </td>
                <td style={styles.tdName}>{it.category || "—"}</td>
                <td style={styles.tdName}>
                  {(it.dealTypes || []).map((d) => DEAL_LABELS[d] || d).join("، ") || "—"}
                </td>
                <td style={styles.tdAmount} dir="ltr">{it.estimatedCost != null ? fmt(it.estimatedCost) : "—"}</td>
                <td style={{ ...styles.tdAmount, fontWeight: 700, color: it.approvedCost != null ? "#059669" : "#cbd5e1" }} dir="ltr">{it.approvedCost != null ? fmt(it.approvedCost) : "—"}</td>
                <td style={styles.tdCenter}>
                  <span style={{ ...styles.badge2, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                </td>
                <td style={styles.tdCenter}>
                  {canSend ? (
                    <button style={styles.sendBtn} onClick={() => sendToFinance(it)} disabled={busyId === it.id}>
                      {busyId === it.id ? "..." : "إرسال للمالية"}
                    </button>
                  ) : it.costStatus === "pending_finance" ? (
                    <span style={styles.mutedSmall}>بانتظار الاعتماد</span>
                  ) : <span style={styles.mutedSmall}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════ تبويب الموردين ═══════════
function VendorsTab({ vendors }) {
  if (vendors.length === 0) {
    return <div style={styles.empty}><p style={styles.muted}>لا يوجد موردون بعد. اضغط «+ مورّد» لإضافة أول مورّد.</p></div>;
  }
  return (
    <div style={styles.panel}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>المورّد</th>
            <th style={styles.th}>جهة الاتصال</th>
            <th style={styles.th}>الهاتف</th>
            <th style={styles.th}>الرقم الضريبي</th>
            <th style={styles.th}>شروط الدفع</th>
          </tr>
        </thead>
        <tbody>
          {vendors.map((v) => (
            <tr key={v.id}>
              <td style={styles.tdName}>
                {v.vendorCode ? <span style={styles.codeTag}>{v.vendorCode}</span> : null}
                {v.name}
              </td>
              <td style={styles.tdName}>{v.contactPerson || "—"}</td>
              <td style={styles.tdName} dir="ltr">{v.phone || "—"}</td>
              <td style={styles.tdName} dir="ltr">{v.taxNumber || "—"}</td>
              <td style={styles.tdName}>{v.paymentTerms || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════ تبويب اعتماد التكاليف ═══════════
function ApprovalsTab({ items, vendorName, onApprove, onReload, setError }) {
  const [busyId, setBusyId] = useState("");
  const pending = items.filter((i) => i.costStatus === "pending_finance");

  async function reject(item) {
    if (!window.confirm(`رفض تكلفة الصنف «${item.name}»؟ سيعود للمشتريات للمراجعة.`)) return;
    setBusyId(item.id);
    setError("");
    try {
      const fn = httpsCallable(functions, "approveItemCost");
      await fn({ itemId: item.id, action: "reject" });
      onReload();
    } catch (e) {
      setError(e.message || "تعذّر الرفض.");
    } finally {
      setBusyId("");
    }
  }

  if (pending.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>✅</div>
        <p style={styles.muted}>لا توجد تكاليف بانتظار الاعتماد. كل شيء مُعتمد.</p>
      </div>
    );
  }
  return (
    <div>
      <div style={styles.approvalNote}>
        💼 هذه الأصناف أرسلتها المشتريات لاعتماد تكلفتها. راجع التكلفة، حدّد الضرائب، ثم اعتمد أو ارفض.
      </div>
      {pending.map((it) => (
        <div key={it.id} style={styles.approvalCard}>
          <div style={styles.approvalInfo}>
            <div style={styles.approvalName}>
              {it.itemCode ? <span style={styles.codeTag}>{it.itemCode}</span> : null}
              {it.name}
            </div>
            <div style={styles.approvalMeta}>
              {it.category ? <span>الفئة: {it.category}</span> : null}
              {(it.dealTypes || []).length ? <span>التعامل: {(it.dealTypes || []).map((d) => DEAL_LABELS[d] || d).join("، ")}</span> : null}
            </div>
          </div>
          <div style={styles.approvalCost}>
            <span style={styles.approvalCostLabel}>التكلفة المطلوبة</span>
            <span style={styles.approvalCostValue} dir="ltr">{fmt(it.estimatedCost)} ﷼</span>
          </div>
          <div style={styles.approvalActions}>
            <button style={styles.approveBtn} onClick={() => onApprove(it)}>اعتماد</button>
            <button style={styles.rejectBtn} onClick={() => reject(it)} disabled={busyId === it.id}>
              {busyId === it.id ? "..." : "رفض"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════ مودال: مورّد جديد ═══════════
function VendorForm({ onClose, onSaved }) {
  const [f, setF] = useState({ name: "", vendorCode: "", contactPerson: "", phone: "", email: "", taxNumber: "", address: "", paymentTerms: "" });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم المورّد مطلوب (حرفان على الأقل)."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createVendor");
      await fn(f);
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="مورّد جديد" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <label style={styles.label}>اسم المورّد *</label>
      <input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} />
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>كود المورّد</label>
          <input style={styles.input} value={f.vendorCode} onChange={(e) => set("vendorCode", e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>جهة الاتصال</label>
          <input style={styles.input} value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} disabled={saving} />
        </div>
      </div>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الهاتف</label>
          <input style={styles.input} value={f.phone} onChange={(e) => set("phone", e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>البريد الإلكتروني</label>
          <input style={styles.input} value={f.email} onChange={(e) => set("email", e.target.value)} disabled={saving} dir="ltr" />
        </div>
      </div>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الرقم الضريبي</label>
          <input style={styles.input} value={f.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>شروط الدفع</label>
          <input style={styles.input} value={f.paymentTerms} onChange={(e) => set("paymentTerms", e.target.value)} placeholder="مثل: 30 يوم" disabled={saving} />
        </div>
      </div>
      <label style={styles.label}>العنوان</label>
      <input style={styles.input} value={f.address} onChange={(e) => set("address", e.target.value)} disabled={saving} />
      <FormActions onClose={onClose} onSave={save} saving={saving} label="حفظ المورّد" />
    </Modal>
  );
}

// ═══════════ مودال: صنف جديد ═══════════
function ItemForm({ vendors, onClose, onSaved }) {
  const [f, setF] = useState({ name: "", itemCode: "", category: "", unit: "", description: "", preferredVendorId: "", estimatedCost: "" });
  const [dealTypes, setDealTypes] = useState([]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const toggleDeal = (d) => setDealTypes((p) => p.includes(d) ? p.filter((x) => x !== d) : [...p, d]);

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم الصنف مطلوب (حرفان على الأقل)."); return; }
    if (dealTypes.length === 0) { setErr("اختر نوع تعامل واحدًا على الأقل."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createItem");
      await fn({
        name: f.name, itemCode: f.itemCode, category: f.category, unit: f.unit,
        dealTypes, description: f.description, preferredVendorId: f.preferredVendorId,
        estimatedCost: f.estimatedCost === "" ? null : Number(f.estimatedCost),
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="صنف جديد" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <label style={styles.label}>اسم الصنف *</label>
      <input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} />
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>كود الصنف</label>
          <input style={styles.input} value={f.itemCode} onChange={(e) => set("itemCode", e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الفئة</label>
          <input style={styles.input} value={f.category} onChange={(e) => set("category", e.target.value)} disabled={saving} />
        </div>
      </div>

      <label style={styles.label}>نوع التعامل *</label>
      <div style={styles.dealRow}>
        {Object.entries(DEAL_LABELS).map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => toggleDeal(k)} disabled={saving}
            style={{ ...styles.dealBtn, ...(dealTypes.includes(k) ? styles.dealBtnActive : {}) }}>
            {dealTypes.includes(k) ? "✓ " : ""}{lbl}
          </button>
        ))}
      </div>

      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الوحدة</label>
          <input style={styles.input} value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="قطعة، كرتون..." disabled={saving} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>التكلفة التقديرية</label>
          <input style={styles.input} type="number" min="0" value={f.estimatedCost} onChange={(e) => set("estimatedCost", e.target.value)} disabled={saving} dir="ltr" />
        </div>
      </div>

      <label style={styles.label}>المورّد المفضّل</label>
      <select style={styles.input} value={f.preferredVendorId} onChange={(e) => set("preferredVendorId", e.target.value)} disabled={saving}>
        <option value="">— بدون —</option>
        {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>

      <label style={styles.label}>الوصف</label>
      <input style={styles.input} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} />

      <p style={styles.formHint}>💡 بعد الحفظ، أرسل التكلفة للمالية من زر «إرسال للمالية» في جدول الأصناف.</p>
      <FormActions onClose={onClose} onSave={save} saving={saving} label="حفظ الصنف" />
    </Modal>
  );
}

// ═══════════ مودال: اعتماد التكلفة (المالية) ═══════════
function ApproveForm({ item, onClose, onSaved }) {
  const [approvedCost, setApprovedCost] = useState(item.estimatedCost != null ? String(item.estimatedCost) : "");
  const [vatApplicable, setVatApplicable] = useState(true);
  const [vatRate, setVatRate] = useState("15");
  const [exciseApplicable, setExciseApplicable] = useState(false);
  const [exciseRate, setExciseRate] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const cost = Number(approvedCost) || 0;
  const vatAmount = vatApplicable ? cost * (Number(vatRate) || 0) / 100 : 0;
  const exciseAmount = exciseApplicable ? cost * (Number(exciseRate) || 0) / 100 : 0;
  const totalWithTax = cost + vatAmount + exciseAmount;

  async function approve() {
    setErr("");
    if (!(cost > 0)) { setErr("أدخل التكلفة المعتمدة (أكبر من صفر)."); return; }
    if (vatApplicable && !(Number(vatRate) >= 0)) { setErr("نسبة الضريبة غير صحيحة."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "approveItemCost");
      await fn({
        itemId: item.id,
        action: "approve",
        approvedCost: cost,
        taxConfig: {
          vatApplicable,
          vatRate: Number(vatRate) || 0,
          exciseApplicable,
          exciseRate: Number(exciseRate) || 0,
        },
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الاعتماد.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="اعتماد تكلفة الصنف" onClose={onClose}>
      {err ? <div style={styles.error}>{err}</div> : null}
      <div style={styles.itemBanner}>
        {item.itemCode ? <span style={styles.codeTag}>{item.itemCode}</span> : null}
        <span style={styles.itemBannerName}>{item.name}</span>
        <span style={styles.itemBannerReq} dir="ltr">طُلب: {fmt(item.estimatedCost)} ﷼</span>
      </div>

      <label style={styles.label}>التكلفة المعتمدة *</label>
      <input style={styles.input} type="number" min="0" value={approvedCost} onChange={(e) => setApprovedCost(e.target.value)} disabled={saving} dir="ltr" />

      <div style={styles.taxSection}>
        <label style={styles.taxToggle}>
          <input type="checkbox" checked={vatApplicable} onChange={(e) => setVatApplicable(e.target.checked)} disabled={saving} />
          <span>خاضع لضريبة القيمة المضافة</span>
        </label>
        {vatApplicable ? (
          <div style={styles.taxRate}>
            <span style={styles.taxRateLabel}>النسبة %</span>
            <input style={styles.taxInput} type="number" min="0" value={vatRate} onChange={(e) => setVatRate(e.target.value)} disabled={saving} dir="ltr" />
          </div>
        ) : null}
      </div>

      <div style={styles.taxSection}>
        <label style={styles.taxToggle}>
          <input type="checkbox" checked={exciseApplicable} onChange={(e) => setExciseApplicable(e.target.checked)} disabled={saving} />
          <span>خاضع لضريبة انتقائية</span>
        </label>
        {exciseApplicable ? (
          <div style={styles.taxRate}>
            <span style={styles.taxRateLabel}>النسبة %</span>
            <input style={styles.taxInput} type="number" min="0" value={exciseRate} onChange={(e) => setExciseRate(e.target.value)} disabled={saving} dir="ltr" />
          </div>
        ) : null}
      </div>

      <div style={styles.taxSummary}>
        <div style={styles.taxSumRow}><span>التكلفة</span><span dir="ltr">{fmt(cost)} ﷼</span></div>
        {vatApplicable ? <div style={styles.taxSumRow}><span>ق. مضافة ({vatRate}%)</span><span dir="ltr">{fmt(vatAmount)} ﷼</span></div> : null}
        {exciseApplicable ? <div style={styles.taxSumRow}><span>انتقائية ({exciseRate}%)</span><span dir="ltr">{fmt(exciseAmount)} ﷼</span></div> : null}
        <div style={{ ...styles.taxSumRow, ...styles.taxSumTotal }}><span>الإجمالي بالضريبة</span><span dir="ltr">{fmt(totalWithTax)} ﷼</span></div>
      </div>

      <div style={styles.modalActions}>
        <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
        <button style={styles.confirmApproveBtn} onClick={approve} disabled={saving}>
          {saving ? "جارٍ الاعتماد..." : "اعتماد التكلفة"}
        </button>
      </div>
    </Modal>
  );
}

// ═══════════ مكوّنات مودال مشتركة ═══════════
function Modal({ title, children, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{title}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function FormActions({ onClose, onSave, saving, label }) {
  return (
    <div style={styles.modalActions}>
      <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
      <button style={styles.saveBtn} onClick={onSave} disabled={saving}>{saving ? "جارٍ الحفظ..." : label}</button>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#059669", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0, maxWidth: 560 },
  topBtns: { display: "flex", gap: 10 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },
  mutedSmall: { color: "#94a3b8", fontSize: 12 },

  tabs: { display: "flex", gap: 8, marginBottom: 18, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "none", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: -2, display: "flex", alignItems: "center", gap: 6 },
  tabActive: { color: "#059669", borderBottomColor: "#059669" },
  badge: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 5px", background: "#dc2626", color: "#fff", borderRadius: 9, fontSize: 11, fontWeight: 700 },

  empty: { padding: 44, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 40, marginBottom: 10 },

  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "right", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thAmount: { textAlign: "left", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  thCenter: { textAlign: "center", padding: "12px 14px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  tdName: { padding: "11px 14px", fontSize: 14, borderBottom: "1px solid #f1f5f9", color: "#334155" },
  tdAmount: { padding: "11px 14px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" },
  tdCenter: { padding: "11px 14px", fontSize: 14, textAlign: "center", borderBottom: "1px solid #f1f5f9" },
  codeTag: { display: "inline-block", padding: "1px 8px", marginLeft: 8, background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },
  badge2: { display: "inline-block", padding: "3px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700 },
  sendBtn: { padding: "6px 14px", fontSize: 12, fontWeight: 700, color: "#fff", background: "#0ea5e9", border: "none", borderRadius: 8, cursor: "pointer" },

  approvalNote: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 13, color: "#92400e", marginBottom: 16 },
  approvalCard: { display: "flex", alignItems: "center", gap: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", marginBottom: 12, flexWrap: "wrap" },
  approvalInfo: { flex: 1, minWidth: 200 },
  approvalName: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  approvalMeta: { display: "flex", gap: 14, fontSize: 12, color: "#94a3b8", flexWrap: "wrap" },
  approvalCost: { display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-end" },
  approvalCostLabel: { fontSize: 12, color: "#94a3b8" },
  approvalCostValue: { fontSize: 18, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },
  approvalActions: { display: "flex", gap: 8 },
  approveBtn: { padding: "9px 20px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
  rejectBtn: { padding: "9px 16px", fontSize: 13, fontWeight: 700, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },

  row: { display: "flex", gap: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "12px 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  formHint: { fontSize: 12, color: "#64748b", background: "#f8fafc", padding: "10px 12px", borderRadius: 8, margin: "16px 0 0" },

  dealRow: { display: "flex", gap: 8 },
  dealBtn: { flex: 1, padding: "9px 8px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 8, cursor: "pointer" },
  dealBtnActive: { borderColor: "#059669", background: "#ecfdf5", color: "#059669" },

  itemBanner: { display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#f8fafc", borderRadius: 10, marginBottom: 8, flexWrap: "wrap" },
  itemBannerName: { fontSize: 15, fontWeight: 700, color: "#0f172a", flex: 1 },
  itemBannerReq: { fontSize: 13, color: "#64748b", fontFamily: "monospace" },

  taxSection: { marginTop: 14, padding: "12px 14px", background: "#f8fafc", borderRadius: 10 },
  taxToggle: { display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600, color: "#334155", cursor: "pointer" },
  taxRate: { display: "flex", alignItems: "center", gap: 10, marginTop: 10 },
  taxRateLabel: { fontSize: 13, color: "#64748b" },
  taxInput: { width: 100, padding: "8px 10px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit" },

  taxSummary: { marginTop: 16, padding: "14px 18px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10 },
  taxSumRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", padding: "5px 0", fontFamily: "monospace" },
  taxSumTotal: { borderTop: "2px solid #6ee7b7", marginTop: 6, paddingTop: 10, fontWeight: 800, color: "#065f46", fontSize: 16 },

  modalActions: { display: "flex", gap: 10, marginTop: 22 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
  confirmApproveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer" },
};
