import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   عرض السعر المفصّل — قسم المبيعات (المرحلة ١ من دورة العقود)
   المبيعات تختار (جنس + جنسية + مهنة) → يظهر التسعير المرجعي،
   ثم تكتب القيم المعروضة (تكلفة + سكن + مواصلات + ربح + عدد).
   عرض العميل مبسّط + ملاحظات السكن/المواصلات تلقائية.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US");
const VAT_RATE = 15;

const STATUS_INFO = {
  draft: { label: "مسودة", color: "#64748b", bg: "#f1f5f9" },
  pending_finance: { label: "بانتظار المالية", color: "#ca8a04", bg: "#fef9c3" },
  rejected_finance: { label: "رفضتها المالية", color: "#dc2626", bg: "#fee2e2" },
  approved_finance: { label: "معتمد من المالية", color: "#16a34a", bg: "#dcfce7" },
  sent_client: { label: "مرسل للعميل", color: "#2563eb", bg: "#dbeafe" },
  rejected_client: { label: "رفضه العميل", color: "#dc2626", bg: "#fee2e2" },
  accepted: { label: "مقبول", color: "#059669", bg: "#d1fae5" },
};

function fmtDateTime(millis) {
  if (!millis) return "—";
  try {
    const d = new Date(millis);
    return d.toLocaleDateString("ar-SA") + " " + d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" });
  } catch (e) { return "—"; }
}

export default function PriceQuotesView() {
  const [tenantId, setTenantId] = useState("");
  const [quotes, setQuotes] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [nationalities, setNationalities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة."); setLoading(false); return; }
        setTenantId(tid);
      } catch (e) { setError("تعذّر تحميل بيانات المستخدم."); setLoading(false); }
    })();
  }, []);

  useEffect(() => { if (tenantId) loadData(); /* eslint-disable-next-line */ }, [tenantId]);

  async function loadData() {
    setLoading(true); setError("");
    try {
      const [qRes, optRes, custSnap] = await Promise.all([
        httpsCallable(functions, "getPriceQuotes")({}),
        httpsCallable(functions, "getWorkforceOptions")({}).catch(() => ({ data: { jobTitles: [], nationalities: [] } })),
        getDocs(query(collection(db, "customers"), where("tenantId", "==", tenantId))),
      ]);
      setQuotes((qRes.data && qRes.data.quotes) || []);
      setJobTitles((optRes.data && optRes.data.jobTitles) || []);
      setNationalities((optRes.data && optRes.data.nationalities) || []);
      setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
    } finally { setLoading(false); }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>عروض الأسعار</h1>
          <p style={styles.pageSub}>إنشاء عرض سعر مفصّل بالتسعير المرجعي، وإرساله للمالية للاعتماد.</p>
        </div>
        <button style={styles.newBtn} onClick={() => setShowForm(true)}>+ عرض سعر جديد</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : (
        <>
          {quotes.length === 0 ? (
            <div style={styles.emptyBox}>لا توجد عروض أسعار. أنشئ عرضًا جديدًا.</div>
          ) : (
            <div style={styles.tableCard}>
              <div style={styles.tableHead}>
                <span>الرقم</span>
                <span>العميل</span>
                <span style={styles.thNum}>الإجمالي</span>
                <span style={styles.thCenter}>الحالة</span>
                <span style={styles.thCenter}>التاريخ</span>
              </div>
              {quotes.map((q) => {
                const st = STATUS_INFO[q.status] || STATUS_INFO.draft;
                const createdMs = q.createdAt && q.createdAt._seconds ? q.createdAt._seconds * 1000 : null;
                return (
                  <div key={q.id} style={styles.tableRow}>
                    <span style={styles.tdNum}>#{q.quoteNumber}</span>
                    <span style={styles.tdName}>{q.customerName || "—"}</span>
                    <span style={styles.tdMoney} dir="ltr">{fmt(q.total)} ر.س</span>
                    <span style={styles.thCenter}><span style={{ ...styles.badge, color: st.color, background: st.bg }}>{st.label}</span></span>
                    <span style={styles.tdDate}>{fmtDateTime(createdMs)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {showForm ? (
        <QuoteForm
          customers={customers}
          jobTitles={jobTitles}
          nationalities={nationalities}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      ) : null}
    </div>
  );
}

/* ===== نموذج عرض السعر ===== */
function emptyLaborItem() {
  return {
    gender: "", nationality: "", jobTitle: "",
    refCost: null, refHousing: null, refTransport: null, refCount: null, refLoading: false,
    offeredCost: "", offeredHousing: "", offeredTransport: "", profit: "", count: "",
  };
}

function emptyEquipmentItem() {
  return { type: "", model: "", manufacturer: "", size: "", count: "", offeredPrice: "", profit: "" };
}

function genderLabel(g) { return g === "male" ? "ذكر" : g === "female" ? "أنثى" : "—"; }

function QuoteForm({ customers, jobTitles, nationalities, onClose, onSaved }) {
  const [customerId, setCustomerId] = useState("");
  const [laborItems, setLaborItems] = useState([emptyLaborItem()]);
  const [equipmentItems, setEquipmentItems] = useState([]);
  const [showClientPreview, setShowClientPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // جلب التسعير المرجعي لبند عند اكتمال (جنس + جنسية + مهنة)
  async function fetchRef(idx) {
    const it = laborItems[idx];
    if (!it.gender || !it.nationality || !it.jobTitle) return;
    setLaborItems((arr) => arr.map((x, i) => i === idx ? { ...x, refLoading: true } : x));
    try {
      const res = await httpsCallable(functions, "getReferenceCost")({
        gender: it.gender, nationality: it.nationality, jobTitle: it.jobTitle,
        includeHousing: true, includeTransport: true,
      });
      const d = res.data || {};
      setLaborItems((arr) => arr.map((x, i) => i === idx ? {
        ...x, refLoading: false,
        refCost: d.avgBaseCost, refHousing: d.avgHousingShare, refTransport: d.avgTransportShare, refCount: d.count,
      } : x));
    } catch (e) {
      setLaborItems((arr) => arr.map((x, i) => i === idx ? { ...x, refLoading: false, refCost: null, refCount: 0 } : x));
    }
  }

  function setLabor(idx, key, val) {
    setLaborItems((arr) => arr.map((x, i) => i === idx ? { ...x, [key]: val } : x));
  }
  function addLabor() { setLaborItems((arr) => [...arr, emptyLaborItem()]); }
  function removeLabor(idx) { setLaborItems((arr) => arr.length > 1 ? arr.filter((_, i) => i !== idx) : arr); }

  function setEquip(idx, key, val) { setEquipmentItems((arr) => arr.map((x, i) => i === idx ? { ...x, [key]: val } : x)); }
  function addEquip() { setEquipmentItems((arr) => [...arr, emptyEquipmentItem()]); }
  function removeEquip(idx) { setEquipmentItems((arr) => arr.filter((_, i) => i !== idx)); }

  // الحساب الحي (عمالة + معدات)
  const calc = useMemo(() => {
    const laborLines = laborItems.map((it) => {
      const cost = Number(it.offeredCost) || 0;
      const housing = Number(it.offeredHousing) || 0;
      const transport = Number(it.offeredTransport) || 0;
      const profit = Number(it.profit) || 0;
      const count = Number(it.count) || 0;
      const unitPrice = cost + housing + transport + profit;
      return { unitPrice, lineTotal: unitPrice * count, count, includesHousing: housing > 0, includesTransport: transport > 0 };
    });
    const equipLines = equipmentItems.map((it) => {
      const price = Number(it.offeredPrice) || 0;
      const profit = Number(it.profit) || 0;
      const count = Number(it.count) || 0;
      const unitPrice = price + profit;
      return { unitPrice, lineTotal: unitPrice * count };
    });
    const subtotal = laborLines.reduce((s, l) => s + l.lineTotal, 0) + equipLines.reduce((s, l) => s + l.lineTotal, 0);
    const tax = subtotal * (VAT_RATE / 100);
    return { laborLines, equipLines, subtotal, tax, total: subtotal + tax };
  }, [laborItems, equipmentItems]);

  async function save(submit) {
    setError("");
    // تحقق
    for (let i = 0; i < laborItems.length; i++) {
      const it = laborItems[i];
      if (!it.gender || !it.nationality || !it.jobTitle) { setError(`البند ${i + 1}: حدّد الجنس والجنسية والمهنة.`); return; }
      if (!(Number(it.count) > 0)) { setError(`البند ${i + 1}: العدد يجب أن يكون أكبر من صفر.`); return; }
    }
    setSaving(true);
    try {
      const payload = {
        customerId: customerId || undefined,
        laborItems: laborItems.map((it) => ({
          gender: it.gender, nationality: it.nationality, jobTitle: it.jobTitle,
          refCost: it.refCost, refHousing: it.refHousing, refTransport: it.refTransport,
          offeredCost: Number(it.offeredCost) || 0,
          offeredHousing: Number(it.offeredHousing) || 0,
          offeredTransport: Number(it.offeredTransport) || 0,
          profit: Number(it.profit) || 0,
          count: Number(it.count) || 0,
        })),
        equipmentItems: equipmentItems.map((it) => ({
          type: it.type, model: it.model, manufacturer: it.manufacturer, size: it.size,
          count: Number(it.count) || 0,
          offeredPrice: Number(it.offeredPrice) || 0,
          profit: Number(it.profit) || 0,
        })),
        submit: submit === true,
      };
      await httpsCallable(functions, "createPriceQuote")(payload);
      onSaved();
    } catch (e) {
      setError(e.message || "تعذّر حفظ عرض السعر.");
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>عرض سعر جديد</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {error ? <div style={styles.error}>{error}</div> : null}

        <div style={styles.formBody}>
          {/* العميل */}
          <label style={styles.fieldLabel}>العميل</label>
          <select style={styles.select} value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={saving}>
            <option value="">— اختر العميل —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* بنود العمالة */}
          <div style={styles.sectionTitle}>👷 بنود العمالة</div>
          {laborItems.map((it, idx) => (
            <div key={idx} style={styles.itemCard}>
              <div style={styles.itemHead}>
                <span style={styles.itemNum}>البند {idx + 1}</span>
                {laborItems.length > 1 ? <button style={styles.removeBtn} onClick={() => removeLabor(idx)}>حذف</button> : null}
              </div>

              {/* المعطيات */}
              <div style={styles.selectRow}>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>الجنس</label>
                  <select style={styles.miniSelect} value={it.gender} onChange={(e) => { setLabor(idx, "gender", e.target.value); }} onBlur={() => fetchRef(idx)} disabled={saving}>
                    <option value="">—</option>
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </div>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>الجنسية</label>
                  <select style={styles.miniSelect} value={it.nationality} onChange={(e) => { setLabor(idx, "nationality", e.target.value); }} onBlur={() => fetchRef(idx)} disabled={saving}>
                    <option value="">—</option>
                    {nationalities.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>المهنة</label>
                  <select style={styles.miniSelect} value={it.jobTitle} onChange={(e) => { setLabor(idx, "jobTitle", e.target.value); }} onBlur={() => fetchRef(idx)} disabled={saving}>
                    <option value="">—</option>
                    {jobTitles.map((j) => <option key={j} value={j}>{j}</option>)}
                  </select>
                </div>
              </div>

              {/* التسعير المرجعي + اليدوي */}
              <div style={styles.priceGrid}>
                <span style={styles.pgCorner}></span>
                <span style={styles.pgHeadCell}>التكلفة</span>
                <span style={styles.pgHeadCell}>السكن</span>
                <span style={styles.pgHeadCell}>المواصلات</span>
                <span style={styles.pgHeadCell}>الربح</span>
                <span style={styles.pgHeadCell}>العدد</span>

                <span style={styles.pgRowLabel}>مرجعي</span>
                {it.refLoading ? (
                  <span style={{ ...styles.pgRefCell, gridColumn: "span 3" }}>جارٍ الحساب...</span>
                ) : it.refCost != null ? (
                  <>
                    <span style={styles.pgRefCell} dir="ltr">{fmt(it.refCost)}</span>
                    <span style={styles.pgRefCell} dir="ltr">{fmt(it.refHousing)}</span>
                    <span style={styles.pgRefCell} dir="ltr">{fmt(it.refTransport)}</span>
                  </>
                ) : (
                  <span style={{ ...styles.pgRefCellEmpty, gridColumn: "span 3" }}>اختر المعطيات لعرض التكلفة</span>
                )}
                <span style={styles.pgRefCell}>—</span>
                <span style={styles.pgRefCell}>—</span>

                <span style={styles.pgRowLabelOffered}>معروض</span>
                <input style={styles.pgInput} type="number" min="0" value={it.offeredCost} onChange={(e) => setLabor(idx, "offeredCost", e.target.value)} disabled={saving} dir="ltr" placeholder="0" />
                <input style={styles.pgInput} type="number" min="0" value={it.offeredHousing} onChange={(e) => setLabor(idx, "offeredHousing", e.target.value)} disabled={saving} dir="ltr" placeholder="0" title="صفر = غير شامل السكن" />
                <input style={styles.pgInput} type="number" min="0" value={it.offeredTransport} onChange={(e) => setLabor(idx, "offeredTransport", e.target.value)} disabled={saving} dir="ltr" placeholder="0" title="صفر = غير شامل المواصلات" />
                <input style={styles.pgInput} type="number" min="0" value={it.profit} onChange={(e) => setLabor(idx, "profit", e.target.value)} disabled={saving} dir="ltr" placeholder="0" />
                <input style={styles.pgInput} type="number" min="0" value={it.count} onChange={(e) => setLabor(idx, "count", e.target.value)} disabled={saving} dir="ltr" placeholder="0" />
              </div>

              {/* سعر الوحدة */}
              <div style={styles.unitPriceRow}>
                <span style={styles.unitHint}>سعر الوحدة = تكلفة + سكن + مواصلات + ربح</span>
                <span style={styles.unitValue} dir="ltr">{fmt(calc.laborLines[idx] ? calc.laborLines[idx].unitPrice : 0)} ر.س</span>
              </div>
            </div>
          ))}

          <button style={styles.addBtn} onClick={addLabor} disabled={saving}>+ إضافة بند</button>

          {/* بنود المعدات */}
          <div style={styles.sectionTitle}>🔧 المعدات (اختياري)</div>
          {equipmentItems.map((it, idx) => (
            <div key={idx} style={styles.itemCard}>
              <div style={styles.itemHead}>
                <span style={styles.itemNum}>معدة {idx + 1}</span>
                <button style={styles.removeBtn} onClick={() => removeEquip(idx)}>حذف</button>
              </div>
              <div style={styles.equipGrid}>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>النوع</label>
                  <input style={styles.miniInput} value={it.type} onChange={(e) => setEquip(idx, "type", e.target.value)} disabled={saving} placeholder="رافعة" />
                </div>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>الموديل</label>
                  <input style={styles.miniInput} value={it.model} onChange={(e) => setEquip(idx, "model", e.target.value)} disabled={saving} placeholder="2023" />
                </div>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>شركة التصنيع</label>
                  <input style={styles.miniInput} value={it.manufacturer} onChange={(e) => setEquip(idx, "manufacturer", e.target.value)} disabled={saving} placeholder="كاتربيلر" />
                </div>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>الحجم</label>
                  <input style={styles.miniInput} value={it.size} onChange={(e) => setEquip(idx, "size", e.target.value)} disabled={saving} placeholder="كبير" />
                </div>
              </div>
              <div style={styles.equipPriceRow}>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>العدد</label>
                  <input style={styles.miniInput} type="number" min="0" value={it.count} onChange={(e) => setEquip(idx, "count", e.target.value)} disabled={saving} dir="ltr" placeholder="0" />
                </div>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>السعر المعروض</label>
                  <input style={styles.miniInput} type="number" min="0" value={it.offeredPrice} onChange={(e) => setEquip(idx, "offeredPrice", e.target.value)} disabled={saving} dir="ltr" placeholder="0" />
                </div>
                <div style={styles.selectCol}>
                  <label style={styles.miniLabel}>الربح</label>
                  <input style={styles.miniInput} type="number" min="0" value={it.profit} onChange={(e) => setEquip(idx, "profit", e.target.value)} disabled={saving} dir="ltr" placeholder="0" />
                </div>
                <div style={styles.equipUnit}>
                  <label style={styles.miniLabel}>سعر الوحدة</label>
                  <span style={styles.equipUnitVal} dir="ltr">{fmt(calc.equipLines[idx] ? calc.equipLines[idx].unitPrice : 0)}</span>
                </div>
              </div>
            </div>
          ))}
          <button style={styles.addBtnEquip} onClick={addEquip} disabled={saving}>+ إضافة معدات</button>

          {/* الإجماليات */}
          <div style={styles.totalsBox}>
            <div style={styles.totalRow}><span>الإجمالي قبل الضريبة</span><span dir="ltr">{fmt(calc.subtotal)}</span></div>
            <div style={styles.totalRow}><span>ضريبة القيمة المضافة 15%</span><span dir="ltr">{fmt(calc.tax)}</span></div>
            <div style={styles.totalRowFinal}><span>الإجمالي شامل الضريبة</span><span dir="ltr">{fmt(calc.total)}</span></div>
          </div>

          {/* معاينة العميل */}
          <div style={styles.previewToggle}>
            <button style={styles.previewBtn} onClick={() => setShowClientPreview((v) => !v)}>
              {showClientPreview ? "▲ إخفاء معاينة العميل" : "👁 معاينة كما تظهر للعميل"}
            </button>
          </div>
          {showClientPreview ? (
            <div style={styles.previewBox}>
              <div style={styles.previewTitle}>معاينة العميل (مبسّطة — بدون تفصيل السكن والمواصلات)</div>
              {laborItems.map((it, idx) => {
                const line = calc.laborLines[idx] || {};
                const sub = line.lineTotal || 0;
                const tx = sub * (VAT_RATE / 100);
                return (
                  <div key={idx} style={styles.previewItem}>
                    <div style={styles.previewInfo}>
                      <span style={styles.previewChip}>{genderLabel(it.gender)}</span>
                      <span style={styles.previewChip}>{it.nationality || "—"}</span>
                      <span style={styles.previewChip}>{it.jobTitle || "—"}</span>
                    </div>
                    <div style={styles.previewNums}>
                      <span>التكلفة <b dir="ltr">{fmt(line.unitPrice)}</b></span>
                      <span>العدد <b>{line.count || 0}</b></span>
                      <span>قبل الضريبة <b dir="ltr">{fmt(sub)}</b></span>
                      <span>الضريبة <b dir="ltr">{fmt(tx)}</b></span>
                      <span>الإجمالي <b dir="ltr">{fmt(sub + tx)}</b></span>
                    </div>
                  </div>
                );
              })}
              {/* الملاحظات التلقائية */}
              <div style={styles.notesBox}>
                <div style={styles.noteGroup}>
                  <div style={styles.noteHead}>✓ يشمل المواصلات لكل من:</div>
                  {laborItems.map((it, idx) => (
                    <div key={idx} style={styles.noteLine}>
                      {genderLabel(it.gender)} · {it.nationality || "—"} · {it.jobTitle || "—"} · العدد {Number(it.offeredTransport) > 0 ? (Number(it.count) || 0) : 0}
                    </div>
                  ))}
                </div>
                <div style={styles.noteGroup}>
                  <div style={styles.noteHead}>✓ يشمل السكن لكل من:</div>
                  {laborItems.map((it, idx) => (
                    <div key={idx} style={styles.noteLine}>
                      {genderLabel(it.gender)} · {it.nationality || "—"} · {it.jobTitle || "—"} · العدد {Number(it.offeredHousing) > 0 ? (Number(it.count) || 0) : 0}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* أزرار */}
        <div style={styles.modalFoot}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.draftBtn} onClick={() => save(false)} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ كمسودة"}</button>
          <button style={styles.submitBtn} onClick={() => save(true)} disabled={saving}>{saving ? "..." : "حفظ وإرسال للمالية"}</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#4f46e5", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  newBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#4f46e5", border: "none", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
  emptyBox: { padding: "40px 20px", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#94a3b8", fontSize: 15 },

  tableCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" },
  tableHead: { display: "grid", gridTemplateColumns: "0.8fr 1.6fr 1.2fr 1.2fr 1.3fr", gap: 8, padding: "13px 20px", borderBottom: "2px solid #f1f5f9", fontSize: 12, color: "#64748b", fontWeight: 700 },
  thNum: { textAlign: "left" },
  thCenter: { textAlign: "center" },
  tableRow: { display: "grid", gridTemplateColumns: "0.8fr 1.6fr 1.2fr 1.2fr 1.3fr", gap: 8, padding: "14px 20px", borderBottom: "1px solid #f8fafc", alignItems: "center" },
  tdNum: { fontSize: 14, fontWeight: 700, color: "#4f46e5", fontFamily: "monospace" },
  tdName: { fontSize: 14, color: "#0f172a", fontWeight: 600 },
  tdMoney: { fontSize: 14, color: "#334155", fontFamily: "monospace", textAlign: "left", fontWeight: 700 },
  tdDate: { fontSize: 12, color: "#94a3b8", textAlign: "center" },
  badge: { fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 20, whiteSpace: "nowrap" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", zIndex: 1000, overflowY: "auto" },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 760, boxShadow: "0 20px 60px rgba(0,0,0,.3)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #e2e8f0" },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  closeBtn: { width: 32, height: 32, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", fontSize: 15, color: "#64748b" },
  formBody: { padding: "20px 24px", maxHeight: "60vh", overflowY: "auto" },

  fieldLabel: { display: "block", fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 6 },
  select: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", marginBottom: 16, background: "#fff" },

  sectionTitle: { fontSize: 15, fontWeight: 800, color: "#4f46e5", margin: "8px 0 12px", paddingBottom: 6, borderBottom: "2px solid #eef2ff" },

  itemCard: { border: "1px solid #e2e8f0", borderRadius: 12, padding: 14, marginBottom: 12, background: "#fafbfc" },
  itemHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  itemNum: { fontSize: 13, fontWeight: 700, color: "#475569" },
  removeBtn: { padding: "4px 12px", fontSize: 12, color: "#dc2626", background: "#fee2e2", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "inherit" },

  selectRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 },
  selectCol: { display: "flex", flexDirection: "column", gap: 4 },
  miniLabel: { fontSize: 12, color: "#64748b", fontWeight: 600 },
  miniSelect: { padding: "8px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 7, fontFamily: "inherit", background: "#fff" },

  priceGrid: { display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr 1fr 1fr", gap: 6, alignItems: "center", marginBottom: 12 },
  pgCorner: {},
  pgHeadCell: { fontSize: 11, color: "#64748b", fontWeight: 700, textAlign: "center" },
  pgRowLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 700 },
  pgRowLabelOffered: { fontSize: 11, color: "#4f46e5", fontWeight: 700 },
  pgRefCell: { fontSize: 12, color: "#94a3b8", textAlign: "center", background: "#f1f5f9", padding: "6px 4px", borderRadius: 6, fontFamily: "monospace" },
  pgRefCellEmpty: { fontSize: 11, color: "#cbd5e1", textAlign: "center", padding: "6px 4px" },
  pgInput: { width: "100%", padding: "7px 4px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6, fontFamily: "monospace", textAlign: "center", boxSizing: "border-box" },

  unitPriceRow: { display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px dashed #e2e8f0" },
  unitHint: { fontSize: 12, color: "#94a3b8" },
  unitValue: { fontSize: 15, fontWeight: 800, color: "#4f46e5", fontFamily: "monospace" },

  addBtn: { width: "100%", padding: "10px", fontSize: 13, fontWeight: 700, color: "#4f46e5", background: "#eef2ff", border: "1px dashed #c7d2fe", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 },

  equipGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 12 },
  miniInput: { padding: "8px 10px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 7, fontFamily: "inherit", background: "#fff", boxSizing: "border-box", width: "100%" },
  equipPriceRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, alignItems: "flex-end" },
  equipUnit: { display: "flex", flexDirection: "column", gap: 4, justifyContent: "flex-end" },
  equipUnitVal: { fontSize: 15, fontWeight: 800, color: "#4f46e5", fontFamily: "monospace", padding: "7px 0" },
  addBtnEquip: { width: "100%", padding: "10px", fontSize: 13, fontWeight: 700, color: "#0891b2", background: "#ecfeff", border: "1px dashed #a5f3fc", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", marginBottom: 16, marginTop: 4 },

  previewToggle: { marginTop: 16 },
  previewBtn: { width: "100%", padding: "10px", fontSize: 13, fontWeight: 700, color: "#059669", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" },
  previewBox: { marginTop: 12, border: "1px solid #a7f3d0", borderRadius: 12, padding: 16, background: "#f0fdf4" },
  previewTitle: { fontSize: 13, fontWeight: 800, color: "#059669", marginBottom: 12 },
  previewItem: { background: "#fff", borderRadius: 8, padding: "10px 12px", marginBottom: 8, border: "1px solid #d1fae5" },
  previewInfo: { display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  previewChip: { fontSize: 12, fontWeight: 700, color: "#065f46", background: "#d1fae5", padding: "3px 10px", borderRadius: 6 },
  previewNums: { display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#475569" },

  notesBox: { marginTop: 10, display: "flex", flexDirection: "column", gap: 10 },
  noteGroup: { background: "#fff", borderRadius: 8, padding: "10px 12px", border: "1px solid #d1fae5" },
  noteHead: { fontSize: 12, fontWeight: 800, color: "#059669", marginBottom: 6 },
  noteLine: { fontSize: 12, color: "#475569", padding: "2px 0", paddingRight: 12 },

  totalsBox: { background: "#f8fafc", borderRadius: 10, padding: "14px 18px" },
  totalRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", padding: "4px 0" },
  totalRowFinal: { display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 800, color: "#0f172a", padding: "8px 0 0", marginTop: 6, borderTop: "2px solid #e2e8f0" },

  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: "1px solid #e2e8f0" },
  cancelBtn: { padding: "10px 18px", fontSize: 14, color: "#64748b", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  draftBtn: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#4f46e5", background: "#eef2ff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  submitBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#4f46e5", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
};
