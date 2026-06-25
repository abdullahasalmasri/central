import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

const GOV_YEAR1 = [
  { key: "recruitment", name: "تكلفة الاستقدام" },
  { key: "visa", name: "تكلفة الفيزا" },
  { key: "embassy_stamp", name: "ختم السفارة" },
  { key: "medical_before", name: "الفحص الطبي" },
  { key: "visa_issue", name: "التفييز" },
  { key: "arrival_ticket", name: "تذكرة القدوم" },
  { key: "medical_after", name: "الفحص الطبي عند الوصول" },
  { key: "medical_insurance", name: "التأمين الطبي" },
  { key: "work_permit", name: "كرت العمل" },
  { key: "labor_fee", name: "المقابل المالي" },
  { key: "iqama", name: "الإقامة" },
];
const GOV_YEAR2 = [
  { key: "medical_insurance", name: "التأمين الطبي" },
  { key: "work_permit", name: "كرت العمل" },
  { key: "labor_fee", name: "المقابل المالي" },
  { key: "iqama", name: "الإقامة" },
];

export default function WorkerCostModal({ worker, onClose, onSaved }) {
  const [tab, setTab] = useState("basic");
  const existing = worker.costBase || {};
  const hasBasic = existing.basicSalary > 0;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>التكلفة: {worker.name}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.tabs}>
          <button style={{ ...styles.tab, ...(tab === "basic" ? styles.tabActive : {}) }} onClick={() => setTab("basic")}>
            الراتب والبدلات
          </button>
          <button style={{ ...styles.tab, ...(tab === "gov" ? styles.tabActive : {}) }} onClick={() => setTab("gov")}>
            التكاليف الحكومية
          </button>
          <button style={{ ...styles.tab, ...(tab === "summary" ? styles.tabActive : {}) }} onClick={() => setTab("summary")}>
            التكلفة الشاملة
          </button>
        </div>

        {tab === "basic" ? (
          <BasicCostTab worker={worker} onSaved={onSaved} />
        ) : tab === "gov" ? (
          <GovCostTab worker={worker} hasBasic={hasBasic} onSaved={onSaved} />
        ) : (
          <FullCostTab worker={worker} hasBasic={hasBasic} />
        )}
      </div>
    </div>
  );
}

// ═══ تبويب الراتب والبدلات ═══
function BasicCostTab({ worker, onSaved }) {
  const existing = worker.costBase || {};
  const [basicSalary, setBasicSalary] = useState(String(existing.basicSalary != null ? existing.basicSalary : ""));
  const [workDays, setWorkDays] = useState(String(existing.workDaysPerMonth != null ? existing.workDaysPerMonth : "26"));
  const [workHours, setWorkHours] = useState(String(existing.workHoursPerDay != null ? existing.workHoursPerDay : "8"));
  const [contractStart, setContractStart] = useState(existing.contractStartDate || "");
  const [contractYears, setContractYears] = useState(String(existing.contractDurationYears != null ? existing.contractDurationYears : "2"));
  const [iqama, setIqama] = useState(existing.iqamaNumber || "");
  const [passport, setPassport] = useState(existing.passportNumber || "");

  const [allowances, setAllowances] = useState(() => {
    if (Array.isArray(existing.allowances) && existing.allowances.length > 0) {
      return existing.allowances.map((a) => ({
        name: a.name || "", amount: String(a.amount != null ? a.amount : ""), deductOnAbsence: a.deductOnAbsence === true,
      }));
    }
    return [
      { name: "بدل السكن", amount: "", deductOnAbsence: false },
      { name: "بدل المواصلات", amount: "", deductOnAbsence: false },
      { name: "بدل الطعام", amount: "", deductOnAbsence: false },
    ];
  });

  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function updateAllowance(idx, field, value) {
    setAllowances((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  }
  function addAllowance() { setAllowances((prev) => [...prev, { name: "", amount: "", deductOnAbsence: false }]); }
  function removeAllowance(idx) { setAllowances((prev) => prev.filter((_, i) => i !== idx)); }

  const salary = Number(basicSalary) || 0;
  const days = Number(workDays) || 26;
  const hours = Number(workHours) || 8;
  const dailySalary = days > 0 ? salary / days : 0;
  const hourlySalary = hours > 0 ? dailySalary / hours : 0;
  const overtimeRate = hourlySalary * 1.5;

  let fixedAllow = 0, variableAllow = 0;
  for (const a of allowances) {
    const amt = Number(a.amount) || 0;
    if (a.deductOnAbsence) variableAllow += amt; else fixedAllow += amt;
  }
  const monthlyVariable = salary + variableAllow;
  const monthlyFixed = fixedAllow;
  const monthlyTotal = monthlyVariable + monthlyFixed;
  const r = (n) => Math.round(n * 100) / 100;

  async function save() {
    setErr("");
    if (salary <= 0) { setErr("الراتب الأساسي مطلوب."); return; }
    if (days <= 0 || days > 31) { setErr("عدد أيام العمل غير صحيح."); return; }
    if (hours <= 0 || hours > 24) { setErr("عدد ساعات العمل غير صحيح."); return; }
    const years = Number(contractYears);
    if (!Number.isFinite(years) || years <= 0 || years > 10) { setErr("مدة العقد غير صحيحة."); return; }

    const cleanAllowances = allowances
      .filter((a) => a.name.trim() && Number(a.amount) >= 0)
      .map((a) => ({ name: a.name.trim(), amount: Number(a.amount) || 0, deductOnAbsence: a.deductOnAbsence === true }));

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "saveWorkerCostBase");
      await fn({
        workerUid: worker.id, basicSalary: salary, workDaysPerMonth: days, workHoursPerDay: hours,
        allowances: cleanAllowances, contractStartDate: contractStart, contractDurationYears: years,
        iqamaNumber: iqama, passportNumber: passport,
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 style={styles.section}>الراتب وساعات العمل</h3>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الراتب الأساسي *</label>
          <input style={styles.input} type="number" min="0" value={basicSalary} onChange={(e) => setBasicSalary(e.target.value)} placeholder="1200" disabled={saving} dir="ltr" />
          <span style={styles.hint}>يُخصم منه عند الغياب</span>
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>أيام العمل الشهرية *</label>
          <input style={styles.input} type="number" min="1" max="31" value={workDays} onChange={(e) => setWorkDays(e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>ساعات العمل اليومية *</label>
          <input style={styles.input} type="number" min="1" max="24" value={workHours} onChange={(e) => setWorkHours(e.target.value)} disabled={saving} dir="ltr" />
        </div>
      </div>

      <h3 style={styles.section}>البدلات</h3>
      <p style={styles.sectionHint}>البدلات تُدفع عادةً رغم الغياب (ثابتة). فعّل «متغيّر» لو كان البدل يُخصم بالغياب.</p>
      {allowances.map((a, idx) => (
        <div key={idx} style={styles.allowRow}>
          <input style={styles.allowName} value={a.name} onChange={(e) => updateAllowance(idx, "name", e.target.value)} placeholder="اسم البدل" disabled={saving} />
          <input style={styles.allowAmount} type="number" min="0" value={a.amount} onChange={(e) => updateAllowance(idx, "amount", e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
          <label style={styles.allowDeduct} title="يُخصم عند الغياب؟">
            <input type="checkbox" checked={a.deductOnAbsence} onChange={(e) => updateAllowance(idx, "deductOnAbsence", e.target.checked)} disabled={saving} />
            <span style={styles.allowDeductText}>{a.deductOnAbsence ? "متغيّر" : "ثابت"}</span>
          </label>
          <button style={styles.delAllow} onClick={() => removeAllowance(idx)} disabled={saving}>✕</button>
        </div>
      ))}
      <button style={styles.addAllow} onClick={addAllowance} disabled={saving}>+ إضافة بدل</button>

      <h3 style={styles.section}>بيانات العقد</h3>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>تاريخ بدء العقد</label>
          <input style={styles.input} type="date" value={contractStart} onChange={(e) => setContractStart(e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>مدة العقد (سنوات) *</label>
          <input style={styles.input} type="number" min="1" max="10" value={contractYears} onChange={(e) => setContractYears(e.target.value)} disabled={saving} dir="ltr" />
          <span style={styles.hint}>لحساب نهاية الخدمة</span>
        </div>
      </div>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>رقم الإقامة</label>
          <input style={styles.input} value={iqama} onChange={(e) => setIqama(e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>رقم الجواز</label>
          <input style={styles.input} value={passport} onChange={(e) => setPassport(e.target.value)} disabled={saving} dir="ltr" />
        </div>
      </div>

      <div style={styles.preview}>
        <h4 style={styles.previewTitle}>المعاينة</h4>
        <div style={styles.previewGrid}>
          <div style={styles.pItem}><span style={styles.pLabel}>الراتب اليومي</span><span style={styles.pValue} dir="ltr">{r(dailySalary).toLocaleString()} ﷼</span></div>
          <div style={styles.pItem}><span style={styles.pLabel}>الراتب بالساعة</span><span style={styles.pValue} dir="ltr">{r(hourlySalary).toLocaleString()} ﷼</span></div>
          <div style={styles.pItem}><span style={styles.pLabel}>ساعة الأوفر تايم</span><span style={styles.pValueOT} dir="ltr">{r(overtimeRate).toLocaleString()} ﷼</span></div>
        </div>
        <div style={styles.previewSplit}>
          <div style={styles.splitItem}><span style={styles.splitLabelVar}>متغيّر شهري</span><span dir="ltr">{r(monthlyVariable).toLocaleString()} ﷼</span></div>
          <div style={styles.splitItem}><span style={styles.splitLabelFixed}>ثابت شهري</span><span dir="ltr">{r(monthlyFixed).toLocaleString()} ﷼</span></div>
        </div>
        <div style={styles.previewTotal}><span>إجمالي التكلفة الأساسية الشهرية</span><span dir="ltr">{r(monthlyTotal).toLocaleString()} ﷼</span></div>
      </div>

      {err ? <div style={styles.error}>{err}</div> : null}
      <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الراتب والبدلات"}</button>
    </div>
  );
}

// ═══ تبويب التكاليف الحكومية ═══
function GovCostTab({ worker, hasBasic, onSaved }) {
  const existing = (worker.costBase && worker.costBase.governmentCosts) || {};
  const basicSalary = (worker.costBase && worker.costBase.basicSalary) || 0;
  const durationYears = (worker.costBase && worker.costBase.contractDurationYears) || 2;

  const [items, setItems] = useState(() => {
    const saved = Array.isArray(existing.items) ? existing.items : [];
    const result = [];
    for (const def of GOV_YEAR1) {
      const found = saved.find((s) => s.key === def.key && s.year === 1 && !s.isManual);
      result.push({ key: def.key, name: def.name, amount: found ? String(found.amount) : "", year: 1, isManual: false });
    }
    for (const def of GOV_YEAR2) {
      const found = saved.find((s) => s.key === def.key && s.year === 2 && !s.isManual);
      result.push({ key: def.key, name: def.name, amount: found ? String(found.amount) : "", year: 2, isManual: false });
    }
    for (const s of saved) {
      if (s.isManual) result.push({ key: null, name: s.name, amount: String(s.amount), year: s.year, isManual: true });
    }
    return result;
  });

  const [includeEOS, setIncludeEOS] = useState(existing.includeEndOfService !== false);
  const [includeLeave, setIncludeLeave] = useState(existing.includeLeaveBalance !== false);
  const [annualLeaveDays, setAnnualLeaveDays] = useState(String(existing.annualLeaveDays != null ? existing.annualLeaveDays : "21"));
  const [method, setMethod] = useState(existing.amortizationMethod || "total");
  const [totalMonths, setTotalMonths] = useState(String(existing.totalMonths != null ? existing.totalMonths : "24"));
  const [year1Months, setYear1Months] = useState(String(existing.year1Months != null ? existing.year1Months : "12"));
  const [year2Months, setYear2Months] = useState(String(existing.year2Months != null ? existing.year2Months : "12"));

  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function updateItem(idx, value) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, amount: value } : it)));
  }
  function addManual() { setItems((prev) => [...prev, { key: null, name: "", amount: "", year: 1, isManual: true }]); }
  function updateManual(idx, field, value) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }
  function removeManual(idx) { setItems((prev) => prev.filter((_, i) => i !== idx)); }

  let year1Total = 0, year2Total = 0;
  for (const it of items) {
    const amt = Number(it.amount) || 0;
    if (it.year === 2) year2Total += amt; else year1Total += amt;
  }
  const endOfService = includeEOS ? (basicSalary / 2) * durationYears : 0;
  const leaveBalance = includeLeave ? (basicSalary / 30) * ((Number(annualLeaveDays) || 21) * durationYears) : 0;
  const grandTotal = year1Total + year2Total + endOfService + leaveBalance;

  let monthlyAmortized = 0, y1Monthly = 0, y2Monthly = 0;
  const extraPerYear = durationYears > 0 ? (endOfService + leaveBalance) / durationYears : 0;
  if (method === "total") {
    const m = Number(totalMonths) || 24;
    monthlyAmortized = m > 0 ? grandTotal / m : 0;
  } else if (method === "per_year") {
    y1Monthly = (year1Total + extraPerYear) / 12;
    y2Monthly = durationYears >= 2 ? (year2Total + extraPerYear) / 12 : 0;
  } else if (method === "custom") {
    const m1 = Number(year1Months) || 12;
    const m2 = Number(year2Months) || 12;
    y1Monthly = m1 > 0 ? (year1Total + extraPerYear) / m1 : 0;
    y2Monthly = (durationYears >= 2 && m2 > 0) ? (year2Total + extraPerYear) / m2 : 0;
  }
  const r = (n) => Math.round(n * 100) / 100;

  const year1Items = items.filter((it) => it.year === 1 && !it.isManual);
  const year2Items = items.filter((it) => it.year === 2 && !it.isManual);
  const manualItems = items.filter((it) => it.isManual);

  async function save() {
    setErr("");
    const cleanItems = items
      .filter((it) => it.name.trim() && Number(it.amount) >= 0)
      .map((it) => ({ key: it.key, name: it.name.trim(), amount: Number(it.amount) || 0, year: it.year, isManual: it.isManual === true }));

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "saveWorkerGovernmentCosts");
      await fn({
        workerUid: worker.id, items: cleanItems,
        includeEndOfService: includeEOS, includeLeaveBalance: includeLeave,
        annualLeaveDays: Number(annualLeaveDays) || 21,
        amortizationMethod: method, totalMonths: Number(totalMonths) || 24,
        year1Months: Number(year1Months) || 12, year2Months: Number(year2Months) || 12,
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  if (!hasBasic) {
    return (
      <div style={styles.warnBox}>
        ⚠️ يجب تحديد الراتب الأساسي أولاً (من تبويب «الراتب والبدلات») قبل إدخال التكاليف الحكومية، لأن نهاية الخدمة ورصيد الإجازات يعتمدان على الراتب.
      </div>
    );
  }

  return (
    <div>
      <div style={styles.note}>أدخل قيم البنود الحكومية (اتركها فارغة لو لا تنطبق). نهاية الخدمة ورصيد الإجازات يُحسبان آليًا.</div>

      <h3 style={styles.section}>بنود السنة الأولى</h3>
      {year1Items.map((it) => {
        const realIdx = items.indexOf(it);
        return (
          <div key={`y1-${it.key}`} style={styles.govRow}>
            <span style={styles.govName}>{it.name}</span>
            <input style={styles.govAmount} type="number" min="0" value={it.amount} onChange={(e) => updateItem(realIdx, e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
          </div>
        );
      })}

      <h3 style={styles.section}>بنود السنة الثانية (متكرّرة)</h3>
      {year2Items.map((it) => {
        const realIdx = items.indexOf(it);
        return (
          <div key={`y2-${it.key}`} style={styles.govRow}>
            <span style={styles.govName}>{it.name}</span>
            <input style={styles.govAmount} type="number" min="0" value={it.amount} onChange={(e) => updateItem(realIdx, e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
          </div>
        );
      })}

      <h3 style={styles.section}>بنود يدوية إضافية</h3>
      {manualItems.map((it) => {
        const realIdx = items.indexOf(it);
        return (
          <div key={`m-${realIdx}`} style={styles.manualRow}>
            <input style={styles.manualName} value={it.name} onChange={(e) => updateManual(realIdx, "name", e.target.value)} placeholder="اسم البند" disabled={saving} />
            <input style={styles.manualAmount} type="number" min="0" value={it.amount} onChange={(e) => updateManual(realIdx, "amount", e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
            <select style={styles.manualYear} value={it.year} onChange={(e) => updateManual(realIdx, "year", Number(e.target.value))} disabled={saving}>
              <option value={1}>سنة 1</option>
              <option value={2}>سنة 2</option>
            </select>
            <button style={styles.delAllow} onClick={() => removeManual(realIdx)} disabled={saving}>✕</button>
          </div>
        );
      })}
      <button style={styles.addAllow} onClick={addManual} disabled={saving}>+ إضافة بند يدوي</button>

      <h3 style={styles.section}>بنود محسوبة آليًا</h3>
      <label style={styles.calcRow}>
        <input type="checkbox" checked={includeEOS} onChange={(e) => setIncludeEOS(e.target.checked)} disabled={saving} />
        <span style={styles.calcLabel}>نهاية الخدمة (نصف راتب لكل سنة)</span>
        <span style={styles.calcValue} dir="ltr">{r(endOfService).toLocaleString()} ﷼</span>
      </label>
      <label style={styles.calcRow}>
        <input type="checkbox" checked={includeLeave} onChange={(e) => setIncludeLeave(e.target.checked)} disabled={saving} />
        <span style={styles.calcLabel}>رصيد الإجازات</span>
        <span style={styles.leaveInput}>
          <input style={styles.leaveDays} type="number" min="0" max="90" value={annualLeaveDays} onChange={(e) => setAnnualLeaveDays(e.target.value)} disabled={saving || !includeLeave} dir="ltr" />
          <span style={styles.leaveUnit}>يوم/سنة</span>
        </span>
        <span style={styles.calcValue} dir="ltr">{r(leaveBalance).toLocaleString()} ﷼</span>
      </label>

      <h3 style={styles.section}>آلية الإطفاء (التوزيع على الأشهر)</h3>
      <div style={styles.methodGrid}>
        <button type="button" onClick={() => setMethod("total")} disabled={saving}
          style={{ ...styles.methodBtn, ...(method === "total" ? styles.methodActive : {}) }}>إجمالي على أشهر</button>
        <button type="button" onClick={() => setMethod("per_year")} disabled={saving}
          style={{ ...styles.methodBtn, ...(method === "per_year" ? styles.methodActive : {}) }}>كل سنة على حدة</button>
        <button type="button" onClick={() => setMethod("custom")} disabled={saving}
          style={{ ...styles.methodBtn, ...(method === "custom" ? styles.methodActive : {}) }}>مخصّص</button>
      </div>

      {method === "total" ? (
        <div style={styles.methodConfig}>
          <label style={styles.label}>عدد أشهر التوزيع (1-24)</label>
          <input style={styles.input} type="number" min="1" max="24" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value)} disabled={saving} dir="ltr" />
        </div>
      ) : method === "custom" ? (
        <div style={styles.methodConfig}>
          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>أشهر السنة الأولى (1-12)</label>
              <input style={styles.input} type="number" min="1" max="12" value={year1Months} onChange={(e) => setYear1Months(e.target.value)} disabled={saving} dir="ltr" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>أشهر السنة الثانية (1-12)</label>
              <input style={styles.input} type="number" min="1" max="12" value={year2Months} onChange={(e) => setYear2Months(e.target.value)} disabled={saving} dir="ltr" />
            </div>
          </div>
        </div>
      ) : (
        <div style={styles.methodConfig}>
          <p style={styles.hint}>السنة الأولى تُوزّع على 12 شهرًا، والثانية على 12 شهرًا.</p>
        </div>
      )}

      <div style={styles.preview}>
        <h4 style={styles.previewTitle}>ملخّص التكاليف الحكومية</h4>
        <div style={styles.govSummary}>
          <div style={styles.gsRow}><span>إجمالي السنة الأولى</span><span dir="ltr">{r(year1Total).toLocaleString()} ﷼</span></div>
          <div style={styles.gsRow}><span>إجمالي السنة الثانية</span><span dir="ltr">{r(year2Total).toLocaleString()} ﷼</span></div>
          <div style={styles.gsRow}><span>نهاية الخدمة</span><span dir="ltr">{r(endOfService).toLocaleString()} ﷼</span></div>
          <div style={styles.gsRow}><span>رصيد الإجازات</span><span dir="ltr">{r(leaveBalance).toLocaleString()} ﷼</span></div>
        </div>
        <div style={styles.previewTotal}><span>الإجمالي الكلي</span><span dir="ltr">{r(grandTotal).toLocaleString()} ﷼</span></div>
        {method === "total" ? (
          <div style={styles.monthlyBox}>
            <span>التكلفة الشهرية المُطفأة</span>
            <span style={styles.monthlyVal} dir="ltr">{r(monthlyAmortized).toLocaleString()} ﷼/شهر</span>
          </div>
        ) : (
          <div style={styles.monthlySplit}>
            <div style={styles.monthlyBox}><span>شهريًا (السنة 1)</span><span style={styles.monthlyVal} dir="ltr">{r(y1Monthly).toLocaleString()} ﷼</span></div>
            {durationYears >= 2 ? (
              <div style={styles.monthlyBox}><span>شهريًا (السنة 2)</span><span style={styles.monthlyVal} dir="ltr">{r(y2Monthly).toLocaleString()} ﷼</span></div>
            ) : null}
          </div>
        )}
      </div>

      {err ? <div style={styles.error}>{err}</div> : null}
      <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ التكاليف الحكومية"}</button>

      {/* ===== التأمينات الاجتماعية ===== */}
      <SocialInsuranceSection worker={worker} basicSalary={basicSalary} onSaved={onSaved} />
    </div>
  );
}

// ═══ قسم التأمينات الاجتماعية ═══
function SocialInsuranceSection({ worker, basicSalary, onSaved }) {
  const existing = (worker.costBase && worker.costBase.socialInsurance) || {};
  const [enabled, setEnabled] = useState(existing.enabled === true);
  const [totalRate, setTotalRate] = useState(String(existing.totalRate != null ? existing.totalRate : ""));
  const [bearer, setBearer] = useState(existing.bearer || "company");
  const [companyRate, setCompanyRate] = useState(String(existing.companyRate != null ? existing.companyRate : ""));
  const [workerRate, setWorkerRate] = useState(String(existing.workerRate != null ? existing.workerRate : ""));
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // الحساب الحيّ
  const total = Number(totalRate) || 0;
  const totalAmount = basicSalary * (total / 100);
  let companyAmount = 0, workerAmount = 0;
  if (enabled) {
    if (bearer === "company") { companyAmount = totalAmount; }
    else if (bearer === "worker") { workerAmount = totalAmount; }
    else if (bearer === "shared") {
      companyAmount = basicSalary * (Number(companyRate) || 0) / 100;
      workerAmount = basicSalary * (Number(workerRate) || 0) / 100;
    }
  }
  const netSalary = basicSalary - workerAmount;
  const r = (n) => Math.round(n * 100) / 100;

  const sharedSum = (Number(companyRate) || 0) + (Number(workerRate) || 0);
  const sharedMismatch = enabled && bearer === "shared" && Math.abs(sharedSum - total) > 0.01;

  async function save() {
    setErr("");
    if (enabled) {
      if (total <= 0 || total > 100) { setErr("النسبة الإجمالية غير صحيحة (0-100)."); return; }
      if (bearer === "shared" && sharedMismatch) {
        setErr(`مجموع نسبتي الشركة والعامل (${sharedSum}%) يجب أن يساوي الإجمالية (${total}%).`);
        return;
      }
    }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "saveWorkerSocialInsurance");
      await fn({
        workerUid: worker.id,
        enabled: enabled,
        totalRate: total,
        bearer: bearer,
        companyRate: Number(companyRate) || 0,
        workerRate: Number(workerRate) || 0,
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.insBox}>
      <div style={styles.insHead}>
        <h3 style={styles.insTitle}>التأمينات الاجتماعية</h3>
        <label style={styles.insToggle}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={saving} />
          <span>{enabled ? "مفعّلة" : "غير مفعّلة"}</span>
        </label>
      </div>

      {enabled ? (
        <>
          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>النسبة الإجمالية (% من الراتب)</label>
              <input style={styles.input} type="number" min="0" max="100" value={totalRate} onChange={(e) => setTotalRate(e.target.value)} placeholder="20" disabled={saving} dir="ltr" />
            </div>
          </div>

          <label style={styles.label}>من يتحمّل التأمينات؟</label>
          <div style={styles.bearerGrid}>
            <button type="button" onClick={() => setBearer("company")} disabled={saving}
              style={{ ...styles.bearerBtn, ...(bearer === "company" ? styles.bearerActive : {}) }}>الشركة بالكامل</button>
            <button type="button" onClick={() => setBearer("worker")} disabled={saving}
              style={{ ...styles.bearerBtn, ...(bearer === "worker" ? styles.bearerActive : {}) }}>العامل بالكامل</button>
            <button type="button" onClick={() => setBearer("shared")} disabled={saving}
              style={{ ...styles.bearerBtn, ...(bearer === "shared" ? styles.bearerActive : {}) }}>مشتركة</button>
          </div>

          {bearer === "shared" ? (
            <div style={styles.row}>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>نسبة الشركة (%)</label>
                <input style={styles.input} type="number" min="0" max="100" value={companyRate} onChange={(e) => setCompanyRate(e.target.value)} placeholder="12" disabled={saving} dir="ltr" />
              </div>
              <div style={{ flex: 1 }}>
                <label style={styles.label}>نسبة العامل (%)</label>
                <input style={styles.input} type="number" min="0" max="100" value={workerRate} onChange={(e) => setWorkerRate(e.target.value)} placeholder="8" disabled={saving} dir="ltr" />
              </div>
            </div>
          ) : null}

          {sharedMismatch ? (
            <div style={styles.mismatchWarn}>
              ⚠️ مجموع النسبتين ({sharedSum}%) لا يساوي الإجمالية ({total}%).
            </div>
          ) : null}

          {/* المعاينة */}
          <div style={styles.insPreview}>
            <div style={styles.insRow}>
              <span>إجمالي التأمينات ({total}%)</span>
              <span dir="ltr">{r(totalAmount).toLocaleString()} ﷼</span>
            </div>
            <div style={styles.insSplit}>
              <div style={styles.insItem}>
                <span style={styles.insLabelCompany}>تتحمّلها الشركة (تكلفة)</span>
                <span dir="ltr">{r(companyAmount).toLocaleString()} ﷼</span>
              </div>
              <div style={styles.insItem}>
                <span style={styles.insLabelWorker}>يُخصم من العامل</span>
                <span dir="ltr">{r(workerAmount).toLocaleString()} ﷼</span>
              </div>
            </div>
            <div style={styles.netRow}>
              <span>صافي راتب العامل (بعد الخصم)</span>
              <span dir="ltr">{r(netSalary).toLocaleString()} ﷼</span>
            </div>
          </div>
        </>
      ) : (
        <p style={styles.insOff}>التأمينات غير مفعّلة لهذا العامل.</p>
      )}

      {err ? <div style={styles.error}>{err}</div> : null}
      <button style={styles.saveIns} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ التأمينات"}</button>
    </div>
  );
}

// ═══ تبويب التكلفة الشاملة (الوحدة 4) ═══
function FullCostTab({ worker, hasBasic }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const fn = httpsCallable(functions, "getWorkerFullCost");
        const res = await fn({ workerUid: worker.id });
        if (alive) setData(res.data);
      } catch (e) {
        if (alive) setErr(e.message || "تعذّر حساب التكلفة الشاملة.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [worker.id]);

  if (!hasBasic) {
    return (
      <div style={styles.warnBox}>
        ⚠️ يجب تحديد الراتب الأساسي أولاً (من تبويب «الراتب والبدلات») قبل عرض التكلفة الشاملة.
      </div>
    );
  }

  if (loading) return <p style={styles.muted}>جارٍ حساب التكلفة الشاملة...</p>;
  if (err) return <div style={styles.error}>{err}</div>;
  if (!data) return null;

  const r = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString();

  return (
    <div>
      <div style={styles.note}>
        التكلفة الشاملة تجمع كل الطبقات في رقم واحد — وهي الأساس المعتمد لحساب الربحية عند تأجير العامل للمشاريع.
      </div>

      <div style={styles.fullLayers}>
        <LayerRow color="#0f766e" label="① الراتب والبدلات" value={data.monthlyBase} sub="راتب أساسي + بدلات" />
        <LayerRow color="#0369a1" label="② التكاليف الحكومية (مُطفأة شهريًا)" value={data.monthlyGov}
          sub={`الإجمالي ${r(data.layer2gov.grandTotal)} ﷼ موزّع على الأشهر`} />
        <LayerRow color="#d97706" label="③ التأمينات (حصة الشركة)" value={data.monthlyInsCompany}
          sub={data.layer2ins.enabled ? "مفعّلة" : "غير مفعّلة"} />
        <LayerRow color="#7c3aed" label="④ نصيب التكلفة الإدارية" value={data.adminShare}
          sub={data.isAdmin ? "لا يُطبّق (شخص إداري)" : `${r(data.layer3admin.adminCostPerWorker)} ﷼ لكل عامل`} />
      </div>

      <div style={styles.subtotalRow}>
        <span>التكلفة الذاتية (الطبقات ①②③)</span>
        <span dir="ltr">{r(data.subtotalBeforeAdmin)} ﷼</span>
      </div>

      <div style={styles.fullTotal}>
        <span>التكلفة الشاملة الشهرية</span>
        <span dir="ltr">{r(data.fullMonthlyTotal)} ﷼</span>
      </div>

      <div style={styles.fullDailyGrid}>
        <div style={styles.fullDailyItem}>
          <span style={styles.fullDailyLabel}>التكلفة اليومية الشاملة</span>
          <span style={styles.fullDailyVal} dir="ltr">{r(data.fullDailyCost)} ﷼</span>
        </div>
        <div style={styles.fullDailyItem}>
          <span style={styles.fullDailyLabel}>التكلفة بالساعة الشاملة</span>
          <span style={styles.fullDailyVal} dir="ltr">{r(data.fullHourlyCost)} ﷼</span>
        </div>
      </div>

      {data.isAdmin ? (
        <p style={styles.adminPersonNote}>
          ℹ️ هذا الشخص إداري/مالك، لذا تكلفته جزء من «التكلفة الإدارية» للمنشأة، ولا يُضاف له نصيب إداري (تجنّبًا للاحتساب المزدوج).
        </p>
      ) : null}

      <div style={styles.netInfoRow}>
        <span style={styles.netInfoLabel}>صافي راتب العامل (ما يستلمه فعليًا)</span>
        <span style={styles.netInfoVal} dir="ltr">{r(data.netSalary)} ﷼</span>
      </div>
    </div>
  );
}

function LayerRow({ color, label, value, sub }) {
  const r = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString();
  return (
    <div style={{ ...styles.layerRow, borderRightColor: color }}>
      <div style={styles.layerInfo}>
        <span style={styles.layerLabel}>{label}</span>
        {sub ? <span style={styles.layerSub}>{sub}</span> : null}
      </div>
      <span style={{ ...styles.layerValue, color: color }} dir="ltr">{r(value)} ﷼</span>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 110 },
  modal: { width: "100%", maxWidth: 640, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "94vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 19, color: "#0f766e" },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },

  tabs: { display: "flex", gap: 8, marginBottom: 20, borderBottom: "2px solid #e2e8f0" },
  tab: { padding: "10px 16px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "transparent", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: "-2px" },
  tabActive: { color: "#0f766e", borderBottomColor: "#0f766e" },

  note: { padding: "10px 14px", background: "#f0fdfa", borderRadius: 8, fontSize: 13, color: "#0f766e", marginBottom: 16, lineHeight: 1.6 },
  warnBox: { padding: "16px", background: "#fffbeb", border: "1px solid #fcd97e", borderRadius: 10, fontSize: 14, color: "#92400e", lineHeight: 1.7 },
  muted: { color: "#94a3b8", fontSize: 14, padding: "20px 0", textAlign: "center" },

  section: { fontSize: 15, color: "#0f172a", margin: "18px 0 10px", paddingBottom: 6, borderBottom: "2px solid #f1f5f9" },
  sectionHint: { fontSize: 12, color: "#94a3b8", margin: "0 0 12px", lineHeight: 1.5 },
  row: { display: "flex", gap: 12, marginBottom: 4 },
  label: { display: "block", margin: "8px 0 6px", fontSize: 13, fontWeight: 600 },
  input: { width: "100%", padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  hint: { display: "block", fontSize: 11, color: "#94a3b8", marginTop: 4 },

  allowRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 },
  allowName: { flex: 2, padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" },
  allowAmount: { flex: 1, padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" },
  allowDeduct: { display: "flex", alignItems: "center", gap: 5, cursor: "pointer", flexShrink: 0, padding: "0 4px" },
  allowDeductText: { fontSize: 12, color: "#475569", fontWeight: 600, minWidth: 38 },
  delAllow: { width: 30, height: 30, fontSize: 13, color: "#dc2626", background: "#fee2e2", border: "none", borderRadius: 6, cursor: "pointer", flexShrink: 0 },
  addAllow: { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#0f766e", background: "#ccfbf1", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4 },

  govRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f8fafc" },
  govName: { fontSize: 14, color: "#334155", flex: 1 },
  govAmount: { width: 130, padding: "8px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" },
  manualRow: { display: "flex", gap: 8, alignItems: "center", marginBottom: 8 },
  manualName: { flex: 2, padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" },
  manualAmount: { width: 90, padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box" },
  manualYear: { width: 80, padding: "9px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },

  calcRow: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, marginBottom: 8 },
  calcLabel: { flex: 1, fontSize: 14, color: "#334155" },
  calcValue: { fontSize: 14, fontWeight: 700, color: "#0f766e" },
  leaveInput: { display: "flex", alignItems: "center", gap: 5 },
  leaveDays: { width: 60, padding: "6px 8px", fontSize: 13, border: "1px solid #ccc", borderRadius: 6, textAlign: "center" },
  leaveUnit: { fontSize: 11, color: "#94a3b8" },

  methodGrid: { display: "flex", gap: 8, marginBottom: 12 },
  methodBtn: { flex: 1, padding: "10px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff", color: "#475569" },
  methodActive: { background: "#0f766e", color: "#fff", borderColor: "#0f766e" },
  methodConfig: { padding: 12, background: "#f8fafc", borderRadius: 8, marginBottom: 4 },

  preview: { marginTop: 20, padding: 16, background: "#f0fdfa", borderRadius: 10, border: "1px solid #99f6e4" },
  previewTitle: { margin: "0 0 12px", fontSize: 15, color: "#0f766e" },
  previewGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 },
  pItem: { display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px", background: "#fff", borderRadius: 8 },
  pLabel: { fontSize: 11, color: "#64748b" },
  pValue: { fontSize: 15, color: "#0f172a", fontWeight: 700 },
  pValueOT: { fontSize: 15, color: "#ea580c", fontWeight: 700 },
  previewSplit: { display: "flex", gap: 10, marginBottom: 12 },
  splitItem: { flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", background: "#fff", borderRadius: 8, fontSize: 14, fontWeight: 700 },
  splitLabelVar: { fontSize: 11, color: "#16a34a", fontWeight: 600 },
  splitLabelFixed: { fontSize: 11, color: "#dc2626", fontWeight: 600 },
  previewTotal: { display: "flex", justifyContent: "space-between", padding: "12px 14px", background: "#0f766e", color: "#fff", borderRadius: 8, fontSize: 16, fontWeight: 700 },

  govSummary: { marginBottom: 12 },
  gsRow: { display: "flex", justifyContent: "space-between", padding: "7px 10px", fontSize: 13, color: "#334155", borderBottom: "1px solid #d1fae5" },
  monthlyBox: { display: "flex", flexDirection: "column", gap: 4, marginTop: 10, padding: "12px 14px", background: "#ecfdf5", borderRadius: 8, fontSize: 13, color: "#334155", fontWeight: 600 },
  monthlyVal: { fontSize: 17, color: "#0f766e", fontWeight: 700 },
  monthlySplit: { display: "flex", gap: 10 },

  insBox: { marginTop: 24, padding: 18, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12 },
  insHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  insTitle: { margin: 0, fontSize: 16, color: "#92400e" },
  insToggle: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "#92400e", cursor: "pointer" },
  bearerGrid: { display: "flex", gap: 8, marginBottom: 12 },
  bearerBtn: { flex: 1, padding: "10px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff", color: "#475569" },
  bearerActive: { background: "#d97706", color: "#fff", borderColor: "#d97706" },
  mismatchWarn: { padding: "8px 12px", background: "#fef2f2", color: "#b91c1c", borderRadius: 8, fontSize: 13, marginBottom: 12 },
  insPreview: { padding: 14, background: "#fff", borderRadius: 10, marginTop: 8 },
  insRow: { display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#92400e", marginBottom: 10 },
  insSplit: { display: "flex", gap: 10, marginBottom: 10 },
  insItem: { flex: 1, display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 14, fontWeight: 700 },
  insLabelCompany: { fontSize: 11, color: "#dc2626", fontWeight: 600 },
  insLabelWorker: { fontSize: 11, color: "#2563eb", fontWeight: 600 },
  netRow: { display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "#ecfdf5", borderRadius: 8, fontSize: 14, fontWeight: 700, color: "#166534" },
  insOff: { fontSize: 13, color: "#92400e", padding: "8px 0" },
  saveIns: { width: "100%", marginTop: 14, padding: "11px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#d97706", border: "none", borderRadius: 8, cursor: "pointer" },

  save: { width: "100%", marginTop: 18, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#0f766e", border: "none", borderRadius: 8, cursor: "pointer" },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginTop: 12 },

  // التكلفة الشاملة
  fullLayers: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 },
  layerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 14px", background: "#f8fafc", borderRadius: 8, borderRight: "4px solid #cbd5e1" },
  layerInfo: { display: "flex", flexDirection: "column", gap: 3 },
  layerLabel: { fontSize: 14, fontWeight: 600, color: "#0f172a" },
  layerSub: { fontSize: 11, color: "#94a3b8" },
  layerValue: { fontSize: 16, fontWeight: 700, flexShrink: 0 },
  subtotalRow: { display: "flex", justifyContent: "space-between", padding: "10px 14px", background: "#f1f5f9", borderRadius: 8, fontSize: 14, fontWeight: 600, color: "#475569", marginBottom: 8 },
  fullTotal: { display: "flex", justifyContent: "space-between", padding: "14px 16px", background: "#0f766e", color: "#fff", borderRadius: 10, fontSize: 18, fontWeight: 700, marginBottom: 12 },
  fullDailyGrid: { display: "flex", gap: 10, marginBottom: 12 },
  fullDailyItem: { flex: 1, display: "flex", flexDirection: "column", gap: 5, padding: "12px 14px", background: "#f0fdfa", border: "1px solid #99f6e4", borderRadius: 8 },
  fullDailyLabel: { fontSize: 12, color: "#64748b" },
  fullDailyVal: { fontSize: 18, color: "#0f766e", fontWeight: 700 },
  adminPersonNote: { fontSize: 12, color: "#7c3aed", background: "#f5f3ff", padding: "10px 14px", borderRadius: 8, lineHeight: 1.6, margin: "0 0 12px" },
  netInfoRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8 },
  netInfoLabel: { fontSize: 13, color: "#166534", fontWeight: 600 },
  netInfoVal: { fontSize: 17, color: "#166534", fontWeight: 700 },
};
