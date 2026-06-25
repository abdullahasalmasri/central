import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

const TYPE_LABELS = { housing: "سكن", vehicle: "مركبة", equipment: "معدة", other: "أخرى" };
const TYPE_ICONS = { housing: "🏠", vehicle: "🚐", equipment: "🔧", other: "📦" };
const TYPE_OPTIONS = [
  { id: "housing", label: "🏠 سكن" },
  { id: "vehicle", label: "🚐 مركبة" },
  { id: "equipment", label: "🔧 معدة" },
  { id: "other", label: "📦 أخرى" },
];
const EXPENSE_LABELS = { electricity: "كهرباء", water: "ماء", maintenance: "صيانة", fuel: "وقود", insurance: "تأمين", cleaning: "نظافة", other: "أخرى" };
const EXPENSE_OPTIONS = [
  { id: "electricity", label: "⚡ كهرباء" },
  { id: "water", label: "💧 ماء" },
  { id: "maintenance", label: "🔧 صيانة" },
  { id: "fuel", label: "⛽ وقود" },
  { id: "insurance", label: "🛡️ تأمين" },
  { id: "cleaning", label: "🧹 نظافة" },
  { id: "other", label: "📋 أخرى" },
];

const rNum = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString();
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export default function AssetsPage({ tenantId, companyName }) {
  const [assets, setAssets] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [modal, setModal] = useState(null); // { kind, asset }

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [aSnap, uSnap] = await Promise.all([
        getDocs(query(collection(db, "assets"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId))),
      ]);
      const aList = aSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      aList.sort((a, b) => (b.assetNumber || 0) - (a.assetNumber || 0));
      setAssets(aList);
      setWorkers(uSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.role === "worker"));
    } catch (e) {
      setError("تعذّر تحميل الأصول.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  const workerName = (uid) => {
    const w = workers.find((x) => x.id === uid);
    return w ? w.name : "—";
  };

  const visible = filter === "all" ? assets : assets.filter((a) => a.type === filter);
  const housing = assets.filter((a) => a.type === "housing").length;
  const vehicles = assets.filter((a) => a.type === "vehicle").length;

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  return (
    <div>
      <div style={styles.pageHead}>
        <h1 style={styles.pageTitle}>الأصول</h1>
        <button style={styles.addBtn} onClick={() => setModal({ kind: "add" })}>+ أصل جديد</button>
      </div>

      <div style={styles.infoBar}>
        🏘️ الأصول مرافق مشتركة (سكن/مركبات/معدات). تكلفة كل أصل (إيجار ثابت + فواتير) تُوزّع على مستفيديه فقط، وتدخل تكلفة العامل والربحية لاحقًا.
      </div>

      <div style={styles.statsRow}>
        <div style={styles.statCard}><span style={styles.statNum}>{assets.length}</span><span style={styles.statLbl}>إجمالي الأصول</span></div>
        <div style={styles.statCard}><span style={styles.statNum}>{housing}</span><span style={styles.statLbl}>سكن</span></div>
        <div style={styles.statCard}><span style={styles.statNum}>{vehicles}</span><span style={styles.statLbl}>مركبات</span></div>
      </div>

      <div style={styles.filterRow}>
        {[{ id: "all", label: "الكل" }, ...TYPE_OPTIONS].map((t) => (
          <button key={t.id} style={{ ...styles.filterBtn, ...(filter === t.id ? styles.filterActive : {}) }} onClick={() => setFilter(t.id)}>
            {t.label}{t.id === "all" ? ` (${assets.length})` : ""}
          </button>
        ))}
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {visible.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🏘️</div>
          <p style={styles.muted}>{assets.length === 0 ? "لا توجد أصول بعد. أضِف أول أصل." : "لا أصول من هذا النوع."}</p>
        </div>
      ) : (
        <div style={styles.grid}>
          {visible.map((a) => {
            const count = (a.beneficiaries || []).length;
            const cap = a.capacity || 0;
            const full = cap > 0 && count >= cap;
            return (
              <div key={a.id} style={{ ...styles.card, ...(a.status === "inactive" ? styles.cardInactive : {}) }}>
                <div style={styles.cardTop}>
                  <div style={styles.cardTitleRow}>
                    <span style={styles.cardIcon}>{TYPE_ICONS[a.type] || "📦"}</span>
                    <div>
                      <div style={styles.cardName}>{a.name}</div>
                      <div style={styles.cardMeta} dir="ltr">ASSET-{a.assetNumber}{a.location ? ` · ${a.location}` : ""}</div>
                    </div>
                  </div>
                  <span style={styles.typeTag}>{a.type === "other" ? (a.typeName || "أخرى") : TYPE_LABELS[a.type]}</span>
                </div>

                {a.status === "inactive" ? <div style={styles.inactiveTag}>معطّل</div> : null}

                <div style={styles.cardBody}>
                  <div style={styles.field}><span style={styles.fLabel}>الإيجار الشهري</span><span style={styles.fValue} dir="ltr">{rNum(a.monthlyRent)} ﷼</span></div>
                  <div style={styles.field}><span style={styles.fLabel}>السعة</span><span style={styles.fValue}>{cap > 0 ? cap : "—"}</span></div>
                  <div style={styles.field}>
                    <span style={styles.fLabel}>المستفيدون</span>
                    <span style={{ ...styles.fValue, color: full ? "#dc2626" : "#0f172a" }}>{count}{cap > 0 ? ` / ${cap}` : ""}</span>
                  </div>
                </div>

                {count > 0 ? (
                  <div style={styles.benefRow}>
                    {(a.beneficiaries || []).slice(0, 4).map((uid) => (
                      <span key={uid} style={styles.benefChip}>{workerName(uid)}</span>
                    ))}
                    {count > 4 ? <span style={styles.benefMore}>+{count - 4}</span> : null}
                  </div>
                ) : <div style={styles.noBenef}>لا مستفيدين بعد</div>}

                <div style={styles.cardActions}>
                  <button style={styles.actBtn} onClick={() => setModal({ kind: "expenses", asset: a })}>💰 المصاريف</button>
                  <button style={styles.actBtn} onClick={() => setModal({ kind: "beneficiaries", asset: a })}>👥 المستفيدون</button>
                  <button style={styles.actBtn} onClick={() => setModal({ kind: "edit", asset: a })}>✏️ تعديل</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (modal.kind === "add" || modal.kind === "edit") ? (
        <AssetModal tenantId={tenantId} asset={modal.kind === "edit" ? modal.asset : null} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />
      ) : null}
      {modal && modal.kind === "beneficiaries" ? (
        <BeneficiariesModal asset={modal.asset} workers={workers} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />
      ) : null}
      {modal && modal.kind === "expenses" ? (
        <ExpensesModal tenantId={tenantId} asset={modal.asset} onClose={() => setModal(null)} />
      ) : null}
    </div>
  );
}

// ═══ نافذة إضافة/تعديل أصل ═══
function AssetModal({ tenantId, asset, onClose, onSaved }) {
  const editing = !!asset;
  const [type, setType] = useState(asset ? asset.type : "housing");
  const [typeName, setTypeName] = useState(asset ? (asset.typeName || "") : "");
  const [name, setName] = useState(asset ? asset.name : "");
  const [location, setLocation] = useState(asset ? (asset.location || "") : "");
  const [capacity, setCapacity] = useState(asset ? String(asset.capacity || "") : "");
  const [monthlyRent, setMonthlyRent] = useState(asset ? String(asset.monthlyRent || "") : "");
  const [notes, setNotes] = useState(asset ? (asset.notes || "") : "");
  const [status, setStatus] = useState(asset ? asset.status : "active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setError("");
    if (name.trim().length < 2) { setError("اسم الأصل مطلوب."); return; }
    if (type === "other" && !typeName.trim()) { setError("حدّد اسم النوع المخصّص."); return; }
    setBusy(true);
    try {
      if (editing) {
        const fn = httpsCallable(functions, "updateAsset");
        await fn({ assetId: asset.id, type, typeName: typeName.trim(), name: name.trim(), location: location.trim(), capacity: Number(capacity) || 0, monthlyRent: Number(monthlyRent) || 0, notes: notes.trim(), status });
      } else {
        const fn = httpsCallable(functions, "createAsset");
        await fn({ type, typeName: typeName.trim(), name: name.trim(), location: location.trim(), capacity: Number(capacity) || 0, monthlyRent: Number(monthlyRent) || 0, notes: notes.trim() });
      }
      onSaved();
    } catch (e) {
      setError(e.message || "تعذّر الحفظ.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!window.confirm("حذف هذا الأصل وكل مصاريفه؟")) return;
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "deleteAsset");
      await fn({ assetId: asset.id });
      onSaved();
    } catch (e) {
      setError(e.message || "تعذّر الحذف.");
      setBusy(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{editing ? "تعديل أصل" : "أصل جديد"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <label style={styles.label}>النوع</label>
        <div style={styles.typeRow}>
          {TYPE_OPTIONS.map((t) => (
            <button key={t.id} style={{ ...styles.typeBtn, ...(type === t.id ? styles.typeBtnActive : {}) }} onClick={() => setType(t.id)}>{t.label}</button>
          ))}
        </div>

        {type === "other" ? (
          <>
            <label style={styles.label}>اسم النوع المخصّص</label>
            <input style={styles.input} value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="مثال: مستودع" />
          </>
        ) : null}

        <label style={styles.label}>الاسم</label>
        <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: سكن الدمام" />

        <div style={styles.row2}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الموقع/المدينة</label>
            <input style={styles.input} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="الدمام" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>السعة (عدد المستفيدين)</label>
            <input style={styles.input} type="number" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} dir="ltr" placeholder="0 = غير محدّدة" />
          </div>
        </div>

        <label style={styles.label}>الإيجار/القسط الشهري الثابت (﷼)</label>
        <input style={styles.input} type="number" min="0" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} dir="ltr" placeholder="0" />
        <span style={styles.hint}>الفواتير المتغيّرة (كهرباء/صيانة) تُسجّل لاحقًا من «المصاريف».</span>

        <label style={styles.label}>ملاحظات</label>
        <textarea style={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

        {editing ? (
          <>
            <label style={styles.label}>الحالة</label>
            <div style={styles.typeRow}>
              <button style={{ ...styles.typeBtn, ...(status === "active" ? styles.typeBtnActive : {}) }} onClick={() => setStatus("active")}>فعّال</button>
              <button style={{ ...styles.typeBtn, ...(status === "inactive" ? styles.typeBtnActive : {}) }} onClick={() => setStatus("inactive")}>معطّل</button>
            </div>
          </>
        ) : null}

        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={styles.modalActions}>
          {editing ? <button style={styles.deleteBtn} onClick={remove} disabled={busy}>حذف</button> : null}
          <div style={{ flex: 1 }} />
          <button style={styles.cancelBtn} onClick={onClose} disabled={busy}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={busy}>{busy ? "..." : editing ? "حفظ" : "إضافة"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══ نافذة تعيين المستفيدين ═══
function BeneficiariesModal({ asset, workers, onClose, onSaved }) {
  const [selected, setSelected] = useState(new Set(asset.beneficiaries || []));
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cap = asset.capacity || 0;
  function toggle(uid) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  const filtered = workers.filter((w) => (w.name || "").includes(search.trim()));

  async function save() {
    setError("");
    if (cap > 0 && selected.size > cap) { setError(`العدد (${selected.size}) يتجاوز السعة (${cap}).`); return; }
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "setAssetBeneficiaries");
      await fn({ assetId: asset.id, beneficiaries: [...selected] });
      onSaved();
    } catch (e) {
      setError(e.message || "تعذّر الحفظ.");
      setBusy(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>مستفيدو {asset.name}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.benefCount}>
          <span>المحدّدون: <strong style={{ color: cap > 0 && selected.size > cap ? "#dc2626" : "#0e7490" }}>{selected.size}</strong>{cap > 0 ? ` / ${cap}` : ""}</span>
        </div>

        <input style={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث عن عامل..." />

        <div style={styles.workerList}>
          {filtered.length === 0 ? (
            <p style={styles.muted}>{workers.length === 0 ? "لا يوجد عمّال مسجّلون." : "لا نتائج."}</p>
          ) : filtered.map((w) => (
            <label key={w.id} style={{ ...styles.workerItem, ...(selected.has(w.id) ? styles.workerItemSel : {}) }}>
              <input type="checkbox" checked={selected.has(w.id)} onChange={() => toggle(w.id)} />
              <span style={styles.workerNm}>{w.name}</span>
              {w.employeeNumber ? <span style={styles.workerNum} dir="ltr">{w.employeeNumber}</span> : null}
            </label>
          ))}
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={styles.modalActions}>
          <div style={{ flex: 1 }} />
          <button style={styles.cancelBtn} onClick={onClose} disabled={busy}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={busy}>{busy ? "..." : "حفظ المستفيدين"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══ نافذة مصاريف الأصل لشهر ═══
function ExpensesModal({ tenantId, asset, onClose }) {
  const [month, setMonth] = useState(currentMonth);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // نموذج إضافة
  const [expType, setExpType] = useState("electricity");
  const [expTypeName, setExpTypeName] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [expDate, setExpDate] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "assetExpenses"), where("tenantId", "==", tenantId), where("assetId", "==", asset.id), where("month", "==", month)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.expenseDate || "").localeCompare(b.expenseDate || ""));
      setExpenses(list);
    } catch (e) {
      setError("تعذّر تحميل المصاريف.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [month]);

  const variableTotal = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const rent = Number(asset.monthlyRent) || 0;
  const total = rent + variableTotal;
  const benefCount = (asset.beneficiaries || []).length;
  const sharePerWorker = benefCount > 0 ? total / benefCount : 0;

  async function add() {
    setError("");
    if (expType === "other" && !expTypeName.trim()) { setError("حدّد اسم نوع المصروف."); return; }
    if (!(Number(amount) > 0)) { setError("أدخل مبلغًا صحيحًا."); return; }
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "addAssetExpense");
      await fn({ assetId: asset.id, month, expenseType: expType, expenseTypeName: expTypeName.trim(), amount: Number(amount), description: desc.trim(), expenseDate: expDate.trim() });
      setAmount(""); setDesc(""); setExpDate(""); setExpTypeName("");
      await load();
    } catch (e) {
      setError(e.message || "تعذّر الإضافة.");
    } finally {
      setBusy(false);
    }
  }

  async function del(id) {
    if (!window.confirm("حذف هذا المصروف؟")) return;
    try {
      const fn = httpsCallable(functions, "deleteAssetExpense");
      await fn({ expenseId: id });
      await load();
    } catch (e) {
      setError(e.message || "تعذّر الحذف.");
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>مصاريف {asset.name}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.monthRow}>
          <label style={styles.label}>الشهر</label>
          <input style={{ ...styles.input, maxWidth: 200 }} type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" />
        </div>

        {/* ملخّص التكلفة */}
        <div style={styles.costSummary}>
          <div style={styles.costItem}><span style={styles.costLbl}>إيجار ثابت</span><span style={styles.costVal} dir="ltr">{rNum(rent)}</span></div>
          <div style={styles.costItem}><span style={styles.costLbl}>فواتير الشهر</span><span style={styles.costVal} dir="ltr">{rNum(variableTotal)}</span></div>
          <div style={styles.costItem}><span style={styles.costLbl}>إجمالي الشهر</span><span style={{ ...styles.costVal, color: "#0e7490", fontSize: 18 }} dir="ltr">{rNum(total)}</span></div>
          <div style={styles.costItem}><span style={styles.costLbl}>نصيب المستفيد ({benefCount})</span><span style={{ ...styles.costVal, color: "#16a34a" }} dir="ltr">{benefCount > 0 ? rNum(sharePerWorker) : "—"}</span></div>
        </div>
        {benefCount === 0 ? <div style={styles.warnRow}>⚠️ لا مستفيدين معيّنين — لن تُوزّع التكلفة. عيّنهم من «المستفيدون».</div> : null}

        {/* قائمة المصاريف */}
        {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : (
          expenses.length === 0 ? <p style={styles.muted}>لا فواتير مسجّلة لهذا الشهر.</p> : (
            <div style={styles.expList}>
              {expenses.map((e) => (
                <div key={e.id} style={styles.expItem}>
                  <div style={styles.expInfo}>
                    <span style={styles.expType}>{e.expenseType === "other" ? (e.expenseTypeName || "أخرى") : EXPENSE_LABELS[e.expenseType]}</span>
                    {e.description ? <span style={styles.expDesc}>{e.description}</span> : null}
                    {e.expenseDate ? <span style={styles.expDate} dir="ltr">{e.expenseDate}</span> : null}
                  </div>
                  <div style={styles.expRight}>
                    <span style={styles.expAmount} dir="ltr">{rNum(e.amount)} ﷼</span>
                    <button style={styles.delX} onClick={() => del(e.id)}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* إضافة مصروف */}
        <div style={styles.addExpBox}>
          <div style={styles.addExpTitle}>+ إضافة فاتورة</div>
          <div style={styles.expForm}>
            <select style={styles.expSelect} value={expType} onChange={(e) => setExpType(e.target.value)}>
              {EXPENSE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            {expType === "other" ? (
              <input style={styles.expField} value={expTypeName} onChange={(e) => setExpTypeName(e.target.value)} placeholder="اسم النوع" />
            ) : null}
            <input style={styles.expField} type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="المبلغ" dir="ltr" />
            <input style={styles.expField} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="وصف (اختياري)" />
            <input style={styles.expField} type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} dir="ltr" />
            <button style={styles.addExpBtn} onClick={add} disabled={busy}>{busy ? "..." : "إضافة"}</button>
          </div>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={styles.modalActions}>
          <div style={{ flex: 1 }} />
          <button style={styles.cancelBtn} onClick={onClose}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  pageHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 },
  pageTitle: { margin: 0, fontSize: 24, color: "#0e7490" },
  addBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#0e7490", border: "none", borderRadius: 8, cursor: "pointer" },

  infoBar: { padding: "12px 16px", background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 8, fontSize: 13, color: "#155e75", marginBottom: 20, lineHeight: 1.6 },

  statsRow: { display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: 140, padding: 18, borderRadius: 12, display: "flex", flexDirection: "column", gap: 6, background: "#fff", border: "1px solid #e2e8f0" },
  statNum: { fontSize: 28, fontWeight: 700, color: "#0e7490" },
  statLbl: { fontSize: 13, color: "#64748b" },

  filterRow: { display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" },
  filterBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  filterActive: { color: "#fff", background: "#0e7490" },

  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  muted: { color: "#94a3b8", fontSize: 14 },

  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 },
  cardInactive: { opacity: 0.65 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 12 },
  cardTitleRow: { display: "flex", gap: 10, alignItems: "center" },
  cardIcon: { fontSize: 28 },
  cardName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  cardMeta: { fontSize: 11, color: "#94a3b8", fontFamily: "monospace" },
  typeTag: { padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "#ecfeff", color: "#0e7490", whiteSpace: "nowrap" },
  inactiveTag: { display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: "#fee2e2", color: "#b91c1c", marginBottom: 10 },

  cardBody: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid #f1f5f9" },
  field: { display: "flex", flexDirection: "column", gap: 3 },
  fLabel: { fontSize: 11, color: "#94a3b8" },
  fValue: { fontSize: 14, fontWeight: 600, color: "#0f172a" },

  benefRow: { display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 },
  benefChip: { fontSize: 11, background: "#f1f5f9", color: "#475569", padding: "3px 8px", borderRadius: 6 },
  benefMore: { fontSize: 11, background: "#0e7490", color: "#fff", padding: "3px 8px", borderRadius: 6, fontWeight: 600 },
  noBenef: { fontSize: 12, color: "#cbd5e1", marginBottom: 12 },

  cardActions: { display: "flex", gap: 6, flexWrap: "wrap" },
  actBtn: { flex: 1, minWidth: 90, padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 520, background: "#fff", borderRadius: 12, padding: 24, direction: "rtl", textAlign: "right", maxHeight: "92vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 19, color: "#0e7490" },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },

  label: { display: "block", margin: "12px 0 6px", fontSize: 13, fontWeight: 600, color: "#334155" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" },
  hint: { display: "block", fontSize: 11, color: "#94a3b8", marginTop: 4 },
  row2: { display: "flex", gap: 12, flexWrap: "wrap" },
  typeRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  typeBtn: { padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "2px solid transparent", borderRadius: 8, cursor: "pointer" },
  typeBtnActive: { color: "#0e7490", background: "#ecfeff", borderColor: "#0e7490" },

  modalActions: { display: "flex", gap: 8, alignItems: "center", marginTop: 20 },
  saveBtn: { padding: "10px 22px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#0e7490", border: "none", borderRadius: 8, cursor: "pointer" },
  cancelBtn: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#e2e8f0", border: "none", borderRadius: 8, cursor: "pointer" },
  deleteBtn: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer" },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginTop: 12 },

  benefCount: { fontSize: 14, color: "#475569", marginBottom: 12, padding: "8px 12px", background: "#f8fafc", borderRadius: 8 },
  workerList: { maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginTop: 10 },
  workerItem: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, cursor: "pointer", border: "1px solid transparent" },
  workerItemSel: { background: "#ecfeff", borderColor: "#a5f3fc" },
  workerNm: { fontSize: 14, color: "#0f172a", flex: 1 },
  workerNum: { fontSize: 11, color: "#94a3b8", fontFamily: "monospace" },

  monthRow: { marginBottom: 14 },
  costSummary: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, padding: 14, background: "#f8fafc", borderRadius: 10, marginBottom: 12 },
  costItem: { display: "flex", flexDirection: "column", gap: 4 },
  costLbl: { fontSize: 11, color: "#64748b" },
  costVal: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  warnRow: { padding: "10px 12px", background: "#fffbeb", border: "1px solid #fcd97e", borderRadius: 8, fontSize: 13, color: "#92400e", marginBottom: 12 },

  expList: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 },
  expItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, gap: 10 },
  expInfo: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
  expType: { fontSize: 13, fontWeight: 600, color: "#0f172a" },
  expDesc: { fontSize: 12, color: "#64748b" },
  expDate: { fontSize: 11, color: "#94a3b8", fontFamily: "monospace" },
  expRight: { display: "flex", alignItems: "center", gap: 10 },
  expAmount: { fontSize: 14, fontWeight: 700, color: "#0e7490", whiteSpace: "nowrap" },
  delX: { background: "#fee2e2", border: "none", color: "#b91c1c", width: 26, height: 26, borderRadius: 6, cursor: "pointer", fontSize: 13 },

  addExpBox: { padding: 14, background: "#f8fafc", borderRadius: 10, marginBottom: 8 },
  addExpTitle: { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 },
  expForm: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  expSelect: { padding: "9px 10px", fontSize: 13, border: "1px solid #ccc", borderRadius: 7, background: "#fff" },
  expField: { flex: 1, minWidth: 110, padding: "9px 10px", fontSize: 13, border: "1px solid #ccc", borderRadius: 7, boxSizing: "border-box" },
  addExpBtn: { padding: "9px 18px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#0e7490", border: "none", borderRadius: 7, cursor: "pointer" },
};
