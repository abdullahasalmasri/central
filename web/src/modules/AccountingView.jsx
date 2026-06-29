import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";
import { exportToExcel, exportToPDF, datedFileName } from "../exportUtils";

/* ============================================================
   المحاسبة — قسم المالية
   تجمع تبويبين: «دليل الحسابات» و «القيود اليومية».
   منقولة من النظام القديم (AccountsTab + JournalTab) إلى الـ Shell.
   تجلب tenantId واسم المنشأة مرة واحدة وتمرّرهما للتبويبين.
   ============================================================ */

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

// ميزان المراجعة: الأصول والمصروفات طبيعتها مدينة
const DEBIT_NATURE = ["asset", "expense"];
const TYPE_LABELS = {
  asset: "الأصول", liability: "الخصوم", equity: "حقوق الملكية",
  revenue: "الإيرادات", expense: "المصروفات",
};

// ═══════════ الحاوية: العنوان + التبويبات + جلب الهوية ═══════════
export default function AccountingView() {
  const [tab, setTab] = useState("accounts");
  const [tenantId, setTenantId] = useState("");
  const [companyName, setCompanyName] = useState("الشركة");
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityError, setIdentityError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setIdentityError("لم يتم تسجيل الدخول."); setIdentityLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setIdentityError("تعذّر تحديد المنشأة لهذا المستخدم."); setIdentityLoading(false); return; }
        try {
          const tSnap = await getDoc(doc(db, "tenants", tid));
          if (tSnap.exists() && tSnap.data().name) setCompanyName(tSnap.data().name);
        } catch (e) { /* اسم المنشأة اختياري */ }
        setTenantId(tid);
      } catch (e) {
        setIdentityError("تعذّر تحميل بيانات المستخدم.");
      } finally {
        setIdentityLoading(false);
      }
    })();
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.pageHead}>
        <h1 style={styles.pageTitle}>المحاسبة</h1>
        <p style={styles.pageSub}>دليل الحسابات والقيود اليومية · المالية</p>
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
      </div>

      {identityLoading ? (
        <p style={styles.muted}>جارٍ التحميل...</p>
      ) : identityError ? (
        <div style={styles.error}>{identityError}</div>
      ) : tab === "accounts" ? (
        <AccountsPanel tenantId={tenantId} companyName={companyName} />
      ) : tab === "journal" ? (
        <JournalPanel tenantId={tenantId} companyName={companyName} />
      ) : (
        <TrialBalancePanel tenantId={tenantId} companyName={companyName} />
      )}
    </div>
  );
}

// ═══════════ تبويب دليل الحسابات ═══════════
function AccountsPanel({ tenantId, companyName }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => { loadAccounts(); /* eslint-disable-next-line */ }, []);

  async function loadAccounts() {
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

  async function handleSeed() {
    setSeeding(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "seedChartOfAccounts");
      await fn({});
      await loadAccounts();
    } catch (err) {
      setError(err.message || "تعذّر إنشاء الدليل الافتراضي.");
    } finally {
      setSeeding(false);
    }
  }

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
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("دليل-الحسابات"), header: { companyName, title: "دليل الحسابات", subtitle: "وفق معايير IFRS" } });

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  if (accounts.length === 0) {
    return (
      <>
        {error ? <div style={styles.error}>{error}</div> : null}
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>📒</div>
          <h2 style={styles.emptyTitle}>لم يُنشأ دليل الحسابات بعد</h2>
          <p style={styles.emptyDesc}>ابدأ بدليل حسابات افتراضي متوافق مع معايير IFRS (١٩ حسابًا أساسيًا)، ثم عدّل وأضف حسب احتياج منشأتك.</p>
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
        <AccountForm onClose={() => setShowAddForm(false)} onSaved={() => { setShowAddForm(false); loadAccounts(); }} />
      ) : null}
    </>
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

// ═══════════ تبويب القيود اليومية ═══════════
function JournalPanel({ tenantId, companyName }) {
  const [accounts, setAccounts] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [viewEntry, setViewEntry] = useState(null);

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [accSnap, entSnap] = await Promise.all([
        getDocs(query(collection(db, "accounts"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "journalEntries"), where("tenantId", "==", tenantId))),
      ]);
      const accList = accSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      accList.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
      setAccounts(accList.filter((a) => a.isActive !== false));

      const entList = entSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      entList.sort((a, b) => (b.entryNumber || 0) - (a.entryNumber || 0));
      setEntries(entList);
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  function buildRows() {
    return entries.map((e) => ({
      number: e.entryNumber,
      date: e.date,
      description: e.description || "",
      debit: e.totalDebit,
      credit: e.totalCredit,
      source: sourceLabel(e.source),
    }));
  }
  const exportColumns = [
    { key: "number", header: "رقم القيد" },
    { key: "date", header: "التاريخ" },
    { key: "description", header: "البيان" },
    { key: "debit", header: "مدين" },
    { key: "credit", header: "دائن" },
    { key: "source", header: "المصدر" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("القيود"), sheetName: "القيود" });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("القيود"), header: { companyName, title: "دفتر اليومية", subtitle: "القيود المحاسبية" } });

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  if (accounts.length === 0) {
    return (
      <div style={styles.notice}>
        <p style={styles.noticeText}>أنشئ دليل الحسابات أولاً (من تبويب «دليل الحسابات») قبل إنشاء القيود.</p>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.toolbar}>
        <span style={styles.count}>{entries.length} قيد</span>
        <div style={styles.toolBtns}>
          {entries.length > 0 ? (
            <>
              <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
              <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
            </>
          ) : null}
          <button style={styles.addBtn} onClick={() => setShowForm(true)}>+ قيد جديد</button>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {entries.length === 0 ? (
        <p style={styles.muted}>لا توجد قيود بعد. أنشئ أول قيد.</p>
      ) : (
        <table style={styles.table}>
          <thead><tr>
            <th style={styles.th}>القيد</th><th style={styles.th}>التاريخ</th>
            <th style={styles.th}>البيان</th><th style={styles.th}>المبلغ</th>
            <th style={styles.th}>المصدر</th><th style={styles.th}></th>
          </tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td style={styles.tdNum} dir="ltr">JE-{e.entryNumber}</td>
                <td style={styles.td} dir="ltr">{e.date}</td>
                <td style={styles.td}>{e.description || "—"}</td>
                <td style={styles.tdAmount} dir="ltr">{(e.totalDebit || 0).toLocaleString()} ﷼</td>
                <td style={styles.td}><span style={styles.sourceTag}>{sourceLabel(e.source)}</span></td>
                <td style={styles.td}>
                  <button style={styles.viewBtn} onClick={() => setViewEntry(e)}>عرض</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm ? (
        <JournalForm accounts={accounts} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); loadData(); }} />
      ) : null}

      {viewEntry ? (
        <EntryDetail entry={viewEntry} onClose={() => setViewEntry(null)} />
      ) : null}
    </div>
  );
}

function sourceLabel(s) {
  const map = { manual: "يدوي", invoice: "فاتورة", payroll: "رواتب", procurement: "مشتريات" };
  return map[s] || s || "يدوي";
}

// ═══ نموذج إنشاء قيد ═══
function JournalForm({ accounts, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState([
    { accountId: "", debit: "", credit: "" },
    { accountId: "", debit: "", credit: "" },
  ]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((ln, i) => {
      if (i !== idx) return ln;
      const updated = { ...ln, [field]: value };
      if (field === "debit" && value) updated.credit = "";
      if (field === "credit" && value) updated.debit = "";
      return updated;
    }));
  }

  function addLine() {
    setLines((prev) => [...prev, { accountId: "", debit: "", credit: "" }]);
  }
  function removeLine(idx) {
    if (lines.length <= 2) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  const totalDebit = lines.reduce((s, ln) => s + (Number(ln.debit) || 0), 0);
  const totalCredit = lines.reduce((s, ln) => s + (Number(ln.credit) || 0), 0);
  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100) && totalDebit > 0;

  async function save() {
    setErr("");
    const cleanLines = lines
      .filter((ln) => ln.accountId && (Number(ln.debit) > 0 || Number(ln.credit) > 0))
      .map((ln) => ({
        accountId: ln.accountId,
        debit: Number(ln.debit) || 0,
        credit: Number(ln.credit) || 0,
      }));

    if (cleanLines.length < 2) { setErr("القيد يحتاج طرفين على الأقل بحساب ومبلغ."); return; }
    if (!balanced) { setErr("القيد غير متوازن — مجموع المدين يجب أن يساوي مجموع الدائن."); return; }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createJournalEntry");
      await fn({ date, description, lines: cleanLines, source: "manual" });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر حفظ القيد.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>قيد يومية جديد</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>التاريخ *</label>
            <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 2 }}>
            <label style={styles.label}>البيان</label>
            <input style={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف القيد..." disabled={saving} />
          </div>
        </div>

        <label style={styles.label}>أطراف القيد</label>
        <div style={styles.linesHead}>
          <span style={styles.lhAccount}>الحساب</span>
          <span style={styles.lhAmount}>مدين</span>
          <span style={styles.lhAmount}>دائن</span>
          <span style={styles.lhDel}></span>
        </div>

        {lines.map((ln, idx) => (
          <div key={idx} style={styles.lineRow}>
            <select style={styles.lineAccount} value={ln.accountId} onChange={(e) => updateLine(idx, "accountId", e.target.value)} disabled={saving}>
              <option value="">— اختر حسابًا —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
              ))}
            </select>
            <input style={styles.lineAmount} type="number" min="0" value={ln.debit} onChange={(e) => updateLine(idx, "debit", e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
            <input style={styles.lineAmount} type="number" min="0" value={ln.credit} onChange={(e) => updateLine(idx, "credit", e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
            <button style={styles.delBtn} onClick={() => removeLine(idx)} disabled={saving || lines.length <= 2} title="حذف الطرف">✕</button>
          </div>
        ))}

        <button style={styles.addLineBtn} onClick={addLine} disabled={saving}>+ إضافة طرف</button>

        <div style={{ ...styles.balanceBar, ...(balanced ? styles.balanceOk : styles.balanceBad) }}>
          <span>المدين: {totalDebit.toLocaleString()} ﷼</span>
          <span>الدائن: {totalCredit.toLocaleString()} ﷼</span>
          <span style={styles.balanceStatus}>
            {balanced ? "✓ متوازن" : totalDebit === 0 ? "أدخل المبالغ" : `الفرق: ${Math.abs(totalDebit - totalCredit).toLocaleString()}`}
          </span>
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}

        <button style={{ ...styles.save, ...(balanced ? {} : styles.saveDisabled) }} onClick={save} disabled={saving || !balanced}>
          {saving ? "جارٍ الترحيل..." : "ترحيل القيد"}
        </button>
      </div>
    </div>
  );
}

// ═══ تفاصيل قيد ═══
function EntryDetail({ entry, onClose }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>قيد JE-{entry.entryNumber}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.detailMeta}>
          <span>📅 {entry.date}</span>
          <span style={styles.sourceTag}>{sourceLabel(entry.source)}</span>
        </div>
        {entry.description ? <p style={styles.detailDesc}>{entry.description}</p> : null}

        <table style={styles.detailTable}>
          <thead><tr>
            <th style={styles.th}>الحساب</th>
            <th style={styles.thAmount}>مدين</th>
            <th style={styles.thAmount}>دائن</th>
          </tr></thead>
          <tbody>
            {(entry.lines || []).map((ln, i) => (
              <tr key={i}>
                <td style={styles.td}>
                  <span style={styles.lineCode} dir="ltr">{ln.accountCode}</span> {ln.accountName}
                </td>
                <td style={styles.tdAmount} dir="ltr">{ln.debit ? ln.debit.toLocaleString() : "—"}</td>
                <td style={styles.tdAmount} dir="ltr">{ln.credit ? ln.credit.toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={styles.totalRow}>
              <td style={styles.tdTotal}>الإجمالي</td>
              <td style={styles.tdAmountTotal} dir="ltr">{(entry.totalDebit || 0).toLocaleString()} ﷼</td>
              <td style={styles.tdAmountTotal} dir="ltr">{(entry.totalCredit || 0).toLocaleString()} ﷼</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ═══════════ تبويب ميزان المراجعة ═══════════
function TrialBalancePanel({ tenantId, companyName }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, []);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "accounts"), where("tenantId", "==", tenantId)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
      setAccounts(list);
    } catch (err) {
      setError("تعذّر تحميل الحسابات.");
    } finally {
      setLoading(false);
    }
  }

  // تحديد عمود كل حساب (مدين/دائن) حسب طبيعته
  function rowFor(acc) {
    const bal = acc.balance || 0;
    const isDebitNature = DEBIT_NATURE.includes(acc.type);
    let debit = 0, credit = 0;
    if (isDebitNature) {
      if (bal >= 0) debit = bal; else credit = -bal;
    } else {
      if (bal >= 0) credit = bal; else debit = -bal;
    }
    return { debit, credit };
  }

  const activeAccounts = accounts.filter((a) => (a.balance || 0) !== 0);

  let totalDebit = 0, totalCredit = 0;
  const rows = activeAccounts.map((acc) => {
    const { debit, credit } = rowFor(acc);
    totalDebit += debit;
    totalCredit += credit;
    return { acc, debit, credit };
  });

  const balanced = Math.round(totalDebit * 100) === Math.round(totalCredit * 100);

  function buildExportRows() {
    return rows.map((r) => ({
      code: r.acc.code,
      name: r.acc.name,
      type: TYPE_LABELS[r.acc.type] || r.acc.type,
      debit: r.debit || "",
      credit: r.credit || "",
    }));
  }
  const exportColumns = [
    { key: "code", header: "رقم الحساب" },
    { key: "name", header: "اسم الحساب" },
    { key: "type", header: "النوع" },
    { key: "debit", header: "مدين" },
    { key: "credit", header: "دائن" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildExportRows(), columns: exportColumns, fileName: datedFileName("ميزان-المراجعة"), sheetName: "ميزان المراجعة" });
  const exportPDF = () => exportToPDF({ rows: buildExportRows(), columns: exportColumns, fileName: datedFileName("ميزان-المراجعة"), header: { companyName, title: "ميزان المراجعة", subtitle: "Trial Balance" } });

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  return (
    <div>
      <div style={styles.toolbar}>
        <span style={styles.summaryText}>
          ميزان المراجعة · {activeAccounts.length} حساب متحرّك
        </span>
        {rows.length > 0 ? (
          <div style={styles.toolBtns}>
            <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
            <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
          </div>
        ) : null}
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {rows.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.muted}>لا توجد حسابات متحرّكة بعد. أنشئ قيودًا لتظهر في ميزان المراجعة.</p>
        </div>
      ) : (
        <div style={styles.panel}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>رقم الحساب</th>
                <th style={styles.th}>اسم الحساب</th>
                <th style={styles.thAmount}>مدين</th>
                <th style={styles.thAmount}>دائن</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.acc.id}>
                  <td style={styles.tdCode} dir="ltr">{r.acc.code}</td>
                  <td style={styles.tdName}>{r.acc.name}</td>
                  <td style={styles.tdAmount} dir="ltr">{r.debit ? r.debit.toLocaleString() : "—"}</td>
                  <td style={styles.tdAmount} dir="ltr">{r.credit ? r.credit.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={styles.totalRow}>
                <td style={styles.tdTotal} colSpan={2}>الإجمالي</td>
                <td style={styles.tdAmountTotal} dir="ltr">{totalDebit.toLocaleString()} ﷼</td>
                <td style={styles.tdAmountTotal} dir="ltr">{totalCredit.toLocaleString()} ﷼</td>
              </tr>
            </tfoot>
          </table>

          <div style={{ ...styles.balanceIndicator, ...(balanced ? styles.balancedOk : styles.balancedBad) }}>
            {balanced ? (
              <>✓ الميزان متوازن — مجموع المدين يساوي مجموع الدائن</>
            ) : (
              <>⚠ الميزان غير متوازن — فرق قدره {Math.abs(totalDebit - totalCredit).toLocaleString()} ﷼ (راجع القيود)</>
            )}
          </div>
        </div>
      )}

      <p style={styles.hint}>
        ميزان المراجعة يعرض أرصدة الحسابات المتحرّكة. توازن المجموعين دليل سلامة القيود المزدوجة.
      </p>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif", direction: "rtl" },
  pageHead: { marginBottom: 18 },
  pageTitle: { margin: 0, fontSize: 23, fontWeight: 700, color: "#059669", letterSpacing: "-.4px" },
  pageSub: { margin: "4px 0 0", fontSize: 13, color: "#5a6580" },

  tabs: { display: "flex", gap: 8, marginBottom: 20, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "12px 20px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "transparent", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: "-2px", display: "flex", alignItems: "center", gap: 8 },
  tabActive: { color: "#059669", borderBottomColor: "#059669" },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  summaryText: { fontSize: 14, color: "#15803d", fontWeight: 600 },
  count: { fontSize: 14, color: "#64748b", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },

  emptyState: { textAlign: "center", padding: "60px 24px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { margin: "0 0 12px", fontSize: 20, color: "#0f172a" },
  emptyDesc: { margin: "0 auto 24px", fontSize: 15, color: "#64748b", maxWidth: 480, lineHeight: 1.7 },
  seedBtn: { padding: "14px 28px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#059669", border: "none", borderRadius: 10, cursor: "pointer" },

  groups: { display: "flex", flexDirection: "column", gap: 20 },
  group: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  groupHead: { display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: "#f8fafc", borderRight: "4px solid", borderBottom: "1px solid #e2e8f0" },
  groupTitle: { fontSize: 16, fontWeight: 700 },
  groupRange: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  groupCount: { marginRight: "auto", fontSize: 13, color: "#64748b", background: "#e2e8f0", padding: "2px 10px", borderRadius: 12, fontWeight: 600 },

  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8 },
  th: { textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0" },
  thAmount: { textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "11px 12px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  tdCode: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#475569", fontFamily: "monospace", width: 80, borderBottom: "1px solid #f1f5f9" },
  tdName: { padding: "10px 12px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  tdSubtype: { padding: "10px 12px", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" },
  tdBalance: { padding: "10px 18px", fontSize: 14, color: "#0f172a", textAlign: "left", borderBottom: "1px solid #f1f5f9" },
  tdNum: { padding: "11px 12px", fontSize: 13, fontWeight: 700, color: "#16a34a", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" },
  tdAmount: { padding: "11px 12px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontWeight: 600 },
  sysTag: { marginRight: 8, fontSize: 10, color: "#16a34a", background: "#dcfce7", padding: "1px 7px", borderRadius: 8, fontWeight: 600 },
  sourceTag: { fontSize: 11, color: "#475569", background: "#f1f5f9", padding: "2px 8px", borderRadius: 8, fontWeight: 600 },
  viewBtn: { padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#16a34a", background: "#dcfce7", border: "none", borderRadius: 6, cursor: "pointer" },

  notice: { padding: 24, background: "#fffbeb", border: "1px solid #fcd97e", borderRadius: 12 },
  noticeText: { margin: 0, fontSize: 14, color: "#92400e" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 540, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  modalWide: { width: "100%", maxWidth: 680, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },
  typeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: 8 },
  typeOption: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "10px 8px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff", color: "#475569" },
  typeRange: { fontSize: 9, opacity: 0.7, fontFamily: "monospace" },

  linesHead: { display: "flex", gap: 8, padding: "0 4px 6px", alignItems: "center" },
  lhAccount: { flex: 3, fontSize: 12, fontWeight: 700, color: "#94a3b8" },
  lhAmount: { flex: 1, fontSize: 12, fontWeight: 700, color: "#94a3b8", textAlign: "center" },
  lhDel: { width: 32 },
  lineRow: { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" },
  lineAccount: { flex: 3, padding: "9px 10px", fontSize: 13, border: "1px solid #ccc", borderRadius: 8, background: "#fff", minWidth: 0 },
  lineAmount: { flex: 1, padding: "9px 8px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", textAlign: "center", minWidth: 0 },
  delBtn: { width: 32, height: 32, flexShrink: 0, fontSize: 14, color: "#dc2626", background: "#fee2e2", border: "none", borderRadius: 6, cursor: "pointer" },
  addLineBtn: { marginTop: 4, padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#16a34a", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },

  balanceBar: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 10, marginTop: 16, fontSize: 14, fontWeight: 600, flexWrap: "wrap" },
  balanceOk: { background: "#dcfce7", color: "#166534" },
  balanceBad: { background: "#fef3c7", color: "#92400e" },
  balanceStatus: { fontWeight: 700 },

  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },
  saveDisabled: { background: "#cbd5e1", cursor: "not-allowed" },

  detailMeta: { display: "flex", gap: 12, alignItems: "center", marginBottom: 12, fontSize: 14, color: "#64748b" },
  detailDesc: { margin: "0 0 16px", fontSize: 15, color: "#0f172a", padding: "10px 14px", background: "#f8fafc", borderRadius: 8 },
  detailTable: { width: "100%", borderCollapse: "collapse" },
  lineCode: { fontFamily: "monospace", fontWeight: 600, color: "#64748b", marginLeft: 6 },
  totalRow: { background: "#f8fafc" },
  tdTotal: { padding: "12px", fontSize: 14, fontWeight: 700, borderTop: "2px solid #e2e8f0" },
  tdAmountTotal: { padding: "12px", fontSize: 14, fontWeight: 700, textAlign: "left", borderTop: "2px solid #e2e8f0", color: "#16a34a" },

  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  balanceIndicator: { padding: "14px 18px", fontSize: 14, fontWeight: 600, textAlign: "center" },
  balancedOk: { background: "#dcfce7", color: "#166534" },
  balancedBad: { background: "#fef3c7", color: "#92400e" },
  hint: { marginTop: 16, padding: "12px 16px", background: "#f0fdf4", color: "#15803d", borderRadius: 8, fontSize: 13 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
};
