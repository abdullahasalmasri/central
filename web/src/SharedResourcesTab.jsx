import { useState, useEffect } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { exportToExcel, exportToPDF, datedFileName } from "./exportUtils";

// ثيم حسب الوضع
const THEMES = {
  operations: { primary: "#ea580c", light: "#fff7ed", border: "#fed7aa", soft: "#ffedd5", text: "#9a3412" },
  finance: { primary: "#16a34a", light: "#f0fdf4", border: "#bbf7d0", soft: "#dcfce7", text: "#15803d" },
};

const STATUS_META = {
  none: { label: "لم يُوزّع", color: "#475569", bg: "#f1f5f9" },
  draft: { label: "مسودة", color: "#92400e", bg: "#fffbeb" },
  pending_finance: { label: "بانتظار المالية", color: "#1e40af", bg: "#eff6ff" },
  approved: { label: "معتمد ✓", color: "#15803d", bg: "#f0fdf4" },
  rejected: { label: "مرفوض", color: "#b91c1c", bg: "#fee2e2" },
};
const statusMeta = (s) => STATUS_META[s || "none"] || STATUS_META.none;

const rNum = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString();
const profitColor = (v) => (Number(v) >= 0 ? "#16a34a" : "#dc2626");
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// نسخة محلية من محرّك التوزيع (للمعاينة الحيّة الفورية) — مطابقة لـ computeSharedAllocation في الخادم
function computeLocal({ monthlyVariable, monthlyFixed, workDaysPerMonth, workHoursPerDay, items }) {
  const wd = Number(workDaysPerMonth) > 0 ? Number(workDaysPerMonth) : 26;
  const wh = Number(workHoursPerDay) > 0 ? Number(workHoursPerDay) : 8;
  const varM = Number(monthlyVariable) || 0;
  const fixM = Number(monthlyFixed) || 0;
  const list = Array.isArray(items) ? items : [];
  const r = (x) => Math.round(x * 100) / 100;
  const dailyVariable = varM / wd;
  const overtimeHourlyRate = (dailyVariable / wh) * 1.5;
  const totalRatio = list.reduce((s, it) => s + (Number(it.fixedShareRatio) || 0), 0);
  const n = list.length || 1;

  const out = list.map((it) => {
    const rd = Number(it.regularDays) || 0;
    const oh = Number(it.overtimeHours) || 0;
    const ratio = totalRatio > 0 ? (Number(it.fixedShareRatio) || 0) / totalRatio : 1 / n;
    const fixedShare = fixM * ratio;
    const variableCost = rd * dailyVariable + oh * overtimeHourlyRate;
    const totalCost = fixedShare + variableCost;
    const revenue = Number(it.revenue) || 0;
    const profit = revenue - totalCost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    return {
      ...it,
      fixedSharePct: r(ratio * 100),
      fixedShare: r(fixedShare),
      variableCost: r(variableCost),
      totalCost: r(totalCost),
      revenue: r(revenue),
      profit: r(profit),
      margin: r(margin),
    };
  });

  const totals = out.reduce((a, it) => {
    a.revenue += it.revenue; a.fixedShare += it.fixedShare; a.variableCost += it.variableCost; a.totalCost += it.totalCost; a.profit += it.profit; return a;
  }, { revenue: 0, fixedShare: 0, variableCost: 0, totalCost: 0, profit: 0 });
  Object.keys(totals).forEach((k) => { totals[k] = r(totals[k]); });
  totals.margin = totals.revenue > 0 ? r((totals.profit / totals.revenue) * 100) : 0;

  return { dailyVariable: r(dailyVariable), overtimeHourlyRate: r(overtimeHourlyRate), items: out, totals };
}

export default function SharedResourcesTab({ tenantId, companyName, mode }) {
  const theme = THEMES[mode] || THEMES.finance;
  const isOps = mode === "operations";
  const [month, setMonth] = useState(currentMonth);
  const [list, setList] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  async function loadList() {
    setError("");
    if (!/^\d{4}-\d{2}$/.test(month)) { setError("اختر الشهر."); return; }
    setLoadingList(true);
    setList(null);
    setSelected(null);
    try {
      const fn = httpsCallable(functions, "getSharedResources");
      const res = await fn({ month });
      setList(res.data);
    } catch (e) {
      setError(e.message || "تعذّر جلب الموارد المشتركة.");
    } finally {
      setLoadingList(false);
    }
  }

  return (
    <div>
      <div style={{ ...styles.infoBar, background: theme.light, borderColor: theme.border, color: theme.text }}>
        {isOps
          ? "👷‍♂️ العامل المُسنَد لأكثر من مشروع في الشهر يظهر هنا. وزّع تكلفته زمنيًّا: أيام وأوفرتايم لكل مشروع، ونسبة الثابت (حكومي/إداري). ثم أرسلها للمالية للاعتماد."
          : "✅ التوزيعات المُرسلة من العمليات للاعتماد. راجع الأرقام الفعلية لكل مشروع ثم اعتمد أو ارفض. المعتمد يُطبّق تلقائيًّا على الربحية."}
      </div>

      <div style={{ ...styles.controls, background: theme.light, borderColor: theme.border }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={styles.label}>الشهر</label>
          <input style={styles.input} type="month" value={month} onChange={(e) => { setMonth(e.target.value); setList(null); setSelected(null); }} dir="ltr" />
        </div>
        <button style={{ ...styles.primaryBtn, background: theme.primary }} onClick={loadList} disabled={loadingList}>
          {loadingList ? "جارٍ التحميل..." : "تحميل"}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {list ? (
        list.workers.length === 0 ? (
          <div style={styles.empty}>
            <div style={styles.emptyIcon}>🧩</div>
            <p style={styles.muted}>لا يوجد عمّال مشتركون بين عدة مشاريع في {month}.</p>
          </div>
        ) : (
          <>
            <div style={styles.count}>{list.workers.length} عامل مشترك</div>
            <div style={styles.workerGrid}>
              {list.workers.map((w) => {
                const sm = statusMeta(w.allocationStatus);
                const active = selected === w.workerUid;
                return (
                  <button
                    key={w.workerUid}
                    style={{ ...styles.workerCard, ...(active ? { borderColor: theme.primary, background: theme.light } : {}) }}
                    onClick={() => setSelected(active ? null : w.workerUid)}
                  >
                    <div style={styles.workerTop}>
                      <span style={styles.workerName}>{w.workerName}</span>
                      <span style={{ ...styles.badge, color: sm.color, background: sm.bg }}>{sm.label}</span>
                    </div>
                    <div style={styles.workerMeta}>
                      <span>{w.projectsCount} مشاريع · {w.assignmentsCount} إسناد</span>
                    </div>
                    <div style={styles.projChips}>
                      {w.projects.map((p, i) => (
                        <span key={i} style={styles.projChip} dir="ltr">PRJ-{p.projectNumber}</span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            {selected ? (
              <AllocationEditor
                key={selected + month}
                workerUid={selected}
                month={month}
                mode={mode}
                theme={theme}
                companyName={companyName}
                onChanged={loadList}
              />
            ) : null}
          </>
        )
      ) : !loadingList ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>{isOps ? "🛠️" : "📋"}</div>
          <p style={styles.muted}>اختر الشهر ثم اضغط «تحميل» لعرض العمّال المشتركين.</p>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// محرّر/عارض توزيع عامل واحد
// ═══════════════════════════════════════════════════════
function AllocationEditor({ workerUid, month, mode, theme, companyName, onChanged }) {
  const isOps = mode === "operations";
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      setMsg("");
      try {
        const fn = httpsCallable(functions, "getSharedAllocation");
        const res = await fn({ workerUid, month });
        setData(res.data);
        const items = (res.data.computed && res.data.computed.items) || [];
        setRows(items.map((it) => ({
          assignmentId: it.assignmentId,
          projectName: it.projectName,
          projectNumber: it.projectNumber,
          revenue: it.revenue,
          regularDays: it.regularDays,
          overtimeHours: it.overtimeHours,
          fixedShareRatio: it.fixedShareRatio,
        })));
      } catch (e) {
        setError(e.message || "تعذّر جلب التوزيع.");
      } finally {
        setLoading(false);
      }
    })();
  }, [workerUid, month]);

  function updateRow(idx, field, value) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
    setMsg("");
  }

  // المعاينة الحيّة
  const preview = data ? computeLocal({
    monthlyVariable: data.monthlyVariable,
    monthlyFixed: data.monthlyFixed,
    workDaysPerMonth: data.workDaysPerMonth,
    workHoursPerDay: data.workHoursPerDay,
    items: rows,
  }) : null;

  async function save(submit) {
    setError("");
    setMsg("");
    // تحقق بسيط
    const anyRatio = rows.some((r) => (Number(r.fixedShareRatio) || 0) > 0);
    if (!anyRatio) { setError("حدّد نسبة الثابت لمشروع واحد على الأقل."); return; }
    for (const r of rows) {
      if ((Number(r.regularDays) || 0) < 0 || (Number(r.regularDays) || 0) > 31) { setError("أيام العمل بين 0 و31."); return; }
      if ((Number(r.overtimeHours) || 0) < 0) { setError("ساعات الأوفرتايم غير صحيحة."); return; }
    }
    setBusy(submit ? "submit" : "draft");
    try {
      const fn = httpsCallable(functions, "saveSharedAllocation");
      const res = await fn({
        workerUid, month, submit,
        items: rows.map((r) => ({
          assignmentId: r.assignmentId,
          regularDays: Number(r.regularDays) || 0,
          overtimeHours: Number(r.overtimeHours) || 0,
          fixedShareRatio: Number(r.fixedShareRatio) || 0,
        })),
      });
      setData((d) => ({ ...d, status: res.data.status, rejectionReason: null }));
      setMsg(submit ? "أُرسلت للمالية للاعتماد ✓" : "حُفظت كمسودة ✓");
      if (onChanged) onChanged();
    } catch (e) {
      setError(e.message || "تعذّر الحفظ.");
    } finally {
      setBusy("");
    }
  }

  async function decide(action) {
    setError("");
    setMsg("");
    if (action === "reject" && !rejectReason.trim()) { setError("اذكر سبب الرفض."); return; }
    setBusy(action);
    try {
      const fn = httpsCallable(functions, "setSharedAllocationStatus");
      const res = await fn({ workerUid, month, action, rejectionReason: action === "reject" ? rejectReason.trim() : undefined });
      setData((d) => ({ ...d, status: res.data.status, rejectionReason: action === "reject" ? rejectReason.trim() : null }));
      setRejecting(false);
      setRejectReason("");
      setMsg(action === "approve" ? "اعتُمد التوزيع ✓" : action === "reject" ? "رُفض التوزيع." : "أُعيد فتحه للعمليات.");
      if (onChanged) onChanged();
    } catch (e) {
      setError(e.message || "تعذّر تنفيذ الإجراء.");
    } finally {
      setBusy("");
    }
  }

  function exportPreview() {
    if (!preview) return;
    const cols = [
      { key: "projectName", header: "المشروع" },
      { key: "regularDays", header: "أيام عادية" },
      { key: "overtimeHours", header: "ساعات أوفرتايم" },
      { key: "fixedSharePct", header: "نسبة الثابت %" },
      { key: "fixedShare", header: "نصيب الثابت" },
      { key: "variableCost", header: "المتغيّر" },
      { key: "totalCost", header: "التكلفة" },
      { key: "revenue", header: "الإيراد" },
      { key: "profit", header: "الربح" },
      { key: "margin", header: "الهامش %" },
    ];
    const exportRows = preview.items.map((it, i) => ({
      projectName: `${rows[i].projectName} (PRJ-${rows[i].projectNumber})`,
      regularDays: rows[i].regularDays,
      overtimeHours: rows[i].overtimeHours,
      fixedSharePct: `${it.fixedSharePct}%`,
      fixedShare: it.fixedShare,
      variableCost: it.variableCost,
      totalCost: it.totalCost,
      revenue: it.revenue,
      profit: it.profit,
      margin: `${it.margin}%`,
    }));
    exportToPDF({
      rows: exportRows, columns: cols, fileName: datedFileName("توزيع-مشترك"),
      header: { companyName: companyName || "الشركة", title: `توزيع تكلفة: ${data.workerName}`, subtitle: `عن شهر ${month}` },
    });
  }

  if (loading) return <div style={styles.editorBox}><p style={styles.muted}>جارٍ تحميل التوزيع...</p></div>;
  if (error && !data) return <div style={styles.editorBox}><div style={styles.error}>{error}</div></div>;
  if (!data) return null;

  const status = data.status;
  const sm = statusMeta(status);
  const canApprove = !isOps && status === "pending_finance";
  const canReopen = !isOps && (status === "approved" || status === "rejected");
  const financeWaiting = !isOps && (!status || status === "draft");

  return (
    <div style={{ ...styles.editorBox, borderColor: theme.border }}>
      <div style={styles.editorHead}>
        <div>
          <h3 style={styles.editorTitle}>{data.workerName}</h3>
          <span style={styles.editorSub}>{data.workerJobTitle || "—"} · {data.assignmentsCount} إسناد · <span dir="ltr">{month}</span></span>
        </div>
        <span style={{ ...styles.badge, color: sm.color, background: sm.bg, fontSize: 13 }}>{sm.label}</span>
      </div>

      {/* بيانات تكلفة العامل */}
      <div style={styles.costBar}>
        <div style={styles.costItem}><span style={styles.costLbl}>متغيّر شهري (راتب)</span><span style={styles.costVal} dir="ltr">{rNum(data.monthlyVariable)} ﷼</span></div>
        <div style={styles.costItem}><span style={styles.costLbl}>ثابت شهري (حكومي+إداري+بدلات)</span><span style={styles.costVal} dir="ltr">{rNum(data.monthlyFixed)} ﷼</span></div>
        <div style={styles.costItem}><span style={styles.costLbl}>يومي متغيّر</span><span style={styles.costVal} dir="ltr">{preview ? rNum(preview.dailyVariable) : "—"} ﷼</span></div>
        <div style={styles.costItem}><span style={styles.costLbl}>ساعة أوفرتايم ×1.5</span><span style={styles.costVal} dir="ltr">{preview ? rNum(preview.overtimeHourlyRate) : "—"} ﷼</span></div>
      </div>

      {data.rejectionReason ? (
        <div style={styles.rejectBox}>⛔ سبب الرفض: {data.rejectionReason}</div>
      ) : null}

      {isOps && status === "approved" ? (
        <div style={styles.warnBox}>⚠️ هذا التوزيع معتمد ومُطبّق على الربحية. أي تعديل وحفظ سيلغي الاعتماد ويتطلب إعادته من المالية.</div>
      ) : null}
      {financeWaiting ? (
        <div style={styles.warnBox}>⏳ لم تُرسل العمليات هذا التوزيع للاعتماد بعد. تظهر الأرقام الحالية للاطّلاع فقط.</div>
      ) : null}

      {/* جدول التوزيع */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>المشروع</th>
              <th style={styles.th}>أيام عادية</th>
              <th style={styles.th}>ساعات أوفرتايم</th>
              <th style={styles.th}>نسبة الثابت</th>
              <th style={styles.th}>نصيب الثابت</th>
              <th style={styles.th}>المتغيّر</th>
              <th style={styles.th}>التكلفة</th>
              <th style={styles.th}>الإيراد</th>
              <th style={styles.th}>الربح</th>
              <th style={styles.th}>الهامش</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const pv = preview ? preview.items[idx] : {};
              return (
                <tr key={row.assignmentId}>
                  <td style={styles.td}>
                    <div style={styles.cellName}>{row.projectName}</div>
                    <div style={styles.cellSub} dir="ltr">PRJ-{row.projectNumber}</div>
                  </td>
                  <td style={styles.tdInput}>
                    {isOps ? (
                      <input type="number" min="0" max="31" step="1" style={styles.numInput} value={row.regularDays} onChange={(e) => updateRow(idx, "regularDays", e.target.value)} dir="ltr" />
                    ) : <span dir="ltr">{row.regularDays}</span>}
                  </td>
                  <td style={styles.tdInput}>
                    {isOps ? (
                      <input type="number" min="0" step="1" style={styles.numInput} value={row.overtimeHours} onChange={(e) => updateRow(idx, "overtimeHours", e.target.value)} dir="ltr" />
                    ) : <span dir="ltr">{row.overtimeHours}</span>}
                  </td>
                  <td style={styles.tdInput}>
                    {isOps ? (
                      <input type="number" min="0" step="0.5" style={styles.numInput} value={row.fixedShareRatio} onChange={(e) => updateRow(idx, "fixedShareRatio", e.target.value)} dir="ltr" />
                    ) : <span dir="ltr">{row.fixedShareRatio}</span>}
                  </td>
                  <td style={styles.td} dir="ltr">{pv.fixedShare != null ? `${rNum(pv.fixedShare)} (${pv.fixedSharePct}%)` : "—"}</td>
                  <td style={styles.td} dir="ltr">{pv.variableCost != null ? rNum(pv.variableCost) : "—"}</td>
                  <td style={styles.tdRed} dir="ltr">{pv.totalCost != null ? rNum(pv.totalCost) : "—"}</td>
                  <td style={styles.td} dir="ltr">{rNum(row.revenue)}</td>
                  <td style={{ ...styles.td, color: profitColor(pv.profit), fontWeight: 700 }} dir="ltr">{pv.profit != null ? rNum(pv.profit) : "—"}</td>
                  <td style={{ ...styles.td, color: profitColor(pv.profit) }} dir="ltr">{pv.margin != null ? `${rNum(pv.margin)}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
          {preview ? (
            <tfoot>
              <tr>
                <td style={styles.tfTd}>الإجمالي</td>
                <td style={styles.tfTd}></td>
                <td style={styles.tfTd}></td>
                <td style={styles.tfTd}></td>
                <td style={styles.tfTd} dir="ltr">{rNum(preview.totals.fixedShare)}</td>
                <td style={styles.tfTd} dir="ltr">{rNum(preview.totals.variableCost)}</td>
                <td style={{ ...styles.tfTd, color: "#dc2626" }} dir="ltr">{rNum(preview.totals.totalCost)}</td>
                <td style={styles.tfTd} dir="ltr">{rNum(preview.totals.revenue)}</td>
                <td style={{ ...styles.tfTd, color: profitColor(preview.totals.profit) }} dir="ltr">{rNum(preview.totals.profit)}</td>
                <td style={{ ...styles.tfTd, color: profitColor(preview.totals.profit) }} dir="ltr">{rNum(preview.totals.margin)}%</td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {isOps ? (
        <div style={styles.hintRow}>
          💡 المتغيّر لكل مشروع = أيام عادية × اليومي + ساعات أوفرتايم × سعر الأوفرتايم. الثابت يُقسّم بالنسب (مثال: 1 و1 = نصفين). أوفرتايم وردية كاملة ≈ أيام × ساعات اليوم.
        </div>
      ) : null}

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={{ ...styles.okMsg, background: theme.soft, color: theme.text }}>{msg}</div> : null}

      {/* الأزرار */}
      <div style={styles.actions}>
        <button style={styles.ghostBtn} onClick={exportPreview}>⬇ PDF</button>
        <div style={{ flex: 1 }} />
        {isOps ? (
          <>
            <button style={styles.draftBtn} onClick={() => save(false)} disabled={!!busy}>
              {busy === "draft" ? "..." : "حفظ مسودة"}
            </button>
            <button style={{ ...styles.primaryBtn, background: theme.primary }} onClick={() => save(true)} disabled={!!busy}>
              {busy === "submit" ? "..." : "إرسال للمالية"}
            </button>
          </>
        ) : (
          <>
            {canReopen ? (
              <button style={styles.draftBtn} onClick={() => decide("reopen")} disabled={!!busy}>
                {busy === "reopen" ? "..." : "إعادة فتح للعمليات"}
              </button>
            ) : null}
            {canApprove ? (
              <>
                <button style={styles.rejectBtn} onClick={() => setRejecting((v) => !v)} disabled={!!busy}>رفض</button>
                <button style={{ ...styles.primaryBtn, background: theme.primary }} onClick={() => decide("approve")} disabled={!!busy}>
                  {busy === "approve" ? "..." : "اعتماد"}
                </button>
              </>
            ) : null}
          </>
        )}
      </div>

      {rejecting ? (
        <div style={styles.rejectRow}>
          <input style={styles.input} placeholder="سبب الرفض (يظهر للعمليات)..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
          <button style={styles.rejectBtn} onClick={() => decide("reject")} disabled={!!busy}>
            {busy === "reject" ? "..." : "تأكيد الرفض"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  infoBar: { padding: "12px 16px", border: "1px solid", borderRadius: 8, fontSize: 13, marginBottom: 16, lineHeight: 1.7 },
  controls: { display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", padding: 16, border: "1px solid", borderRadius: 10 },
  label: { display: "block", margin: "0 0 6px", fontSize: 13, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  primaryBtn: { padding: "10px 22px", fontSize: 14, fontWeight: 600, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", height: 42 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginTop: 12, marginBottom: 4 },
  muted: { color: "#94a3b8", fontSize: 14 },
  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  count: { fontSize: 14, color: "#64748b", fontWeight: 600, marginBottom: 10 },

  workerGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10, marginBottom: 18 },
  workerCard: { display: "flex", flexDirection: "column", gap: 6, padding: 14, background: "#fff", border: "2px solid #e2e8f0", borderRadius: 10, cursor: "pointer", textAlign: "right" },
  workerTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  workerName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  badge: { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" },
  workerMeta: { fontSize: 12, color: "#64748b" },
  projChips: { display: "flex", flexWrap: "wrap", gap: 4 },
  projChip: { fontSize: 10, fontFamily: "monospace", color: "#475569", background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 },

  editorBox: { background: "#fff", border: "2px solid #e2e8f0", borderRadius: 12, padding: 18, marginTop: 6 },
  editorHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 14, borderBottom: "1px solid #f1f5f9", gap: 12, flexWrap: "wrap" },
  editorTitle: { margin: 0, fontSize: 18, color: "#0f172a" },
  editorSub: { fontSize: 12, color: "#94a3b8" },

  costBar: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 14 },
  costItem: { display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", background: "#f8fafc", borderRadius: 8 },
  costLbl: { fontSize: 11, color: "#64748b" },
  costVal: { fontSize: 15, fontWeight: 700, color: "#0f172a" },

  rejectBox: { padding: "10px 14px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, color: "#b91c1c", marginBottom: 12 },
  warnBox: { padding: "10px 14px", background: "#fffbeb", border: "1px solid #fcd97e", borderRadius: 8, fontSize: 13, color: "#92400e", marginBottom: 12 },

  tableWrap: { overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 10 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 760 },
  th: { textAlign: "right", padding: "10px 8px", fontSize: 11, color: "#64748b", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap", background: "#f8fafc" },
  td: { padding: "8px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" },
  tdRed: { padding: "8px", fontSize: 13, color: "#dc2626", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap", fontWeight: 600 },
  tdInput: { padding: "6px 8px", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" },
  numInput: { width: 72, padding: "6px 8px", fontSize: 13, border: "1px solid #cbd5e1", borderRadius: 6, textAlign: "center", boxSizing: "border-box" },
  cellName: { fontWeight: 600, fontSize: 13 },
  cellSub: { fontSize: 10, color: "#94a3b8", fontFamily: "monospace" },
  tfTd: { padding: "10px 8px", fontSize: 13, fontWeight: 700, color: "#0f172a", borderTop: "2px solid #e2e8f0", background: "#f8fafc", whiteSpace: "nowrap" },

  hintRow: { fontSize: 12, color: "#64748b", background: "#f8fafc", padding: "8px 12px", borderRadius: 8, marginBottom: 10, lineHeight: 1.6 },
  okMsg: { padding: "10px 12px", borderRadius: 8, fontSize: 14, fontWeight: 600, marginTop: 12 },

  actions: { display: "flex", gap: 8, alignItems: "center", marginTop: 14, flexWrap: "wrap" },
  ghostBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  draftBtn: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#334155", background: "#e2e8f0", border: "none", borderRadius: 8, cursor: "pointer", height: 42 },
  rejectBtn: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#dc2626", border: "none", borderRadius: 8, cursor: "pointer", height: 42 },
  rejectRow: { display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" },
};
