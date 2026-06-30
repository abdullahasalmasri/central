import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   الأصول والمرافق — واجهة موحّدة (٤ فئات)
   as_veh → مركبات · as_hous → إسكان · as_equ → معدّات · as_simple → بسيطة
   تشمل: الملكية (مملوك/مؤجّر) + حاسبة تمويل (ساما) + إهلاك + مشرف/مستفيد + مصاريف.
   ============================================================ */

const VIEW_TYPE = { as_veh: "vehicle", as_hous: "housing", as_equ: "equipment", as_simple: "simple" };
const TYPE_INFO = {
  vehicle: { label: "المركبات", singular: "مركبة", icon: "🚗", placeholder: "هايلكس ٢٠٢٣" },
  housing: { label: "الإسكان", singular: "سكن", icon: "🏠", placeholder: "سكن الدمام" },
  equipment: { label: "المعدّات", singular: "معدة", icon: "🔧", placeholder: "رافعة شوكية" },
  simple: { label: "الأصول البسيطة", singular: "أصل", icon: "📺", placeholder: "تلفاز / تكييف / سرير" },
};
const EXPENSE_TYPES = {
  electricity: "كهرباء", water: "ماء", maintenance: "صيانة",
  fuel: "وقود", insurance: "تأمين", cleaning: "نظافة", other: "أخرى",
};
const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const thisMonth = () => new Date().toISOString().slice(0, 7);

// حاسبة التمويل (نفس منطق الباكإند — للعرض الفوري)
function calcFinancing(itemValue, taxAmount, downPayment, financeMonths, apr) {
  const value = Number(itemValue) || 0, tax = Number(taxAmount) || 0, down = Number(downPayment) || 0;
  const n = Math.round(Number(financeMonths) || 0), rate = Number(apr) || 0;
  const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100;
  const totalWithTax = r2(value + tax);
  const financed = r2(Math.max(0, totalWithTax - down));
  let inst = 0, totalPay = 0, interest = 0;
  if (n > 0) {
    const r = rate / 100 / 12;
    inst = r > 0 ? financed * r / (1 - Math.pow(1 + r, -n)) : financed / n;
    inst = r2(inst); totalPay = r2(inst * n); interest = r2(totalPay - financed);
  }
  return { totalWithTax, financed, inst, totalPay, interest, grandTotal: r2(totalPay + down) };
}

export default function AssetsView({ view }) {
  const assetType = VIEW_TYPE[view] || "vehicle";
  const info = TYPE_INFO[assetType];

  const [tenantId, setTenantId] = useState("");
  const [assets, setAssets] = useState([]);
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
      const snap = await getDocs(query(collection(db, "assets"), where("tenantId", "==", tenantId)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.assetNumber || 0) - (a.assetNumber || 0));
      setAssets(list);
    } catch (err) {
      setError("تعذّر تحميل الأصول.");
    } finally {
      setLoading(false);
    }
  }

  const typeAssets = assets.filter((a) => a.type === assetType);
  const ownedCount = typeAssets.filter((a) => a.ownership === "owned").length;
  const rentedCount = typeAssets.filter((a) => a.ownership !== "owned").length;

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>{info.icon} {info.label}</h1>
          <p style={styles.pageSub}>إدارة {info.label}: الملكية، التمويل، الإهلاك، المصاريف.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setModal("new")}>+ {info.singular} {assetType === "simple" ? "بسيط" : "جديد"}</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : (
        <>
          {typeAssets.length > 0 ? (
            <div style={styles.summaryCards}>
              <div style={styles.sumCard}><span style={styles.sumLabel}>العدد</span><span style={styles.sumValue}>{typeAssets.length}</span></div>
              <div style={styles.sumCard}><span style={styles.sumLabel}>مملوكة</span><span style={{ ...styles.sumValue, color: "#0e7490" }}>{ownedCount}</span></div>
              <div style={styles.sumCard}><span style={styles.sumLabel}>مؤجّرة</span><span style={{ ...styles.sumValue, color: "#c2410c" }}>{rentedCount}</span></div>
            </div>
          ) : null}

          {typeAssets.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>{info.icon}</div>
              <p style={styles.emptyTitle}>لا توجد {info.label}</p>
              <p style={styles.muted}>اضغط الزر لإضافة أول {info.singular}.</p>
            </div>
          ) : (
            <div style={styles.cardsGrid}>
              {typeAssets.map((a) => <AssetCard key={a.id} a={a} info={info} onEdit={() => setModal({ edit: a })} onExpenses={() => setModal({ expenses: a })} onReload={loadData} />)}
            </div>
          )}
        </>
      )}

      {modal === "new" ? <AssetModal assetType={assetType} info={info} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.edit ? <AssetModal assetType={assetType} info={info} asset={modal.edit} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} /> : null}
      {modal && modal.expenses ? <ExpensesModal asset={modal.expenses} tenantId={tenantId} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function AssetCard({ a, info, onEdit, onExpenses, onReload }) {
  const isOwned = a.ownership === "owned";
  const isFinanced = isOwned && a.paymentMethod === "financed";
  return (
    <div style={styles.assetCard}>
      <div style={styles.cardTop}>
        <div style={styles.cardInfo}>
          <span style={styles.assetIcon}>{info.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={styles.nameRow}>
              {a.assetNumber ? <span style={styles.codeTag}>#{a.assetNumber}</span> : null}
              <span style={styles.assetName}>{a.name}</span>
            </div>
            <div style={styles.tagRow}>
              <span style={{ ...styles.ownTag, background: isOwned ? "#cffafe" : "#ffedd5", color: isOwned ? "#0e7490" : "#c2410c" }}>
                {isOwned ? "🏷️ مملوك" : "🔑 مؤجّر"}
              </span>
              {isOwned ? <span style={styles.payTag}>{isFinanced ? "أقساط" : "كاش"}</span> : null}
              <span style={{ ...styles.statusTag, background: a.status === "active" ? "#dcfce7" : "#f1f5f9", color: a.status === "active" ? "#166534" : "#94a3b8" }}>
                {a.status === "active" ? "فعّال" : "معطّل"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {a.location ? <div style={styles.locRow}>📍 {a.location}</div> : null}

      <div style={styles.cardBody}>
        {!isOwned ? (
          <div style={styles.bodyItem}><span style={styles.bodyLabel}>الإيجار الشهري</span><span style={styles.bodyVal} dir="ltr">{fmt(a.monthlyRent)} ﷼</span></div>
        ) : isFinanced ? (
          <>
            <div style={styles.bodyItem}><span style={styles.bodyLabel}>القسط الشهري</span><span style={{ ...styles.bodyVal, color: "#c2410c" }} dir="ltr">{fmt(a.monthlyInstallment)} ﷼</span></div>
            <div style={styles.bodyItem}><span style={styles.bodyLabel}>قيمة السلعة</span><span style={styles.bodyVal} dir="ltr">{fmt(a.itemValue)}</span></div>
          </>
        ) : (
          <div style={styles.bodyItem}><span style={styles.bodyLabel}>قيمة الشراء</span><span style={styles.bodyVal} dir="ltr">{fmt(a.itemValue)} ﷼</span></div>
        )}
        {isOwned && a.usefulLifeYears > 0 ? <div style={styles.bodyItem}><span style={styles.bodyLabel}>العمر</span><span style={styles.bodyVal}>{a.usefulLifeYears} سنة</span></div> : null}
        {a.capacity > 0 ? <div style={styles.bodyItem}><span style={styles.bodyLabel}>السعة</span><span style={styles.bodyVal}>{a.capacity}</span></div> : null}
      </div>

      {(a.supervisorName || a.custodianName) ? (
        <div style={styles.peopleRow}>
          {a.supervisorName ? <span style={styles.personChip}>👔 مشرف: {a.supervisorName}</span> : null}
          {a.custodianName ? <span style={styles.personChip}>🙋 عهدة: {a.custodianName}</span> : null}
        </div>
      ) : null}

      <div style={styles.cardActions}>
        <button style={styles.actBtn} onClick={onExpenses}>💰 المصاريف</button>
        <button style={styles.actBtn} onClick={onEdit}>✏️ تعديل</button>
        <DeleteBtn assetId={a.id} name={a.name} onDone={onReload} />
      </div>
    </div>
  );
}

function DeleteBtn({ assetId, name, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`حذف «${name}»؟ سيُحذف نهائيًا.`)) return;
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "deleteAsset");
      await fn({ assetId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.delBtn} onClick={del} disabled={busy}>{busy ? "..." : "🗑"}</button>;
}

// ═══════════ مودال الأصل ═══════════
function AssetModal({ assetType, info, asset, onClose, onSaved }) {
  const isEdit = !!asset;
  const a = asset || {};
  const [f, setF] = useState({
    name: a.name || "", location: a.location || "",
    capacity: a.capacity != null ? String(a.capacity) : "",
    status: a.status || "active",
    supervisorName: a.supervisorName || "", custodianName: a.custodianName || "",
    notes: a.notes || "",
    ownership: a.ownership || "rented",
    monthlyRent: a.monthlyRent != null ? String(a.monthlyRent) : "",
    paymentMethod: a.paymentMethod || "cash",
    itemValue: a.itemValue ? String(a.itemValue) : "",
    taxAmount: a.taxAmount ? String(a.taxAmount) : "",
    downPayment: a.downPayment ? String(a.downPayment) : "",
    financeMonths: a.financeMonths ? String(a.financeMonths) : "",
    apr: a.apr ? String(a.apr) : "",
    usefulLifeYears: a.usefulLifeYears ? String(a.usefulLifeYears) : "",
    salvageValue: a.salvageValue ? String(a.salvageValue) : "",
    purchaseDate: a.purchaseDate || "",
  });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const isOwned = f.ownership === "owned";
  const isFinanced = isOwned && f.paymentMethod === "financed";
  const fin = isFinanced ? calcFinancing(f.itemValue, f.taxAmount, f.downPayment, f.financeMonths, f.apr) : null;
  // اقتراح ضريبة 15%
  function autoTax() {
    const v = Number(f.itemValue) || 0;
    set("taxAmount", String(Math.round(v * 0.15 * 100) / 100));
  }

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr(`اسم ${info.singular} مطلوب.`); return; }
    if (!isOwned && (f.monthlyRent === "" || Number(f.monthlyRent) < 0)) { setErr("أدخل الإيجار الشهري."); return; }
    if (isOwned && (Number(f.itemValue) || 0) <= 0) { setErr("أدخل قيمة السلعة."); return; }
    setSaving(true);
    try {
      const payload = {
        type: assetType, name: f.name.trim(), location: f.location.trim(),
        capacity: Number(f.capacity) || 0,
        supervisorName: f.supervisorName.trim(), custodianName: f.custodianName.trim(),
        notes: f.notes.trim(),
        ownership: f.ownership,
        monthlyRent: Number(f.monthlyRent) || 0,
        paymentMethod: f.paymentMethod,
        itemValue: Number(f.itemValue) || 0, taxAmount: Number(f.taxAmount) || 0,
        downPayment: Number(f.downPayment) || 0, financeMonths: Number(f.financeMonths) || 0,
        apr: Number(f.apr) || 0,
        usefulLifeYears: Number(f.usefulLifeYears) || 0, salvageValue: Number(f.salvageValue) || 0,
        purchaseDate: f.purchaseDate,
      };
      if (isEdit) {
        const fn = httpsCallable(functions, "updateAsset");
        await fn({ assetId: asset.id, ...payload, status: f.status });
      } else {
        const fn = httpsCallable(functions, "createAsset");
        await fn(payload);
      }
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
          <h2 style={styles.modalTitle}>{isEdit ? "تعديل" : "إضافة"} {info.singular}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {err ? <div style={styles.error}>{err}</div> : null}

        <Field label={`اسم ${info.singular} *`}><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} placeholder={info.placeholder} /></Field>
        <div style={styles.row}>
          <div style={{ flex: 2 }}><Field label="الموقع / المدينة"><input style={styles.input} value={f.location} onChange={(e) => set("location", e.target.value)} disabled={saving} /></Field></div>
          <div style={{ flex: 1 }}><Field label="السعة"><input style={styles.input} type="number" min="0" value={f.capacity} onChange={(e) => set("capacity", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        </div>

        {/* الأشخاص */}
        <div style={styles.row}>
          <div style={{ flex: 1 }}><Field label="👔 المشرف المسؤول"><input style={styles.input} value={f.supervisorName} onChange={(e) => set("supervisorName", e.target.value)} disabled={saving} /></Field></div>
          <div style={{ flex: 1 }}><Field label="🙋 المستفيد (العهدة)"><input style={styles.input} value={f.custodianName} onChange={(e) => set("custodianName", e.target.value)} disabled={saving} /></Field></div>
        </div>

        {/* الملكية */}
        <div style={styles.ownerSection}>
          <div style={styles.segLabel}>نوع الملكية</div>
          <div style={styles.segment}>
            <button style={{ ...styles.segBtn, ...(!isOwned ? styles.segActive : {}) }} onClick={() => set("ownership", "rented")} disabled={saving}>🔑 مؤجّر</button>
            <button style={{ ...styles.segBtn, ...(isOwned ? styles.segActive : {}) }} onClick={() => set("ownership", "owned")} disabled={saving}>🏷️ مملوك</button>
          </div>
        </div>

        {!isOwned ? (
          <Field label="الإيجار الشهري *"><input style={styles.input} type="number" min="0" value={f.monthlyRent} onChange={(e) => set("monthlyRent", e.target.value)} disabled={saving} dir="ltr" /></Field>
        ) : (
          <>
            {/* طريقة السداد */}
            <div style={styles.segment}>
              <button style={{ ...styles.segBtn, ...(!isFinanced ? styles.segActive : {}) }} onClick={() => set("paymentMethod", "cash")} disabled={saving}>💵 كاش</button>
              <button style={{ ...styles.segBtn, ...(isFinanced ? styles.segActive : {}) }} onClick={() => set("paymentMethod", "financed")} disabled={saving}>🏦 أقساط تمويلية</button>
            </div>

            <div style={styles.row}>
              <div style={{ flex: 1 }}><Field label="قيمة السلعة *"><input style={styles.input} type="number" min="0" value={f.itemValue} onChange={(e) => set("itemValue", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
              <div style={{ flex: 1 }}>
                <Field label="الضريبة (15%)">
                  <div style={styles.taxWrap}>
                    <input style={styles.taxInput} type="number" min="0" value={f.taxAmount} onChange={(e) => set("taxAmount", e.target.value)} disabled={saving} dir="ltr" />
                    <button style={styles.taxBtn} onClick={autoTax} disabled={saving} type="button">احسب</button>
                  </div>
                </Field>
              </div>
            </div>

            {isFinanced ? (
              <>
                <div style={styles.row}>
                  <div style={{ flex: 1 }}><Field label="الدفعة المقدمة"><input style={styles.input} type="number" min="0" value={f.downPayment} onChange={(e) => set("downPayment", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
                  <div style={{ flex: 1 }}><Field label="عدد الأشهر"><input style={styles.input} type="number" min="1" value={f.financeMonths} onChange={(e) => set("financeMonths", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
                  <div style={{ flex: 1 }}><Field label="APR %"><input style={styles.input} type="number" min="0" step="0.01" value={f.apr} onChange={(e) => set("apr", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
                </div>

                {/* حاسبة التمويل */}
                {fin && Number(f.financeMonths) > 0 ? (
                  <div style={styles.calcBox}>
                    <div style={styles.calcTitle}>📊 تفاصيل التمويل</div>
                    <div style={styles.calcGrid}>
                      <div style={styles.calcItem}><span>إجمالي بعد الضريبة</span><span dir="ltr">{fmt(fin.totalWithTax)}</span></div>
                      <div style={styles.calcItem}><span>المبلغ المموَّل</span><span dir="ltr">{fmt(fin.financed)}</span></div>
                      <div style={styles.calcItem}><span>إجمالي الفوائد</span><span dir="ltr" style={{ color: "#c2410c" }}>{fmt(fin.interest)}</span></div>
                      <div style={styles.calcItem}><span>الإجمالي المدفوع</span><span dir="ltr">{fmt(fin.grandTotal)}</span></div>
                    </div>
                    <div style={styles.calcInstallment}>
                      <span>القسط الشهري</span>
                      <span dir="ltr">{fmt(fin.inst)} ﷼</span>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div style={styles.cashTotal}>
                <span>الإجمالي (مع الضريبة)</span>
                <span dir="ltr">{fmt((Number(f.itemValue) || 0) + (Number(f.taxAmount) || 0))} ﷼</span>
              </div>
            )}

            {/* الإهلاك */}
            <div style={styles.depSection}>
              <div style={styles.depTitle}>📉 الإهلاك (على قيمة السلعة الأصلية)</div>
              <div style={styles.row}>
                <div style={{ flex: 1 }}><Field label="العمر الإنتاجي (سنوات)"><input style={styles.input} type="number" min="0" value={f.usefulLifeYears} onChange={(e) => set("usefulLifeYears", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
                <div style={{ flex: 1 }}><Field label="القيمة المتبقية"><input style={styles.input} type="number" min="0" value={f.salvageValue} onChange={(e) => set("salvageValue", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
                <div style={{ flex: 1 }}><Field label="تاريخ الشراء"><input style={styles.input} type="date" value={f.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
              </div>
              {Number(f.itemValue) > 0 && Number(f.usefulLifeYears) > 0 ? (
                <div style={styles.depHint}>الإهلاك السنوي ≈ <strong dir="ltr">{fmt(((Number(f.itemValue) || 0) - (Number(f.salvageValue) || 0)) / Number(f.usefulLifeYears))}</strong> ﷼/سنة</div>
              ) : null}
            </div>
          </>
        )}

        {isEdit ? (
          <Field label="الحالة">
            <select style={styles.input} value={f.status} onChange={(e) => set("status", e.target.value)} disabled={saving}>
              <option value="active">فعّال</option><option value="inactive">معطّل</option>
            </select>
          </Field>
        ) : null}
        <Field label="ملاحظات"><textarea style={styles.textarea} value={f.notes} onChange={(e) => set("notes", e.target.value)} disabled={saving} rows={2} /></Field>

        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : isEdit ? "حفظ" : "إضافة"}</button>
        </div>
      </div>
    </div>
  );
}

// ═══════════ مودال المصاريف ═══════════
function ExpensesModal({ asset, tenantId, onClose }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(thisMonth());
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => { loadExpenses(); /* eslint-disable-next-line */ }, []);

  async function loadExpenses() {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "assetExpenses"), where("tenantId", "==", tenantId), where("assetId", "==", asset.id)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.month || "").localeCompare(a.month || ""));
      setExpenses(list);
    } catch (e) { /* ignore */ } finally { setLoading(false); }
  }

  const monthExpenses = expenses.filter((e) => e.month === month);
  const monthTotal = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const base = asset.ownership === "owned" && asset.paymentMethod === "financed" ? (Number(asset.monthlyInstallment) || 0) : (Number(asset.monthlyRent) || 0);
  const baseLabel = asset.ownership === "owned" ? (asset.paymentMethod === "financed" ? "القسط الشهري" : "—") : "الإيجار الثابت";

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>💰 مصاريف {asset.name}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.monthRow}>
          <label style={styles.label}>الشهر:</label>
          <input style={styles.monthInput} type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr" />
          <button style={styles.addExpBtn} onClick={() => setShowAdd(true)}>+ مصروف</button>
        </div>

        <div style={styles.costBox}>
          {base > 0 ? <div style={styles.costItem}><span>{baseLabel}</span><span dir="ltr">{fmt(base)}</span></div> : null}
          <div style={styles.costItem}><span>المصاريف المتغيّرة</span><span dir="ltr">{fmt(monthTotal)}</span></div>
          <div style={styles.costTotal}><span>تكلفة الشهر</span><span dir="ltr">{fmt(base + monthTotal)} ﷼</span></div>
        </div>

        {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : monthExpenses.length === 0 ? (
          <p style={styles.muted}>لا توجد مصاريف لهذا الشهر.</p>
        ) : (
          <div style={styles.expList}>
            {monthExpenses.map((e) => (
              <div key={e.id} style={styles.expItem}>
                <div><span style={styles.expType}>{EXPENSE_TYPES[e.expenseType] || e.expenseTypeName || "مصروف"}</span>{e.description ? <span style={styles.expDesc}> · {e.description}</span> : null}</div>
                <div style={styles.expRight}><span style={styles.expAmount} dir="ltr">{fmt(e.amount)}</span><ExpDelBtn expenseId={e.id} onDone={loadExpenses} /></div>
              </div>
            ))}
          </div>
        )}

        {showAdd ? <AddExpenseForm assetId={asset.id} month={month} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); loadExpenses(); }} /> : null}

        <div style={styles.modalActions}><button style={styles.cancelBtn} onClick={onClose}>إغلاق</button></div>
      </div>
    </div>
  );
}

function ExpDelBtn({ expenseId, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm("حذف هذا المصروف؟")) return;
    setBusy(true);
    try {
      const fn = httpsCallable(functions, "deleteAssetExpense");
      await fn({ expenseId });
      onDone();
    } catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.expDel} onClick={del} disabled={busy}>{busy ? "..." : "✕"}</button>;
}

function AddExpenseForm({ assetId, month, onClose, onSaved }) {
  const [f, setF] = useState({ expenseType: "electricity", expenseTypeName: "", amount: "", description: "" });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (!(Number(f.amount) > 0)) { setErr("أدخل مبلغًا صحيحًا."); return; }
    if (f.expenseType === "other" && !f.expenseTypeName.trim()) { setErr("حدّد اسم النوع."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "addAssetExpense");
      await fn({ assetId, month, expenseType: f.expenseType, expenseTypeName: f.expenseTypeName.trim(), amount: Number(f.amount), description: f.description.trim(), expenseDate: "" });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); } finally { setSaving(false); }
  }

  return (
    <div style={styles.addForm}>
      <div style={styles.addFormTitle}>مصروف جديد — {month}</div>
      {err ? <div style={styles.error}>{err}</div> : null}
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="النوع">
          <select style={styles.input} value={f.expenseType} onChange={(e) => set("expenseType", e.target.value)} disabled={saving}>
            {Object.entries(EXPENSE_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field></div>
        <div style={{ flex: 1 }}><Field label="المبلغ *"><input style={styles.input} type="number" min="0" value={f.amount} onChange={(e) => set("amount", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>
      {f.expenseType === "other" ? <Field label="اسم النوع *"><input style={styles.input} value={f.expenseTypeName} onChange={(e) => set("expenseTypeName", e.target.value)} disabled={saving} /></Field> : null}
      <Field label="الوصف"><input style={styles.input} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} /></Field>
      <div style={styles.addFormActions}>
        <button style={styles.cancelBtnSm} onClick={onClose} disabled={saving}>إلغاء</button>
        <button style={styles.saveBtnSm} onClick={save} disabled={saving}>{saving ? "..." : "إضافة"}</button>
      </div>
    </div>
  );
}

function Field({ label, children }) { return <div style={styles.field}><label style={styles.label}>{label}</label>{children}</div>; }

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#0e7490", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#0e7490", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  summaryCards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 },
  sumCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 6 },
  sumLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },
  sumValue: { fontSize: 22, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  empty: { padding: 48, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },

  cardsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 },
  assetCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px" },
  cardTop: { marginBottom: 10 },
  cardInfo: { display: "flex", alignItems: "flex-start", gap: 12 },
  assetIcon: { fontSize: 28 },
  nameRow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 },
  codeTag: { display: "inline-block", padding: "1px 8px", background: "#cffafe", color: "#0e7490", borderRadius: 6, fontSize: 12, fontWeight: 700, fontFamily: "monospace" },
  assetName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  tagRow: { display: "flex", gap: 6, flexWrap: "wrap" },
  ownTag: { padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700 },
  payTag: { padding: "2px 10px", background: "#f1f5f9", color: "#475569", borderRadius: 10, fontSize: 11, fontWeight: 700 },
  statusTag: { padding: "2px 10px", borderRadius: 10, fontSize: 11, fontWeight: 700 },
  locRow: { fontSize: 13, color: "#64748b", marginBottom: 12 },

  cardBody: { display: "flex", gap: 18, flexWrap: "wrap", padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", marginBottom: 12 },
  bodyItem: { display: "flex", flexDirection: "column", gap: 4 },
  bodyLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 600 },
  bodyVal: { fontSize: 15, fontWeight: 700, color: "#334155", fontFamily: "monospace" },

  peopleRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  personChip: { fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "4px 10px" },

  cardActions: { display: "flex", gap: 8 },
  actBtn: { flex: 1, padding: "8px 10px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer", whiteSpace: "nowrap" },
  delBtn: { padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 7, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "94vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalWide: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },

  ownerSection: { marginBottom: 12 },
  segLabel: { fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 },
  segment: { display: "flex", gap: 8, marginBottom: 12 },
  segBtn: { flex: 1, padding: "10px", fontSize: 13, fontWeight: 700, color: "#64748b", background: "#f1f5f9", border: "2px solid transparent", borderRadius: 8, cursor: "pointer" },
  segActive: { background: "#ecfeff", color: "#0e7490", borderColor: "#0e7490" },

  taxWrap: { display: "flex", gap: 6 },
  taxInput: { flex: 1, padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", minWidth: 0 },
  taxBtn: { padding: "0 12px", fontSize: 12, fontWeight: 700, color: "#0e7490", background: "#ecfeff", border: "1px solid #0e7490", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  calcBox: { background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 12, padding: "14px 16px", marginBottom: 12 },
  calcTitle: { fontSize: 13, fontWeight: 700, color: "#0e7490", marginBottom: 10 },
  calcGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 },
  calcItem: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", fontFamily: "monospace" },
  calcInstallment: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#0e7490", borderRadius: 8, fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "monospace" },

  cashTotal: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#ecfeff", border: "1px solid #a5f3fc", borderRadius: 10, fontSize: 15, fontWeight: 800, color: "#0e7490", fontFamily: "monospace", marginBottom: 12 },

  depSection: { background: "#fafafa", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", marginBottom: 12 },
  depTitle: { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 12 },
  depHint: { fontSize: 12, color: "#0e7490", marginTop: 4, background: "#ecfeff", padding: "8px 12px", borderRadius: 8 },

  monthRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" },
  monthInput: { padding: "8px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit" },
  addExpBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#0e7490", border: "none", borderRadius: 8, cursor: "pointer", marginRight: "auto" },

  costBox: { background: "#f8fafc", borderRadius: 10, padding: "14px 18px", marginBottom: 16 },
  costItem: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", padding: "4px 0", fontFamily: "monospace" },
  costTotal: { display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 800, color: "#0e7490", padding: "8px 0 0", marginTop: 4, borderTop: "1px solid #e2e8f0", fontFamily: "monospace" },

  expList: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 },
  expItem: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8 },
  expType: { fontSize: 14, fontWeight: 600, color: "#334155" },
  expDesc: { fontSize: 13, color: "#94a3b8" },
  expRight: { display: "flex", alignItems: "center", gap: 12 },
  expAmount: { fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" },
  expDel: { fontSize: 13, color: "#cbd5e1", background: "none", border: "none", cursor: "pointer" },

  addForm: { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 12 },
  addFormTitle: { fontSize: 14, fontWeight: 700, color: "#0f172a", marginBottom: 12 },
  addFormActions: { display: "flex", gap: 8, marginTop: 6 },
  cancelBtnSm: { flex: 1, padding: "8px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#e2e8f0", border: "none", borderRadius: 7, cursor: "pointer" },
  saveBtnSm: { flex: 1, padding: "8px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#0e7490", border: "none", borderRadius: 7, cursor: "pointer" },

  modalActions: { display: "flex", gap: 10, marginTop: 18 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#0e7490", border: "none", borderRadius: 8, cursor: "pointer" },
};
