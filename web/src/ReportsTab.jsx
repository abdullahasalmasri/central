import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { exportToExcel, exportToPDF, datedFileName } from "./exportUtils";

const STATUS_LABELS = {
  planned: "مخطّط", active: "نشط", on_hold: "متوقّف", completed: "مكتمل", cancelled: "ملغى",
};

const REPORT_TYPES = [
  { id: "enterprise", label: "📊 المنشأة", desc: "كل المشاريع مجمّعة لشهر" },
  { id: "compare", label: "🏆 مقارنة المشاريع", desc: "ترتيب المشاريع بالأكثر ربحية" },
  { id: "projectRange", label: "📈 المشروع عبر فترة", desc: "ربحية مشروع عبر عدة أشهر" },
  { id: "worker", label: "👷 ربحية العامل", desc: "ربحية عامل عبر مشاريعه" },
];

export default function ReportsTab({ tenantId, companyName }) {
  const [reportType, setReportType] = useState("enterprise");

  return (
    <div>
      <div style={styles.infoBar}>
        📊 تقارير الربحية تُبنى على نفس معادلة ربحية المشاريع (الإيراد − التكلفة الشاملة بعد الغياب والتناسب). اختر نوع التقرير ثم المعايير.
      </div>

      <div style={styles.typeGrid}>
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.id}
            style={{ ...styles.typeCard, ...(reportType === rt.id ? styles.typeCardActive : {}) }}
            onClick={() => setReportType(rt.id)}
          >
            <span style={styles.typeCardLabel}>{rt.label}</span>
            <span style={styles.typeCardDesc}>{rt.desc}</span>
          </button>
        ))}
      </div>

      {reportType === "enterprise" ? (
        <EnterpriseReport tenantId={tenantId} companyName={companyName} mode="enterprise" />
      ) : reportType === "compare" ? (
        <EnterpriseReport tenantId={tenantId} companyName={companyName} mode="compare" />
      ) : reportType === "projectRange" ? (
        <ProjectRangeReport tenantId={tenantId} companyName={companyName} />
      ) : (
        <WorkerReport tenantId={tenantId} companyName={companyName} />
      )}
    </div>
  );
}

// أدوات مشتركة
const rNum = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString();
const profitColor = (v) => (Number(v) >= 0 ? "#16a34a" : "#dc2626");
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// ═══════════════════════════════════════════════════════
// تقرير المنشأة + مقارنة المشاريع (نفس المصدر، عرض مختلف)
// ═══════════════════════════════════════════════════════
function EnterpriseReport({ tenantId, companyName, mode }) {
  const [month, setMonth] = useState(currentMonth);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isCompare = mode === "compare";

  async function compute() {
    setError("");
    if (!/^\d{4}-\d{2}$/.test(month)) { setError("اختر الشهر."); return; }
    setLoading(true);
    setResult(null);
    try {
      const fn = httpsCallable(functions, "getEnterpriseProfitability");
      const res = await fn({ month });
      setResult(res.data);
    } catch (e) {
      setError(e.message || "تعذّر حساب التقرير.");
    } finally {
      setLoading(false);
    }
  }

  const company = companyName || "الشركة";
  const exportColumns = [
    { key: "rank", header: "#" },
    { key: "projectNumber", header: "رقم المشروع" },
    { key: "projectName", header: "المشروع" },
    { key: "status", header: "الحالة" },
    { key: "workersCount", header: "العمال" },
    { key: "revenue", header: "الإيراد" },
    { key: "netRevenue", header: "صافي الإيراد" },
    { key: "cost", header: "التكلفة" },
    { key: "profit", header: "الربح" },
    { key: "margin", header: "الهامش %" },
  ];
  function buildRows() {
    return (result.projects || []).map((p, i) => ({
      rank: i + 1,
      projectNumber: `PRJ-${p.projectNumber}`,
      projectName: p.projectName,
      status: STATUS_LABELS[p.status] || p.status || "",
      workersCount: p.workersCount,
      revenue: p.revenue,
      netRevenue: p.netRevenue,
      cost: p.cost,
      profit: p.profit,
      margin: `${p.margin}%`,
    }));
  }
  const reportTitle = isCompare ? "مقارنة ربحية المشاريع" : "تقرير ربحية المنشأة";
  const filePrefix = isCompare ? "مقارنة-المشاريع" : "ربحية-المنشأة";
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName(filePrefix), sheetName: reportTitle });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName(filePrefix), header: { companyName: company, title: reportTitle, subtitle: `عن شهر ${month}` } });

  // أقصى ربح (لأشرطة المقارنة)
  const maxProfit = result && result.projects && result.projects.length > 0
    ? Math.max(...result.projects.map((p) => Math.abs(p.profit)), 1) : 1;

  return (
    <div>
      <div style={styles.controls}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={styles.label}>الشهر</label>
          <input style={styles.input} type="month" value={month} onChange={(e) => { setMonth(e.target.value); setResult(null); }} dir="ltr" />
        </div>
        <button style={styles.computeBtn} onClick={compute} disabled={loading}>
          {loading ? "جارٍ الحساب..." : "احسب التقرير"}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {result ? (
        <>
          <div style={styles.summaryCard}>
            <div style={styles.summaryHead}>
              <div>
                <h3 style={styles.summaryTitle}>{reportTitle}</h3>
                <span style={styles.summarySub} dir="ltr">{result.month} · {result.projectsCount} مشروع · {result.workersCount} عامل</span>
              </div>
              <div style={styles.summaryMargin}>
                <span style={{ ...styles.marginVal, color: profitColor(result.totals.profit) }} dir="ltr">{rNum(result.totals.margin)}%</span>
                <span style={styles.marginLbl}>هامش المنشأة</span>
              </div>
            </div>
            <div style={styles.summaryGrid}>
              <SumItem label="الإيراد الإجمالي" value={result.totals.revenue} />
              <SumItem label="صافي الإيراد" value={result.totals.netRevenue} />
              <SumItem label="التكلفة" value={result.totals.cost} red />
              <SumItem label="صافي الربح" value={result.totals.profit} big color={profitColor(result.totals.profit)} />
            </div>
            {result.missingCostCount > 0 ? (
              <div style={styles.warnRow}>⚠️ {result.missingCostCount} عامل بلا تكلفة محددة (غير محتسبين في الأرقام).</div>
            ) : null}
          </div>

          {result.projects.length === 0 ? (
            <div style={styles.empty}><p style={styles.muted}>لا يوجد نشاط مشاريع في هذا الشهر.</p></div>
          ) : (
            <>
              <div style={styles.toolbar}>
                <span style={styles.count}>{result.projects.length} مشروع</span>
                <div style={styles.toolBtns}>
                  <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
                  <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
                </div>
              </div>

              {isCompare ? (
                <div style={styles.compareList}>
                  {result.projects.map((p, i) => {
                    const widthPct = Math.max(2, (Math.abs(p.profit) / maxProfit) * 100);
                    return (
                      <div key={p.projectId} style={styles.compareRow}>
                        <div style={styles.compareRank}>{i + 1}</div>
                        <div style={styles.compareBody}>
                          <div style={styles.compareTop}>
                            <span style={styles.compareName}>{p.projectName}</span>
                            <span style={{ ...styles.compareProfit, color: profitColor(p.profit) }} dir="ltr">{rNum(p.profit)} ﷼</span>
                          </div>
                          <div style={styles.barTrack}>
                            <div style={{ ...styles.barFill, width: `${widthPct}%`, background: profitColor(p.profit) }} />
                          </div>
                          <div style={styles.compareMeta}>
                            <span dir="ltr">PRJ-{p.projectNumber}</span>
                            <span>الهامش: {rNum(p.margin)}%</span>
                            <span>الإيراد: {rNum(p.revenue)} ﷼</span>
                            <span>{p.workersCount} عامل</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>المشروع</th>
                        <th style={styles.th}>الحالة</th>
                        <th style={styles.th}>العمال</th>
                        <th style={styles.th}>الإيراد</th>
                        <th style={styles.th}>صافي الإيراد</th>
                        <th style={styles.th}>التكلفة</th>
                        <th style={styles.th}>الربح</th>
                        <th style={styles.th}>الهامش</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.projects.map((p, i) => (
                        <tr key={p.projectId}>
                          <td style={styles.td}>{i + 1}</td>
                          <td style={styles.td}>
                            <div style={styles.cellName}>{p.projectName}</div>
                            <div style={styles.cellSub} dir="ltr">PRJ-{p.projectNumber}</div>
                          </td>
                          <td style={styles.td}>{STATUS_LABELS[p.status] || "—"}</td>
                          <td style={styles.td} dir="ltr">{p.workersCount}</td>
                          <td style={styles.td} dir="ltr">{rNum(p.revenue)}</td>
                          <td style={styles.td} dir="ltr">{rNum(p.netRevenue)}</td>
                          <td style={styles.tdRed} dir="ltr">{rNum(p.cost)}</td>
                          <td style={{ ...styles.td, color: profitColor(p.profit), fontWeight: 700 }} dir="ltr">{rNum(p.profit)}</td>
                          <td style={{ ...styles.td, color: profitColor(p.profit) }} dir="ltr">{rNum(p.margin)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      ) : !loading ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>{isCompare ? "🏆" : "📊"}</div>
          <p style={styles.muted}>اختر الشهر ثم اضغط «احسب التقرير».</p>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// تقرير المشروع عبر فترة
// ═══════════════════════════════════════════════════════
function ProjectRangeReport({ tenantId, companyName }) {
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [fromMonth, setFromMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [toMonth, setToMonth] = useState(currentMonth);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingProjects(true);
      try {
        const snap = await getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId)));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
        setProjects(list);
      } catch (e) {
        setError("تعذّر تحميل المشاريع.");
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  async function compute() {
    setError("");
    if (!projectId) { setError("اختر المشروع."); return; }
    if (!/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) { setError("اختر شهري البداية والنهاية."); return; }
    if (fromMonth > toMonth) { setError("شهر البداية يجب أن يسبق شهر النهاية."); return; }
    setLoading(true);
    setResult(null);
    try {
      const fn = httpsCallable(functions, "getProjectProfitabilityRange");
      const res = await fn({ projectId, fromMonth, toMonth });
      setResult(res.data);
    } catch (e) {
      setError(e.message || "تعذّر حساب التقرير.");
    } finally {
      setLoading(false);
    }
  }

  const company = companyName || "الشركة";
  const exportColumns = [
    { key: "month", header: "الشهر" },
    { key: "workersCount", header: "العمال" },
    { key: "revenue", header: "الإيراد" },
    { key: "netRevenue", header: "صافي الإيراد" },
    { key: "cost", header: "التكلفة" },
    { key: "profit", header: "الربح" },
    { key: "margin", header: "الهامش %" },
  ];
  function buildRows() {
    return (result.months || []).map((m) => ({
      month: m.month,
      workersCount: m.workersCount,
      revenue: m.revenue,
      netRevenue: m.netRevenue,
      cost: m.cost,
      profit: m.profit,
      margin: `${m.margin}%`,
    }));
  }
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("ربحية-المشروع-فترة"), sheetName: "ربحية المشروع" });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("ربحية-المشروع-فترة"), header: { companyName: company, title: `ربحية ${result.projectName}`, subtitle: `من ${result.fromMonth} إلى ${result.toMonth}` } });

  const maxAbsProfit = result && result.months && result.months.length > 0
    ? Math.max(...result.months.map((m) => Math.abs(m.profit)), 1) : 1;

  return (
    <div>
      <div style={styles.controls}>
        <div style={{ flex: 2, minWidth: 180 }}>
          <label style={styles.label}>المشروع</label>
          <select style={styles.input} value={projectId} onChange={(e) => { setProjectId(e.target.value); setResult(null); }} disabled={loadingProjects}>
            <option value="">— اختر المشروع —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} (PRJ-{p.projectNumber})</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label style={styles.label}>من شهر</label>
          <input style={styles.input} type="month" value={fromMonth} onChange={(e) => { setFromMonth(e.target.value); setResult(null); }} dir="ltr" />
        </div>
        <div style={{ flex: 1, minWidth: 130 }}>
          <label style={styles.label}>إلى شهر</label>
          <input style={styles.input} type="month" value={toMonth} onChange={(e) => { setToMonth(e.target.value); setResult(null); }} dir="ltr" />
        </div>
        <button style={styles.computeBtn} onClick={compute} disabled={loading || !projectId}>
          {loading ? "جارٍ الحساب..." : "احسب"}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {result ? (
        <>
          <div style={styles.summaryCard}>
            <div style={styles.summaryHead}>
              <div>
                <h3 style={styles.summaryTitle}>{result.projectName}</h3>
                <span style={styles.summarySub} dir="ltr">PRJ-{result.projectNumber} · {result.fromMonth} ← {result.toMonth} · {result.activeMonths}/{result.monthsCount} شهر نشط</span>
              </div>
              <div style={styles.summaryMargin}>
                <span style={{ ...styles.marginVal, color: profitColor(result.totals.profit) }} dir="ltr">{rNum(result.totals.margin)}%</span>
                <span style={styles.marginLbl}>هامش الفترة</span>
              </div>
            </div>
            <div style={styles.summaryGrid}>
              <SumItem label="إجمالي الإيراد" value={result.totals.revenue} />
              <SumItem label="صافي الإيراد" value={result.totals.netRevenue} />
              <SumItem label="إجمالي التكلفة" value={result.totals.cost} red />
              <SumItem label="إجمالي الربح" value={result.totals.profit} big color={profitColor(result.totals.profit)} />
            </div>
          </div>

          <div style={styles.toolbar}>
            <span style={styles.count}>{result.months.length} شهر</span>
            <div style={styles.toolBtns}>
              <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
              <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
            </div>
          </div>

          {/* مخطط أعمدة نصي للربح الشهري */}
          <div style={styles.chartWrap}>
            <div style={styles.chartBars}>
              {result.months.map((m) => {
                const heightPct = Math.max(2, (Math.abs(m.profit) / maxAbsProfit) * 100);
                const isNeg = m.profit < 0;
                return (
                  <div key={m.month} style={styles.chartCol}>
                    <div style={styles.chartBarArea}>
                      <div style={{ ...styles.chartBar, height: `${heightPct}%`, background: profitColor(m.profit) }} title={`${rNum(m.profit)} ﷼`} />
                    </div>
                    <span style={{ ...styles.chartVal, color: profitColor(m.profit) }} dir="ltr">{m.profit !== 0 ? rNum(m.profit) : "—"}</span>
                    <span style={styles.chartLbl} dir="ltr">{m.month.slice(2)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>الشهر</th>
                  <th style={styles.th}>العمال</th>
                  <th style={styles.th}>الإيراد</th>
                  <th style={styles.th}>صافي الإيراد</th>
                  <th style={styles.th}>التكلفة</th>
                  <th style={styles.th}>الربح</th>
                  <th style={styles.th}>الهامش</th>
                </tr>
              </thead>
              <tbody>
                {result.months.map((m) => (
                  <tr key={m.month}>
                    <td style={styles.td} dir="ltr">{m.month}</td>
                    <td style={styles.td} dir="ltr">{m.workersCount}</td>
                    <td style={styles.td} dir="ltr">{rNum(m.revenue)}</td>
                    <td style={styles.td} dir="ltr">{rNum(m.netRevenue)}</td>
                    <td style={styles.tdRed} dir="ltr">{rNum(m.cost)}</td>
                    <td style={{ ...styles.td, color: profitColor(m.profit), fontWeight: 700 }} dir="ltr">{rNum(m.profit)}</td>
                    <td style={{ ...styles.td, color: profitColor(m.profit) }} dir="ltr">{rNum(m.margin)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : !loading ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📈</div>
          <p style={styles.muted}>اختر مشروعًا ونطاق الأشهر ثم اضغط «احسب».</p>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// تقرير ربحية العامل
// ═══════════════════════════════════════════════════════
function WorkerReport({ tenantId, companyName }) {
  const [workers, setWorkers] = useState([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [workerUid, setWorkerUid] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingWorkers(true);
      try {
        const snap = await getDocs(query(collection(db, "users"), where("tenantId", "==", tenantId)));
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => u.role === "worker")
          .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
        setWorkers(list);
      } catch (e) {
        setError("تعذّر تحميل العمال.");
      } finally {
        setLoadingWorkers(false);
      }
    })();
  }, []);

  async function compute() {
    setError("");
    if (!workerUid) { setError("اختر العامل."); return; }
    if (!/^\d{4}-\d{2}$/.test(month)) { setError("اختر الشهر."); return; }
    setLoading(true);
    setResult(null);
    try {
      const fn = httpsCallable(functions, "getWorkerProfitabilityByMonth");
      const res = await fn({ workerUid, month });
      setResult(res.data);
    } catch (e) {
      setError(e.message || "تعذّر حساب التقرير.");
    } finally {
      setLoading(false);
    }
  }

  const company = companyName || "الشركة";
  const exportColumns = [
    { key: "projectName", header: "المشروع" },
    { key: "rentalPeriod", header: "نوع التأجير" },
    { key: "revenue", header: "الإيراد" },
    { key: "absence", header: "أيام الغياب" },
    { key: "netRevenue", header: "صافي الإيراد" },
    { key: "cost", header: "التكلفة" },
    { key: "profit", header: "الربح" },
    { key: "margin", header: "الهامش %" },
  ];
  const periodLabel = (p) => ({ hourly: "ساعي", daily: "يومي", monthly: "شهري", yearly: "سنوي" }[p] || p || "");
  function buildRows() {
    return (result.lines || []).filter((l) => !l.missingCost).map((l) => ({
      projectName: `${l.projectName || "—"} (PRJ-${l.projectNumber || "?"})`,
      rentalPeriod: periodLabel(l.rentalPeriod),
      revenue: l.revenueProrated,
      absence: l.actualAbsenceDays,
      netRevenue: l.netRevenue,
      cost: l.actualCost,
      profit: l.profit,
      margin: `${l.margin}%`,
    }));
  }
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("ربحية-العامل"), sheetName: "ربحية العامل" });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("ربحية-العامل"), header: { companyName: company, title: `ربحية العامل: ${result.workerName}`, subtitle: `عن شهر ${result.month}` } });

  const validLines = result ? result.lines.filter((l) => !l.missingCost) : [];
  const missingLines = result ? result.lines.filter((l) => l.missingCost) : [];

  return (
    <div>
      <div style={styles.controls}>
        <div style={{ flex: 2, minWidth: 180 }}>
          <label style={styles.label}>العامل</label>
          <select style={styles.input} value={workerUid} onChange={(e) => { setWorkerUid(e.target.value); setResult(null); }} disabled={loadingWorkers}>
            <option value="">— اختر العامل —</option>
            {workers.map((w) => <option key={w.id} value={w.id}>{w.name}{w.employeeNumber ? ` (${w.employeeNumber})` : ""}</option>)}
          </select>
          {!loadingWorkers && workers.length === 0 ? <span style={styles.hint}>لا يوجد عمال مسجّلون بعد.</span> : null}
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label style={styles.label}>الشهر</label>
          <input style={styles.input} type="month" value={month} onChange={(e) => { setMonth(e.target.value); setResult(null); }} dir="ltr" />
        </div>
        <button style={styles.computeBtn} onClick={compute} disabled={loading || !workerUid}>
          {loading ? "جارٍ الحساب..." : "احسب"}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {result ? (
        <>
          <div style={styles.summaryCard}>
            <div style={styles.summaryHead}>
              <div>
                <h3 style={styles.summaryTitle}>{result.workerName}</h3>
                <span style={styles.summarySub} dir="ltr">{result.workerJobTitle || "—"} · {result.month} · {result.assignmentsCount} إسناد</span>
              </div>
              <div style={styles.summaryMargin}>
                <span style={{ ...styles.marginVal, color: profitColor(result.totals.profit) }} dir="ltr">{rNum(result.totals.margin)}%</span>
                <span style={styles.marginLbl}>هامش الربح</span>
              </div>
            </div>
            <div style={styles.summaryGrid}>
              <SumItem label="إجمالي الإيراد" value={result.totals.revenue} />
              <SumItem label="صافي الإيراد" value={result.totals.netRevenue} />
              <SumItem label="التكلفة" value={result.totals.cost} red />
              <SumItem label="صافي الربح" value={result.totals.profit} big color={profitColor(result.totals.profit)} />
            </div>
          </div>

          {missingLines.length > 0 ? (
            <div style={styles.warnBox}>
              ⚠️ هذا العامل مُسنَد في {missingLines.length} مشروع بلا تكلفة محددة (غير محتسب). حدّد تكلفته من الموارد البشرية.
            </div>
          ) : null}

          {validLines.length === 0 ? (
            <div style={styles.empty}><p style={styles.muted}>لا توجد إسنادات نشطة محتسبة لهذا العامل في هذا الشهر.</p></div>
          ) : (
            <>
              <div style={styles.toolbar}>
                <span style={styles.count}>{validLines.length} إسناد</span>
                <div style={styles.toolBtns}>
                  <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
                  <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
                </div>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>المشروع</th>
                      <th style={styles.th}>التأجير</th>
                      <th style={styles.th}>الإيراد</th>
                      <th style={styles.th}>غياب</th>
                      <th style={styles.th}>صافي الإيراد</th>
                      <th style={styles.th}>التكلفة</th>
                      <th style={styles.th}>الربح</th>
                      <th style={styles.th}>الهامش</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validLines.map((l) => (
                      <tr key={l.assignmentId}>
                        <td style={styles.td}>
                          <div style={styles.cellName}>{l.projectName || "—"}</div>
                          <div style={styles.cellSub} dir="ltr">PRJ-{l.projectNumber || "?"}</div>
                        </td>
                        <td style={styles.td}>{periodLabel(l.rentalPeriod)}</td>
                        <td style={styles.td} dir="ltr">{rNum(l.revenueProrated)}</td>
                        <td style={styles.td}>
                          <span style={l.actualAbsenceDays > 0 ? styles.absTag : styles.absZero}>{l.actualAbsenceDays}</span>
                        </td>
                        <td style={styles.td} dir="ltr">{rNum(l.netRevenue)}</td>
                        <td style={styles.tdRed} dir="ltr">{rNum(l.actualCost)}</td>
                        <td style={{ ...styles.td, color: profitColor(l.profit), fontWeight: 700 }} dir="ltr">{rNum(l.profit)}</td>
                        <td style={{ ...styles.td, color: profitColor(l.profit) }} dir="ltr">{rNum(l.margin)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      ) : !loading ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>👷</div>
          <p style={styles.muted}>اختر عاملًا وشهرًا ثم اضغط «احسب».</p>
        </div>
      ) : null}
    </div>
  );
}

// عنصر ملخّص
function SumItem({ label, value, red, big, color }) {
  const valStyle = big
    ? { ...styles.sumNumBig, color: color || "#0f172a" }
    : red
      ? styles.sumNumRed
      : styles.sumNum;
  return (
    <div style={styles.sumItem}>
      <span style={styles.sumLbl}>{label}</span>
      <span style={valStyle} dir="ltr">{rNum(value)} ﷼</span>
    </div>
  );
}

const styles = {
  infoBar: { padding: "12px 16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, fontSize: 13, color: "#15803d", marginBottom: 16, lineHeight: 1.6 },

  typeGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 20 },
  typeCard: { display: "flex", flexDirection: "column", gap: 4, padding: "14px 16px", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 10, cursor: "pointer", textAlign: "right" },
  typeCardActive: { borderColor: "#16a34a", background: "#f0fdf4" },
  typeCardLabel: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  typeCardDesc: { fontSize: 12, color: "#64748b" },

  controls: { display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", padding: 16, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10 },
  label: { display: "block", margin: "0 0 6px", fontSize: 13, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  hint: { display: "block", fontSize: 11, color: "#94a3b8", marginTop: 4 },
  computeBtn: { padding: "10px 24px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer", height: 42 },

  summaryCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 16 },
  summaryHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9", flexWrap: "wrap", gap: 12 },
  summaryTitle: { margin: 0, fontSize: 18, color: "#0f172a" },
  summarySub: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  summaryMargin: { display: "flex", flexDirection: "column", alignItems: "center" },
  marginVal: { fontSize: 28, fontWeight: 700 },
  marginLbl: { fontSize: 11, color: "#94a3b8" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 },
  sumItem: { display: "flex", flexDirection: "column", gap: 5, padding: "12px 14px", background: "#f8fafc", borderRadius: 8 },
  sumLbl: { fontSize: 12, color: "#64748b" },
  sumNum: { fontSize: 18, fontWeight: 700, color: "#0f172a" },
  sumNumRed: { fontSize: 18, fontWeight: 700, color: "#dc2626" },
  sumNumBig: { fontSize: 22, fontWeight: 700 },
  warnRow: { marginTop: 14, padding: "10px 12px", background: "#fffbeb", border: "1px solid #fcd97e", borderRadius: 8, fontSize: 13, color: "#92400e" },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fcd97e", borderRadius: 8, fontSize: 14, color: "#92400e", marginBottom: 16 },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 10 },
  count: { fontSize: 14, color: "#64748b", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },

  tableWrap: { overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 4, marginBottom: 12 },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 680 },
  th: { textAlign: "right", padding: "10px", fontSize: 12, color: "#64748b", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" },
  td: { padding: "10px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" },
  tdRed: { padding: "10px", fontSize: 13, color: "#dc2626", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" },
  cellName: { fontWeight: 600, fontSize: 13 },
  cellSub: { fontSize: 11, color: "#94a3b8", fontFamily: "monospace" },
  absTag: { background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  absZero: { color: "#cbd5e1", fontSize: 13 },

  compareList: { display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 },
  compareRow: { display: "flex", gap: 12, alignItems: "stretch", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 },
  compareRank: { display: "flex", alignItems: "center", justifyContent: "center", width: 36, height: 36, borderRadius: "50%", background: "#f0fdf4", color: "#16a34a", fontWeight: 700, fontSize: 16, flexShrink: 0 },
  compareBody: { flex: 1, minWidth: 0 },
  compareTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 },
  compareName: { fontSize: 15, fontWeight: 600, color: "#0f172a" },
  compareProfit: { fontSize: 15, fontWeight: 700 },
  barTrack: { width: "100%", height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginBottom: 8 },
  barFill: { height: "100%", borderRadius: 4 },
  compareMeta: { display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "#64748b" },

  chartWrap: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 12px", marginBottom: 12, overflowX: "auto" },
  chartBars: { display: "flex", gap: 8, alignItems: "flex-end", minWidth: 320, minHeight: 160 },
  chartCol: { flex: 1, minWidth: 44, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 },
  chartBarArea: { width: "100%", height: 120, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  chartBar: { width: "70%", maxWidth: 40, borderRadius: "4px 4px 0 0", minHeight: 2, transition: "height 0.2s" },
  chartVal: { fontSize: 10, fontWeight: 600, fontFamily: "monospace", whiteSpace: "nowrap" },
  chartLbl: { fontSize: 10, color: "#94a3b8", fontFamily: "monospace" },

  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
};
