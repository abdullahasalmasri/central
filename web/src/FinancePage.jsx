import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { exportToExcel, exportToPDF, datedFileName } from "./exportUtils";
import JournalTab from "./JournalTab";
import TrialBalanceTab from "./TrialBalanceTab";
import CustomersTab from "./CustomersTab";
import InvoicesTab from "./InvoicesTab";
import CompanyProfileTab from "./CompanyProfileTab";
import ReportsTab from "./ReportsTab";
import SharedResourcesTab from "./SharedResourcesTab";
import ProjectApprovalTab from "./ProjectApprovalTab";
import FinancialStatementsTab from "./FinancialStatementsTab";

const ACCOUNT_TYPES = [
  { id: "asset", label: "الأصول", color: "#2563eb", range: "1000-1999" },
  { id: "liability", label: "الخصوم", color: "#dc2626", range: "2000-2999" },
  { id: "equity", label: "حقوق الملكية", color: "#7c3aed", range: "3000-3999" },
  { id: "revenue", label: "الإيرادات", color: "#16a34a", range: "4000-4999" },
  { id: "expense", label: "المصروفات", color: "#ea580c", range: "5000-5999" },
];

const SUBTYPE_LABELS = {
  current_asset: "متداول", non_current_asset: "غير متداول",
  current_liability: "متداول", non_current_liability: "غير متداول",
  equity: "حقوق ملكية",
  operating_revenue: "تشغيلي", non_operating_revenue: "غير تشغيلي",
  cogs: "تكلفة مبيعات", operating_expense: "تشغيلي", non_operating_expense: "غير تشغيلي",
};

const DEAL_LABELS = { sale: "للبيع", rental: "للتأجير", consumable: "للاستهلاك" };

export default function FinancePage({ tenantId, companyName }) {
  const [tab, setTab] = useState("accounts");
  const [pendingCount, setPendingCount] = useState(0);

  async function loadPendingCount() {
    try {
      const snap = await getDocs(query(
        collection(db, "items"),
        where("tenantId", "==", tenantId),
        where("costStatus", "==", "pending_finance")
      ));
      setPendingCount(snap.size);
    } catch { /* تجاهل */ }
  }
  useEffect(() => { loadPendingCount(); }, []);

  return (
    <div>
      <div style={styles.pageHead}>
        <h1 style={styles.pageTitle}>المالية</h1>
      </div>

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "accounts" ? styles.tabActive : {}) }} onClick={() => setTab("accounts")}>
          📒 دليل الحسابات
        </button>
        <button style={{ ...styles.tab, ...(tab === "journal" ? styles.tabActive : {}) }} onClick={() => setTab("journal")}>
          📋 القيود
        </button>
        <button style={{ ...styles.tab, ...(tab === "trial" ? styles.tabActive : {}) }} onClick={() => setTab("trial")}>
          ⚖️ ميزان المراجعة
        </button>
        <button style={{ ...styles.tab, ...(tab === "customers" ? styles.tabActive : {}) }} onClick={() => setTab("customers")}>
          👥 العملاء
        </button>
        <button style={{ ...styles.tab, ...(tab === "invoices" ? styles.tabActive : {}) }} onClick={() => setTab("invoices")}>
          🧾 الفواتير
        </button>
        <button style={{ ...styles.tab, ...(tab === "costs" ? styles.tabActive : {}) }} onClick={() => setTab("costs")}>
          🧮 اعتماد التكاليف {pendingCount > 0 ? <span style={styles.tabBadge}>{pendingCount}</span> : null}
        </button>
        <button style={{ ...styles.tab, ...(tab === "reports" ? styles.tabActive : {}) }} onClick={() => setTab("reports")}>
          📊 التقارير
        </button>
        <button style={{ ...styles.tab, ...(tab === "shared" ? styles.tabActive : {}) }} onClick={() => setTab("shared")}>
          🧩 الموارد المشتركة
        </button>
        <button style={{ ...styles.tab, ...(tab === "approval" ? styles.tabActive : {}) }} onClick={() => setTab("approval")}>
          ✅ اعتماد المشاريع
        </button>
        <button style={{ ...styles.tab, ...(tab === "statements" ? styles.tabActive : {}) }} onClick={() => setTab("statements")}>
          📑 القوائم المالية
        </button>
        <button style={{ ...styles.tab, ...(tab === "company" ? styles.tabActive : {}) }} onClick={() => setTab("company")}>
          ⚙️ إعدادات الشركة
        </button>
      </div>

      {tab === "accounts" ? (
        <AccountsTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "journal" ? (
        <JournalTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "trial" ? (
        <TrialBalanceTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "customers" ? (
        <CustomersTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "invoices" ? (
        <InvoicesTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "reports" ? (
        <ReportsTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "shared" ? (
        <SharedResourcesTab tenantId={tenantId} companyName={companyName} mode="finance" />
      ) : tab === "approval" ? (
        <ProjectApprovalTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "statements" ? (
        <FinancialStatementsTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "company" ? (
        <CompanyProfileTab tenantId={tenantId} companyName={companyName} />
      ) : (
        <CostsTab tenantId={tenantId} onChange={loadPendingCount} />
      )}
    </div>
  );
}

// ═══ تبويب دليل الحسابات ═══
function AccountsTab({ tenantId, companyName }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "accounts"), where("tenantId", "==", tenantId)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
      setAccounts(list);
    } catch (err) {
      setError("تعذّر تحميل دليل الحسابات.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  async function handleSeed() {
    setSeeding(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "seedChartOfAccounts");
      await fn({});
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر إنشاء الدليل الافتراضي.");
    } finally {
      setSeeding(false);
    }
  }

  const company = companyName || "الشركة";
  const accountsByType = (typeId) => accounts.filter((a) => a.type === typeId);
  const typeLabel = (id) => { const t = ACCOUNT_TYPES.find((x) => x.id === id); return t ? t.label : id; };

  function buildRows() {
    return accounts.map((a) => ({
      code: a.code, name: a.name, type: typeLabel(a.type),
      subtype: SUBTYPE_LABELS[a.subtype] || "", balance: a.balance != null ? a.balance : 0,
    }));
  }
  const exportColumns = [
    { key: "code", header: "رقم الحساب" }, { key: "name", header: "اسم الحساب" },
    { key: "type", header: "النوع" }, { key: "subtype", header: "التصنيف" }, { key: "balance", header: "الرصيد" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("دليل-الحسابات"), sheetName: "دليل الحسابات" });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("دليل-الحسابات"), header: { companyName: company, title: "دليل الحسابات", subtitle: "وفق معايير IFRS" } });

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  if (accounts.length === 0) {
    return (
      <>
        {error ? <div style={styles.error}>{error}</div> : null}
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📒</div>
          <h2 style={styles.emptyTitle}>لم يُنشأ دليل الحسابات بعد</h2>
          <p style={styles.emptyDesc}>ابدأ بدليل حسابات افتراضي متوافق مع معايير IFRS (١٩ حسابًا أساسيًا)، ثم عدّل وأضف حسب احتياج شركتك.</p>
          <button style={styles.seedBtn} onClick={handleSeed} disabled={seeding}>
            {seeding ? "جارٍ الإنشاء..." : "🚀 إنشاء الدليل الافتراضي (IFRS)"}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={styles.toolbar}>
        <span style={styles.summaryText}>{accounts.length} حساب · متوافق مع IFRS</span>
        <div style={styles.toolBtns}>
          <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
          <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
          <button style={styles.addBtn} onClick={() => setShowAddForm(true)}>+ إضافة حساب</button>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      <div style={styles.groups}>
        {ACCOUNT_TYPES.map((type) => {
          const list = accountsByType(type.id);
          if (list.length === 0) return null;
          return (
            <div key={type.id} style={styles.group}>
              <div style={{ ...styles.groupHead, borderRightColor: type.color }}>
                <span style={{ ...styles.groupTitle, color: type.color }}>{type.label}</span>
                <span style={styles.groupRange}>{type.range}</span>
                <span style={styles.groupCount}>{list.length}</span>
              </div>
              <table style={styles.table}>
                <tbody>
                  {list.map((acc) => (
                    <tr key={acc.id}>
                      <td style={styles.tdCode} dir="ltr">{acc.code}</td>
                      <td style={styles.tdName}>
                        {acc.name}
                        {acc.isSystem ? <span style={styles.sysTag}>أساسي</span> : null}
                      </td>
                      <td style={styles.tdSubtype}>{SUBTYPE_LABELS[acc.subtype] || "—"}</td>
                      <td style={styles.tdBalance} dir="ltr">{(acc.balance || 0).toLocaleString()} ﷼</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      {showAddForm ? (
        <AccountForm onClose={() => setShowAddForm(false)} onSaved={() => { setShowAddForm(false); loadData(); }} />
      ) : null}
    </>
  );
}

// ═══ تبويب اعتماد التكاليف (مع تحديد الضرائب) ═══
function CostsTab({ tenantId, onChange }) {
  const [pending, setPending] = useState([]);
  const [decided, setDecided] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState("");

  const [approvedCost, setApprovedCost] = useState("");
  const [vatApplicable, setVatApplicable] = useState(false);
  const [vatRate, setVatRate] = useState("15");
  const [exciseApplicable, setExciseApplicable] = useState(false);
  const [exciseRate, setExciseRate] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [itemSnap, vendorSnap] = await Promise.all([
        getDocs(query(collection(db, "items"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "vendors"), where("tenantId", "==", tenantId))),
      ]);
      const all = itemSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setPending(all.filter((it) => it.costStatus === "pending_finance"));
      setDecided(all.filter((it) => it.costStatus === "approved" || it.costStatus === "rejected"));
      setVendors(vendorSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل الأصناف.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  function startApprove(item) {
    setEditingId(item.id);
    setApprovedCost(String(item.estimatedCost != null ? item.estimatedCost : ""));
    setVatApplicable(false);
    setVatRate("15");
    setExciseApplicable(false);
    setExciseRate("");
    setError("");
  }
  function cancelApprove() {
    setEditingId(""); setApprovedCost(""); setVatApplicable(false); setVatRate("15"); setExciseApplicable(false); setExciseRate("");
  }

  async function confirmApprove(itemId) {
    setError("");
    const cost = Number(approvedCost);
    if (!Number.isFinite(cost) || cost < 0) { setError("التكلفة المعتمدة غير صحيحة."); return; }
    if (vatApplicable) {
      const vr = Number(vatRate);
      if (!Number.isFinite(vr) || vr < 0 || vr > 100) { setError("نسبة القيمة المضافة غير صحيحة (0-100)."); return; }
    }
    if (exciseApplicable) {
      const er = Number(exciseRate);
      if (!Number.isFinite(er) || er < 0 || er > 1000) { setError("نسبة الضريبة الانتقائية غير صحيحة."); return; }
    }

    setBusy(itemId);
    try {
      const fn = httpsCallable(functions, "approveItemCost");
      await fn({
        itemId,
        action: "approve",
        approvedCost: cost,
        taxConfig: {
          vatApplicable,
          vatRate: vatApplicable ? Number(vatRate) : 15,
          exciseApplicable,
          exciseRate: exciseApplicable ? Number(exciseRate) : 0,
        },
      });
      cancelApprove();
      await loadData();
      if (onChange) onChange();
    } catch (err) {
      setError(err.message || "تعذّر الاعتماد.");
    } finally {
      setBusy("");
    }
  }

  async function reject(itemId) {
    setBusy(itemId);
    setError("");
    try {
      const fn = httpsCallable(functions, "approveItemCost");
      await fn({ itemId, action: "reject" });
      await loadData();
      if (onChange) onChange();
    } catch (err) {
      setError(err.message || "تعذّر الرفض.");
    } finally {
      setBusy("");
    }
  }

  const dealLabel = (id) => DEAL_LABELS[id] || id;
  const vendorName = (id) => { const v = vendors.find((x) => x.id === id); return v ? v.name : null; };

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  return (
    <div style={styles.costsPanel}>
      {error ? <div style={styles.error}>{error}</div> : null}

      <h3 style={styles.costSection}>بانتظار اعتمادك {pending.length > 0 ? `(${pending.length})` : ""}</h3>
      {pending.length === 0 ? (
        <p style={styles.muted}>لا توجد تكاليف بانتظار الاعتماد. 👍</p>
      ) : (
        <div style={styles.costList}>
          {pending.map((it) => {
            const busyThis = busy === it.id;
            const isEditing = editingId === it.id;
            return (
              <div key={it.id} style={styles.costCard}>
                <div style={styles.costTop}>
                  <strong style={styles.costName}>{it.name}</strong>
                  <span style={styles.estCost}>التقديرية: {it.estimatedCost} ﷼</span>
                </div>
                <div style={styles.costMeta}>
                  {(it.dealTypes || []).map((d) => <span key={d} style={styles.dealChip}>{dealLabel(d)}</span>)}
                  {vendorName(it.preferredVendorId) ? <span style={styles.muted2}>· {vendorName(it.preferredVendorId)}</span> : null}
                </div>

                {isEditing ? (
                  <div style={styles.approveBox}>
                    <label style={styles.fieldLabel}>التكلفة المعتمدة (ريال)</label>
                    <input style={styles.fieldInput} type="number" min="0" value={approvedCost}
                      onChange={(e) => setApprovedCost(e.target.value)} disabled={busyThis} dir="ltr" />

                    <div style={styles.taxSection}>
                      <span style={styles.taxTitle}>الضرائب المطبّقة على هذا الصنف</span>

                      <label style={styles.taxRow}>
                        <input type="checkbox" checked={vatApplicable} onChange={(e) => setVatApplicable(e.target.checked)} disabled={busyThis} />
                        <span style={styles.taxName}>ضريبة القيمة المضافة (VAT)</span>
                        {vatApplicable ? (
                          <span style={styles.rateBox}>
                            <input style={styles.rateInput} type="number" min="0" max="100" value={vatRate}
                              onChange={(e) => setVatRate(e.target.value)} disabled={busyThis} dir="ltr" />
                            <span style={styles.pct}>%</span>
                          </span>
                        ) : null}
                      </label>

                      <label style={styles.taxRow}>
                        <input type="checkbox" checked={exciseApplicable} onChange={(e) => setExciseApplicable(e.target.checked)} disabled={busyThis} />
                        <span style={styles.taxName}>ضريبة انتقائية (Excise)</span>
                        {exciseApplicable ? (
                          <span style={styles.rateBox}>
                            <input style={styles.rateInput} type="number" min="0" max="1000" value={exciseRate}
                              onChange={(e) => setExciseRate(e.target.value)} placeholder="100" disabled={busyThis} dir="ltr" />
                            <span style={styles.pct}>%</span>
                          </span>
                        ) : null}
                      </label>

                      {!vatApplicable && !exciseApplicable ? (
                        <span style={styles.exemptNote}>✓ هذا الصنف معفى من الضرائب</span>
                      ) : null}
                    </div>

                    <div style={styles.approveActions}>
                      <button style={styles.confirmBtn} onClick={() => confirmApprove(it.id)} disabled={busyThis}>
                        {busyThis ? "جارٍ الاعتماد..." : "✓ اعتماد"}
                      </button>
                      <button style={styles.cancelBtn} onClick={cancelApprove} disabled={busyThis}>إلغاء</button>
                    </div>
                  </div>
                ) : (
                  <div style={styles.costActions}>
                    <button style={styles.approveBtn} onClick={() => startApprove(it)} disabled={busyThis}>
                      اعتماد وتحديد الضرائب
                    </button>
                    <button style={styles.rejectBtn} onClick={() => reject(it.id)} disabled={busyThis}>
                      {busyThis ? "..." : "رفض"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {decided.length > 0 ? (
        <>
          <h3 style={styles.costSection}>قرارات سابقة</h3>
          <div style={styles.costList}>
            {decided.map((it) => (
              <div key={it.id} style={styles.decidedRow}>
                <span>{it.name}</span>
                <span style={styles.decidedRight}>
                  {it.costStatus === "approved" ? (
                    <>
                      <span style={styles.approvedTag}>معتمد: {it.approvedCost} ﷼</span>
                      {it.taxConfig && it.taxConfig.vatApplicable ? <span style={styles.taxTag}>VAT {it.taxConfig.vatRate}%</span> : null}
                      {it.taxConfig && it.taxConfig.exciseApplicable ? <span style={styles.exciseTag}>انتقائية {it.taxConfig.exciseRate}%</span> : null}
                      {it.taxConfig && !it.taxConfig.vatApplicable && !it.taxConfig.exciseApplicable ? <span style={styles.exemptTag}>معفى</span> : null}
                    </>
                  ) : (
                    <span style={styles.rejectedTag}>مرفوض</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ═══ نموذج إضافة حساب ═══
function AccountForm({ onClose, onSaved }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [subtype, setSubtype] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const subtypesByType = {
    asset: [{ id: "current_asset", label: "متداول" }, { id: "non_current_asset", label: "غير متداول" }],
    liability: [{ id: "current_liability", label: "متداول" }, { id: "non_current_liability", label: "غير متداول" }],
    equity: [{ id: "equity", label: "حقوق ملكية" }],
    revenue: [{ id: "operating_revenue", label: "تشغيلي" }, { id: "non_operating_revenue", label: "غير تشغيلي" }],
    expense: [{ id: "cogs", label: "تكلفة مبيعات" }, { id: "operating_expense", label: "تشغيلي" }, { id: "non_operating_expense", label: "غير تشغيلي" }],
  };
  const availableSubtypes = type ? (subtypesByType[type] || []) : [];

  async function save() {
    setErr("");
    if (!/^\d{3,6}$/.test(code.trim())) { setErr("رقم الحساب يجب أن يكون من 3 إلى 6 أرقام."); return; }
    if (name.trim().length < 2) { setErr("اسم الحساب مطلوب."); return; }
    if (!type) { setErr("اختر نوع الحساب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createAccount");
      await fn({ code: code.trim(), name: name.trim(), type, subtype });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>إضافة حساب</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>رقم الحساب *</label>
            <input style={styles.input} value={code} onChange={(e) => setCode(e.target.value)} placeholder="1400" disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 2 }}>
            <label style={styles.label}>اسم الحساب *</label>
            <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: سلف الموظفين" disabled={saving} />
          </div>
        </div>
        <label style={styles.label}>نوع الحساب *</label>
        <div style={styles.typeGrid}>
          {ACCOUNT_TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => { setType(t.id); setSubtype(""); }} disabled={saving}
              style={{ ...styles.typeOption, ...(type === t.id ? { background: t.color, color: "#fff", borderColor: t.color } : {}) }}>
              {t.label}
              <span style={styles.typeRange}>{t.range}</span>
            </button>
          ))}
        </div>
        {availableSubtypes.length > 0 ? (
          <>
            <label style={styles.label}>التصنيف</label>
            <select style={styles.input} value={subtype} onChange={(e) => setSubtype(e.target.value)} disabled={saving}>
              <option value="">— اختر —</option>
              {availableSubtypes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </>
        ) : null}
        {err ? <div style={styles.error}>{err}</div> : null}
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الحساب"}</button>
      </div>
    </div>
  );
}

const styles = {
  pageHead: { marginBottom: 20 },
  pageTitle: { margin: 0, fontSize: 24, color: "#16a34a" },
  tabs: { display: "flex", gap: 8, marginBottom: 20, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "12px 20px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "transparent", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: "-2px", display: "flex", alignItems: "center", gap: 8 },
  tabActive: { color: "#16a34a", borderBottomColor: "#16a34a" },
  tabBadge: { background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 10 },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  summaryText: { fontSize: 14, color: "#15803d", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },

  emptyState: { textAlign: "center", padding: "60px 24px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { margin: "0 0 12px", fontSize: 20, color: "#0f172a" },
  emptyDesc: { margin: "0 auto 24px", fontSize: 15, color: "#64748b", maxWidth: 480, lineHeight: 1.7 },
  seedBtn: { padding: "14px 28px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 10, cursor: "pointer" },

  groups: { display: "flex", flexDirection: "column", gap: 20 },
  group: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  groupHead: { display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "#f8fafc", borderRight: "4px solid", borderBottom: "1px solid #e2e8f0" },
  groupTitle: { fontSize: 16, fontWeight: 700 },
  groupRange: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  groupCount: { marginRight: "auto", fontSize: 13, color: "#64748b", background: "#e2e8f0", padding: "2px 10px", borderRadius: 12, fontWeight: 600 },
  table: { width: "100%", borderCollapse: "collapse" },
  tdCode: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#475569", fontFamily: "monospace", width: 80, borderBottom: "1px solid #f1f5f9" },
  tdName: { padding: "10px 12px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  tdSubtype: { padding: "10px 12px", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" },
  tdBalance: { padding: "10px 18px", fontSize: 14, color: "#0f172a", textAlign: "left", borderBottom: "1px solid #f1f5f9" },
  sysTag: { marginRight: 8, fontSize: 10, color: "#16a34a", background: "#dcfce7", padding: "1px 7px", borderRadius: 8, fontWeight: 600 },

  costsPanel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 },
  costSection: { fontSize: 15, color: "#15803d", margin: "8px 0 12px", borderBottom: "2px solid #dcfce7", paddingBottom: 6 },
  costList: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 },
  costCard: { padding: "14px 16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" },
  costTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  costName: { fontSize: 15 },
  estCost: { fontSize: 14, color: "#92400e", fontWeight: 600 },
  costMeta: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 },
  dealChip: { fontSize: 12, color: "#7c3aed", background: "#f3e8ff", padding: "2px 9px", borderRadius: 10, fontWeight: 600 },
  muted2: { fontSize: 12, color: "#94a3b8" },
  costActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  approveBtn: { flex: 1, minWidth: 160, padding: "9px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 7, cursor: "pointer" },
  rejectBtn: { minWidth: 80, padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 7, cursor: "pointer" },

  approveBox: { marginTop: 8, padding: 14, background: "#fff", borderRadius: 8, border: "1px solid #d1fae5" },
  fieldLabel: { display: "block", fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 6 },
  fieldInput: { width: "100%", padding: "9px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", marginBottom: 14 },
  taxSection: { padding: 12, background: "#f8fafc", borderRadius: 8, marginBottom: 14 },
  taxTitle: { display: "block", fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 10 },
  taxRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14, cursor: "pointer" },
  taxName: { flex: 1 },
  rateBox: { display: "flex", alignItems: "center", gap: 4 },
  rateInput: { width: 70, padding: "6px 8px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6, textAlign: "center" },
  pct: { fontSize: 14, color: "#64748b", fontWeight: 600 },
  exemptNote: { display: "block", fontSize: 13, color: "#16a34a", fontWeight: 600, marginTop: 4 },
  approveActions: { display: "flex", gap: 8 },
  confirmBtn: { flex: 1, padding: "10px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 7, cursor: "pointer" },
  cancelBtn: { padding: "10px 18px", fontSize: 14, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },

  decidedRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 14, gap: 8, flexWrap: "wrap" },
  decidedRight: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  approvedTag: { padding: "3px 10px", background: "#dcfce7", color: "#166534", borderRadius: 12, fontSize: 12, fontWeight: 600 },
  taxTag: { padding: "3px 8px", background: "#dbeafe", color: "#1e40af", borderRadius: 12, fontSize: 11, fontWeight: 600 },
  exciseTag: { padding: "3px 8px", background: "#fef3c7", color: "#92400e", borderRadius: 12, fontSize: 11, fontWeight: 600 },
  exemptTag: { padding: "3px 8px", background: "#f1f5f9", color: "#64748b", borderRadius: 12, fontSize: 11, fontWeight: 600 },
  rejectedTag: { padding: "3px 10px", background: "#fee2e2", color: "#b91c1c", borderRadius: 12, fontSize: 12, fontWeight: 600 },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 540, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },
  typeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 },
  typeOption: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 8px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff", color: "#475569" },
  typeRange: { fontSize: 9, opacity: 0.7, fontFamily: "monospace" },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },
  muted: { color: "#94a3b8", fontSize: 14 },
};
