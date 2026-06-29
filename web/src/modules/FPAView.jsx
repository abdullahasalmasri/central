import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";
import { exportToPDF, datedFileName } from "../exportUtils";

/* ============================================================
   التخطيط والتحليل المالي (FP&A) — قسم المالية
   تقرير شامل: مؤشرات + اتجاهات + نِسب + تنبؤ + توصيات
   كل التحليل محسوب من القيود والفواتير الفعلية عبر getFinancialAnalysis.
   ============================================================ */

const fmt = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt2 = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctTxt = (n) => n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const ratioTxt = (n) => n == null ? "—" : n.toFixed(2);
const monthLabel = (k) => { const [, m] = k.split("-"); return ["", "ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"][parseInt(m, 10)] || m; };

function nextMonthKeys(asOf, n) {
  const keys = [];
  let cy = parseInt(asOf.slice(0, 4), 10);
  let cm = parseInt(asOf.slice(5, 7), 10);
  for (let i = 0; i < n; i++) {
    cm++; if (cm === 13) { cm = 1; cy++; }
    keys.push(`${cy}-${String(cm).padStart(2, "0")}`);
  }
  return keys;
}

const TABS = [
  { id: "overview", label: "نظرة عامة" },
  { id: "trends", label: "الاتجاهات" },
  { id: "ratios", label: "النِسب المالية" },
  { id: "forecast", label: "التنبؤ" },
  { id: "recommendations", label: "التوصيات" },
];

export default function FPAView() {
  const [companyName, setCompanyName] = useState("الشركة");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) return;
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) return;
        const tSnap = await getDoc(doc(db, "tenants", tid));
        if (tSnap.exists() && tSnap.data().name) setCompanyName(tSnap.data().name);
      } catch (e) { /* اسم المنشأة اختياري */ }
    })();
  }, []);

  async function generate() {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const fn = httpsCallable(functions, "getFinancialAnalysis");
      const r = await fn({});
      setData(r.data);
    } catch (e) {
      setError(e.message || "تعذّر إنشاء التحليل.");
    } finally {
      setLoading(false);
    }
  }

  function exportReport() {
    if (!data) return;
    const k = data.kpis, rt = data.ratios, f = data.forecast, ag = data.receivablesAging;
    const rows = [
      { label: "■ المؤشرات الرئيسية", value: "" },
      { label: "إجمالي الإيرادات", value: fmt2(k.totalRevenue) },
      { label: "إجمالي المصروفات", value: fmt2(k.totalExpense) },
      { label: "صافي الربح", value: fmt2(k.netProfit) },
      { label: "هامش صافي الربح", value: pctTxt(k.netMargin) },
      { label: "النقد المتاح", value: fmt2(k.cash) },
      { label: "الذمم المدينة", value: fmt2(k.totalReceivables) },
      { label: "معدّل التحصيل", value: pctTxt(k.collectionRate) },
      { label: "مؤشر الصحة المالية", value: `${data.health.score}/100 (${data.health.label})` },
      { label: "■ النِسب المالية", value: "" },
      { label: "نسبة التداول (السيولة)", value: ratioTxt(rt.currentRatio) },
      { label: "نسبة النقد", value: ratioTxt(rt.cashRatio) },
      { label: "هامش الربح الإجمالي", value: pctTxt(rt.grossMargin) },
      { label: "نسبة المصروفات التشغيلية", value: pctTxt(rt.opexRatio) },
      { label: "متوسط فترة التحصيل (يوم)", value: rt.dso == null ? "—" : String(rt.dso) },
      { label: "■ أعمار الذمم المدينة", value: "" },
      { label: "0-30 يوم", value: fmt2(ag.d0_30) },
      { label: "31-60 يوم", value: fmt2(ag.d31_60) },
      { label: "61-90 يوم", value: fmt2(ag.d61_90) },
      { label: "أكثر من 90 يوم", value: fmt2(ag.d90plus) },
      { label: "■ التنبؤ (الأشهر الثلاثة القادمة)", value: "" },
      { label: "متوسط الإيراد الشهري", value: fmt2(f.avgMonthlyRevenue) },
      { label: "متوسط المصروف الشهري", value: fmt2(f.avgMonthlyExpense) },
      { label: "إيراد التعادل الشهري", value: fmt2(f.breakEvenRevenue) },
      { label: "أشهر الأمان النقدي", value: f.runwayMonths == null ? "—" : ratioTxt(f.runwayMonths) },
      { label: "الإيراد المتوقع (شهر +1)", value: fmt2(f.forecastRevenue[0]) },
      { label: "الإيراد المتوقع (شهر +2)", value: fmt2(f.forecastRevenue[1]) },
      { label: "الإيراد المتوقع (شهر +3)", value: fmt2(f.forecastRevenue[2]) },
      { label: "■ التوصيات", value: "" },
    ];
    data.recommendations.forEach((rec, i) => {
      const tag = rec.priority === "high" ? "[عالية] " : rec.priority === "medium" ? "[متوسطة] " : "[معلومة] ";
      rows.push({ label: `${i + 1}. ${tag}${rec.area}`, value: "" });
      rows.push({ label: `الملاحظة: ${rec.observation}`, value: "" });
      rows.push({ label: `التوصية: ${rec.action}`, value: "" });
      rows.push({ label: `المخرج المتوقع: ${rec.expectedOutcome}`, value: "" });
    });
    exportToPDF({
      rows,
      columns: [{ key: "label", header: "البند" }, { key: "value", header: "القيمة" }],
      fileName: datedFileName("التقرير-المالي-التحليلي"),
      header: { companyName: companyName || "الشركة", title: "التقرير المالي والتحليلي (FP&A)", subtitle: `كما في ${data.asOf}` },
    });
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>التخطيط والتحليل المالي</h1>
          <p style={styles.pageSub}>تقرير شامل من بياناتك الفعلية: مؤشرات، اتجاهات، نِسب، تنبؤ، وتوصيات قابلة للتنفيذ.</p>
        </div>
        <div style={styles.topBtns}>
          {data ? <button style={styles.exportBtn} onClick={exportReport}>⬇ تصدير التقرير PDF</button> : null}
          <button style={styles.genBtn} onClick={generate} disabled={loading}>
            {loading ? "جارٍ التحليل..." : data ? "↻ تحديث" : "📊 إنشاء التحليل"}
          </button>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {!data && !loading ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📈</div>
          <p style={styles.emptyTitle}>تقرير مالي تحليلي شامل</p>
          <p style={styles.muted}>اضغط «إنشاء التحليل» ليقرأ النظام قيودك وفواتيرك ويبني تقريرًا متكاملاً مع توصيات.</p>
        </div>
      ) : null}

      {loading ? <div style={styles.empty}><p style={styles.muted}>جارٍ تحليل بياناتك المالية...</p></div> : null}

      {data ? (
        <>
          <HealthBanner health={data.health} kpis={data.kpis} />

          <div style={styles.tabs}>
            {TABS.map((t) => {
              const isRec = t.id === "recommendations";
              const recCount = data.recommendations.filter((r) => r.priority === "high").length;
              return (
                <button key={t.id} style={{ ...styles.tab, ...(tab === t.id ? styles.tabActive : {}) }} onClick={() => setTab(t.id)}>
                  {t.label}
                  {isRec && recCount > 0 ? <span style={styles.badge}>{recCount}</span> : null}
                </button>
              );
            })}
          </div>

          {tab === "overview" && <OverviewTab data={data} />}
          {tab === "trends" && <TrendsTab data={data} />}
          {tab === "ratios" && <RatiosTab data={data} />}
          {tab === "forecast" && <ForecastTab data={data} />}
          {tab === "recommendations" && <RecommendationsTab data={data} />}
        </>
      ) : null}
    </div>
  );
}

// ═══════════ شريط الصحة المالية ═══════════
function HealthBanner({ health, kpis }) {
  const color = health.score >= 80 ? "#059669" : health.score >= 60 ? "#16a34a" : health.score >= 40 ? "#d97706" : "#dc2626";
  return (
    <div style={styles.healthBanner}>
      <HealthGauge score={health.score} color={color} />
      <div style={styles.healthInfo}>
        <div style={styles.healthLabelRow}>
          <span style={styles.healthTitle}>الصحة المالية</span>
          <span style={{ ...styles.healthBadge, background: color }}>{health.label}</span>
        </div>
        <div style={styles.healthKpis}>
          <MiniKpi label="صافي الربح" value={fmt(kpis.netProfit)} unit="﷼" pos={kpis.netProfit >= 0} />
          <MiniKpi label="هامش الربح" value={pctTxt(kpis.netMargin)} pos={(kpis.netMargin || 0) >= 0.1} />
          <MiniKpi label="النقد المتاح" value={fmt(kpis.cash)} unit="﷼" pos={kpis.cash >= 0} />
          <MiniKpi label="معدّل التحصيل" value={pctTxt(kpis.collectionRate)} pos={(kpis.collectionRate || 0) >= 0.7} />
        </div>
      </div>
    </div>
  );
}

function HealthGauge({ score, color }) {
  const R = 52, CX = 60, CY = 60;
  const circ = Math.PI * R; // نصف دائرة
  const filled = (score / 100) * circ;
  return (
    <svg viewBox="0 0 120 78" style={styles.gauge}>
      <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
      <path d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${filled} ${circ}`} />
      <text x={CX} y={CY - 8} textAnchor="middle" style={{ fontSize: 26, fontWeight: 800, fill: color }}>{score}</text>
      <text x={CX} y={CY + 8} textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8" }}>من 100</text>
    </svg>
  );
}

function MiniKpi({ label, value, unit, pos }) {
  return (
    <div style={styles.miniKpi}>
      <span style={styles.miniKpiLabel}>{label}</span>
      <span style={{ ...styles.miniKpiValue, color: pos ? "#0f172a" : "#dc2626" }} dir="ltr">{value}{unit ? ` ${unit}` : ""}</span>
    </div>
  );
}

// ═══════════ تبويب: نظرة عامة ═══════════
function OverviewTab({ data }) {
  const k = data.kpis;
  return (
    <div>
      <div style={styles.kpiGrid}>
        <KpiCard label="إجمالي الإيرادات" value={fmt(k.totalRevenue)} unit="﷼" accent="#059669" />
        <KpiCard label="إجمالي المصروفات" value={fmt(k.totalExpense)} unit="﷼" accent="#dc2626" />
        <KpiCard label="صافي الربح" value={fmt(k.netProfit)} unit="﷼" accent={k.netProfit >= 0 ? "#059669" : "#dc2626"} />
        <KpiCard label="الذمم المدينة" value={fmt(k.totalReceivables)} unit="﷼" accent="#d97706" />
      </div>

      <div style={styles.twoCol}>
        <div style={styles.panelCard}>
          <h3 style={styles.cardTitle}>تركيبة الإيرادات</h3>
          {data.revenueComposition.length ? <CompBars items={data.revenueComposition} color="#059669" /> : <p style={styles.muted}>لا توجد إيرادات.</p>}
        </div>
        <div style={styles.panelCard}>
          <h3 style={styles.cardTitle}>تركيبة المصروفات</h3>
          {data.expenseComposition.length ? <CompBars items={data.expenseComposition} color="#dc2626" /> : <p style={styles.muted}>لا توجد مصروفات.</p>}
        </div>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.panelCard}>
          <h3 style={styles.cardTitle}>أكبر العملاء</h3>
          {data.topCustomers.length ? data.topCustomers.map((c, i) => (
            <div key={i} style={styles.custRow}>
              <span style={styles.custName}>{c.name}</span>
              <div style={styles.custBarWrap}>
                <div style={{ ...styles.custBar, width: `${Math.max(4, c.pct * 100)}%` }} />
              </div>
              <span style={styles.custVal} dir="ltr">{fmt(c.total)} · {(c.pct * 100).toFixed(0)}%</span>
            </div>
          )) : <p style={styles.muted}>لا يوجد عملاء.</p>}
        </div>
        <div style={styles.panelCard}>
          <h3 style={styles.cardTitle}>أعمار الذمم المدينة</h3>
          <AgingView aging={data.receivablesAging} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, unit, accent }) {
  return (
    <div style={{ ...styles.kpiCard, borderTopColor: accent }}>
      <span style={styles.kpiLabel}>{label}</span>
      <span style={{ ...styles.kpiValue, color: accent }} dir="ltr">{value}</span>
      <span style={styles.kpiUnit}>{unit}</span>
    </div>
  );
}

function CompBars({ items, color }) {
  const max = Math.max(...items.map((x) => x.amount), 1);
  return (
    <div>
      {items.slice(0, 6).map((x, i) => (
        <div key={i} style={styles.compRow}>
          <span style={styles.compName}>{x.name}</span>
          <div style={styles.compBarWrap}>
            <div style={{ ...styles.compBar, width: `${Math.max(3, (x.amount / max) * 100)}%`, background: color }} />
          </div>
          <span style={styles.compVal} dir="ltr">{fmt(x.amount)}</span>
        </div>
      ))}
    </div>
  );
}

function AgingView({ aging }) {
  const buckets = [
    { label: "0-30 يوم", value: aging.d0_30, color: "#059669" },
    { label: "31-60 يوم", value: aging.d31_60, color: "#65a30d" },
    { label: "61-90 يوم", value: aging.d61_90, color: "#d97706" },
    { label: "أكثر من 90 يوم", value: aging.d90plus, color: "#dc2626" },
  ];
  const total = buckets.reduce((s, b) => s + b.value, 0);
  if (total < 0.01) return <p style={styles.muted}>لا توجد ذمم غير محصّلة. 👍</p>;
  return (
    <div>
      <div style={styles.agingBar}>
        {buckets.map((b, i) => b.value > 0 ? (
          <div key={i} style={{ width: `${(b.value / total) * 100}%`, background: b.color }} title={b.label} />
        ) : null)}
      </div>
      {buckets.map((b, i) => (
        <div key={i} style={styles.agingRow}>
          <span style={styles.agingDot}><span style={{ ...styles.dot, background: b.color }} />{b.label}</span>
          <span dir="ltr" style={{ fontWeight: b.value > 0 ? 700 : 400, color: b.value > 0 ? "#0f172a" : "#cbd5e1" }}>{fmt(b.value)} ﷼</span>
        </div>
      ))}
    </div>
  );
}

// ═══════════ تبويب: الاتجاهات ═══════════
function TrendsTab({ data }) {
  const t = data.monthlyTrends;
  return (
    <div>
      <div style={styles.panelCard}>
        <h3 style={styles.cardTitle}>الإيرادات والمصروفات (آخر 12 شهرًا)</h3>
        <BarTrend data={t} />
        <div style={styles.legend}>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#059669" }} />الإيرادات</span>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#dc2626" }} />المصروفات</span>
        </div>
      </div>

      <div style={styles.panelCard}>
        <h3 style={styles.cardTitle}>صافي الربح الشهري</h3>
        <NetTrend data={t} />
      </div>

      <div style={styles.panelCard}>
        <h3 style={styles.cardTitle}>صافي التدفق النقدي الشهري</h3>
        <NetTrend data={t} field="cashFlow" posColor="#0ea5e9" />
      </div>
    </div>
  );
}

function BarTrend({ data }) {
  const W = 720, H = 240, padL = 8, padR = 8, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(...data.map((d) => Math.max(d.revenue, d.expense)), 1);
  const slot = innerW / data.length;
  const bw = Math.min(14, slot / 3);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={styles.chart}>
      {[0.25, 0.5, 0.75, 1].map((g, i) => (
        <line key={i} x1={padL} y1={padT + innerH * (1 - g)} x2={W - padR} y2={padT + innerH * (1 - g)} stroke="#f1f5f9" strokeWidth="1" />
      ))}
      {data.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const rh = (d.revenue / max) * innerH;
        const eh = (d.expense / max) * innerH;
        return (
          <g key={i}>
            <rect x={cx - bw - 1} y={padT + innerH - rh} width={bw} height={rh} fill="#059669" rx="2" />
            <rect x={cx + 1} y={padT + innerH - eh} width={bw} height={eh} fill="#dc2626" rx="2" />
            <text x={cx} y={H - 9} textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8" }}>{monthLabel(d.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function NetTrend({ data, field = "netProfit", posColor = "#059669" }) {
  const W = 720, H = 200, padL = 8, padR = 8, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const vals = data.map((d) => d[field]);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const zeroY = padT + innerH * (max / range);
  const slot = innerW / data.length;
  const bw = Math.min(22, slot * 0.55);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={styles.chart}>
      <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#cbd5e1" strokeWidth="1" />
      {data.map((d, i) => {
        const v = d[field];
        const cx = padL + slot * i + slot / 2;
        const h = (Math.abs(v) / range) * innerH;
        const y = v >= 0 ? zeroY - h : zeroY;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={y} width={bw} height={h} fill={v >= 0 ? posColor : "#dc2626"} rx="2" />
            <text x={cx} y={H - 9} textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8" }}>{monthLabel(d.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ═══════════ تبويب: النِسب المالية ═══════════
function RatiosTab({ data }) {
  const rt = data.ratios;
  const ratios = [
    { label: "نسبة التداول (السيولة)", value: ratioTxt(rt.currentRatio), hint: "الأصول المتداولة ÷ الخصوم المتداولة", good: rt.currentRatio == null || rt.currentRatio >= 1, ideal: "المثالي: أكبر من 1.5" },
    { label: "نسبة النقد", value: ratioTxt(rt.cashRatio), hint: "النقد ÷ الخصوم المتداولة", good: rt.cashRatio == null || rt.cashRatio >= 0.5, ideal: "المثالي: أكبر من 0.5" },
    { label: "هامش الربح الإجمالي", value: pctTxt(rt.grossMargin), hint: "(الإيراد − تكلفة المبيعات) ÷ الإيراد", good: rt.grossMargin == null || rt.grossMargin >= 0.2, ideal: "كلما زاد كان أفضل" },
    { label: "هامش صافي الربح", value: pctTxt(data.kpis.netMargin), hint: "صافي الربح ÷ الإيراد", good: data.kpis.netMargin == null || data.kpis.netMargin >= 0.1, ideal: "المثالي: أكبر من 10%" },
    { label: "نسبة المصروفات التشغيلية", value: pctTxt(rt.opexRatio), hint: "المصروفات التشغيلية ÷ الإيراد", good: rt.opexRatio == null || rt.opexRatio <= 0.3, ideal: "كلما قلّ كان أفضل" },
    { label: "متوسط فترة التحصيل (DSO)", value: rt.dso == null ? "—" : `${rt.dso} يوم`, hint: "متوسط الأيام لتحصيل الفواتير", good: rt.dso == null || rt.dso <= 60, ideal: "المثالي: أقل من 60 يوم" },
  ];
  return (
    <div>
      <div style={styles.ratioGrid}>
        {ratios.map((r, i) => (
          <div key={i} style={styles.ratioCard}>
            <div style={styles.ratioHead}>
              <span style={styles.ratioLabel}>{r.label}</span>
              <span style={{ ...styles.ratioDot, background: r.good ? "#059669" : "#dc2626" }} />
            </div>
            <span style={{ ...styles.ratioValue, color: r.good ? "#0f172a" : "#dc2626" }} dir="ltr">{r.value}</span>
            <span style={styles.ratioHint}>{r.hint}</span>
            <span style={styles.ratioIdeal}>{r.ideal}</span>
          </div>
        ))}
      </div>
      <div style={styles.noteBox}>
        💡 النِسب تُحسب من أرصدة حساباتك الفعلية. النقطة الخضراء = ضمن النطاق الصحي، الحمراء = تحتاج انتباه.
      </div>
    </div>
  );
}

// ═══════════ تبويب: التنبؤ ═══════════
function ForecastTab({ data }) {
  const f = data.forecast;
  const hist = data.monthlyTrends.slice(-6);
  const futureKeys = nextMonthKeys(data.asOf, 3);
  const combined = [
    ...hist.map((m) => ({ month: m.month, value: m.revenue, type: "hist" })),
    ...futureKeys.map((mk, i) => ({ month: mk, value: f.forecastRevenue[i], type: "fcst" })),
  ];
  return (
    <div>
      <div style={styles.forecastCards}>
        <ForecastCard label="متوسط الإيراد الشهري" value={fmt(f.avgMonthlyRevenue)} unit="﷼" />
        <ForecastCard label="إيراد التعادل الشهري" value={fmt(f.breakEvenRevenue)} unit="﷼" hint="الإيراد المطلوب لتغطية المصروفات" />
        <ForecastCard label="أشهر الأمان النقدي" value={f.runwayMonths == null ? "—" : ratioTxt(f.runwayMonths)} unit="شهر" hint="كم تصمد بنقدك الحالي" warn={f.runwayMonths != null && f.runwayMonths < 2} />
      </div>

      <div style={styles.panelCard}>
        <h3 style={styles.cardTitle}>توقّع الإيرادات — الأشهر الثلاثة القادمة</h3>
        <ForecastChart combined={combined} histCount={hist.length} />
        <div style={styles.legend}>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#059669" }} />فعلي</span>
          <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: "#86efac" }} />متوقّع</span>
        </div>
        <p style={styles.forecastMethod}>طريقة التنبؤ: {f.method} — يعتمد على اتجاه آخر 6 أشهر.</p>
      </div>

      <div style={styles.panelCard}>
        <h3 style={styles.cardTitle}>تفاصيل التوقّع</h3>
        <table style={styles.fcstTable}>
          <thead>
            <tr><th style={styles.fcstTh}>الشهر</th><th style={styles.fcstThNum}>الإيراد المتوقّع</th><th style={styles.fcstThNum}>المصروف المتوقّع</th><th style={styles.fcstThNum}>صافي الربح المتوقّع</th></tr>
          </thead>
          <tbody>
            {futureKeys.map((mk, i) => (
              <tr key={i}>
                <td style={styles.fcstTd}>{monthLabel(mk)} {mk.slice(0, 4)}</td>
                <td style={styles.fcstTdNum} dir="ltr">{fmt(f.forecastRevenue[i])}</td>
                <td style={styles.fcstTdNum} dir="ltr">{fmt(f.forecastExpense[i])}</td>
                <td style={{ ...styles.fcstTdNum, fontWeight: 700, color: f.forecastNetProfit[i] >= 0 ? "#059669" : "#dc2626" }} dir="ltr">{fmt(f.forecastNetProfit[i])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={styles.disclaimer}>⚠ التوقّعات تقديرية مبنية على الاتجاه التاريخي، وقد تتأثر بعوامل خارجية (موسمية، عقود جديدة، تغيّر السوق).</p>
      </div>
    </div>
  );
}

function ForecastCard({ label, value, unit, hint, warn }) {
  return (
    <div style={{ ...styles.fcstCard, ...(warn ? styles.fcstCardWarn : {}) }}>
      <span style={styles.fcstCardLabel}>{label}</span>
      <span style={{ ...styles.fcstCardValue, color: warn ? "#dc2626" : "#0f172a" }} dir="ltr">{value} <span style={styles.fcstCardUnit}>{unit}</span></span>
      {hint ? <span style={styles.fcstCardHint}>{hint}</span> : null}
    </div>
  );
}

function ForecastChart({ combined, histCount }) {
  const W = 720, H = 220, padL = 8, padR = 8, padT = 14, padB = 26;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(...combined.map((d) => d.value), 1);
  const slot = innerW / combined.length;
  const bw = Math.min(36, slot * 0.6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={styles.chart}>
      {[0.25, 0.5, 0.75, 1].map((g, i) => (
        <line key={i} x1={padL} y1={padT + innerH * (1 - g)} x2={W - padR} y2={padT + innerH * (1 - g)} stroke="#f1f5f9" strokeWidth="1" />
      ))}
      {histCount > 0 && histCount < combined.length ? (
        <line x1={padL + slot * histCount} y1={padT} x2={padL + slot * histCount} y2={padT + innerH} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 3" />
      ) : null}
      {combined.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const h = (d.value / max) * innerH;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={padT + innerH - h} width={bw} height={h} fill={d.type === "hist" ? "#059669" : "#86efac"} rx="2" />
            <text x={cx} y={H - 9} textAnchor="middle" style={{ fontSize: 10, fill: "#94a3b8" }}>{monthLabel(d.month)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ═══════════ تبويب: التوصيات ═══════════
function RecommendationsTab({ data }) {
  const recs = data.recommendations;
  const counts = {
    high: recs.filter((r) => r.priority === "high").length,
    medium: recs.filter((r) => r.priority === "medium").length,
    low: recs.filter((r) => r.priority === "low").length,
  };
  return (
    <div>
      <div style={styles.recSummary}>
        <span style={styles.recSummaryText}>{recs.length} توصية مبنية على تحليل بياناتك</span>
        <div style={styles.recCounts}>
          {counts.high > 0 ? <span style={{ ...styles.recCount, background: "#fee2e2", color: "#b91c1c" }}>{counts.high} عالية</span> : null}
          {counts.medium > 0 ? <span style={{ ...styles.recCount, background: "#fef3c7", color: "#92400e" }}>{counts.medium} متوسطة</span> : null}
          {counts.low > 0 ? <span style={{ ...styles.recCount, background: "#dbeafe", color: "#1e40af" }}>{counts.low} معلومة</span> : null}
        </div>
      </div>

      {recs.map((rec, i) => <RecCard key={i} rec={rec} index={i + 1} />)}
    </div>
  );
}

function RecCard({ rec, index }) {
  const cfg = rec.priority === "high"
    ? { bg: "#fef2f2", border: "#fecaca", tag: "أولوية عالية", tagBg: "#dc2626" }
    : rec.priority === "medium"
    ? { bg: "#fffbeb", border: "#fde68a", tag: "أولوية متوسطة", tagBg: "#d97706" }
    : { bg: "#eff6ff", border: "#bfdbfe", tag: "معلومة", tagBg: "#2563eb" };
  return (
    <div style={{ ...styles.recCard, background: cfg.bg, borderColor: cfg.border }}>
      <div style={styles.recHead}>
        <span style={styles.recArea}><span style={styles.recNum}>{index}</span>{rec.area}</span>
        <span style={{ ...styles.recTag, background: cfg.tagBg }}>{cfg.tag}</span>
      </div>
      <div style={styles.recBody}>
        <div style={styles.recLine}>
          <span style={styles.recLabel}>الملاحظة</span>
          <span style={styles.recText}>{rec.observation}</span>
        </div>
        <div style={styles.recLine}>
          <span style={styles.recLabel}>التوصية</span>
          <span style={styles.recText}>{rec.action}</span>
        </div>
        <div style={styles.recLine}>
          <span style={{ ...styles.recLabel, color: "#059669" }}>المخرج المتوقّع</span>
          <span style={{ ...styles.recText, fontWeight: 600 }}>{rec.expectedOutcome}</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#059669", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0, maxWidth: 560 },
  topBtns: { display: "flex", gap: 10, flexWrap: "wrap" },
  genBtn: { padding: "11px 22px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#059669", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },
  exportBtn: { padding: "11px 18px", fontSize: 14, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  empty: { padding: 48, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  healthBanner: { display: "flex", gap: 24, alignItems: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px 24px", marginBottom: 20, flexWrap: "wrap" },
  gauge: { width: 130, height: 84, flexShrink: 0 },
  healthInfo: { flex: 1, minWidth: 260 },
  healthLabelRow: { display: "flex", alignItems: "center", gap: 12, marginBottom: 14 },
  healthTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a" },
  healthBadge: { padding: "3px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700, color: "#fff" },
  healthKpis: { display: "flex", gap: 24, flexWrap: "wrap" },
  miniKpi: { display: "flex", flexDirection: "column", gap: 3 },
  miniKpiLabel: { fontSize: 12, color: "#94a3b8" },
  miniKpiValue: { fontSize: 17, fontWeight: 800, fontFamily: "monospace" },

  tabs: { display: "flex", gap: 6, marginBottom: 20, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "none", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: -2, display: "flex", alignItems: "center", gap: 6 },
  tabActive: { color: "#059669", borderBottomColor: "#059669" },
  badge: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 5px", background: "#dc2626", color: "#fff", borderRadius: 9, fontSize: 11, fontWeight: 700 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 20 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderTop: "3px solid", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 4 },
  kpiLabel: { fontSize: 13, color: "#64748b" },
  kpiValue: { fontSize: 26, fontWeight: 800, fontFamily: "monospace" },
  kpiUnit: { fontSize: 12, color: "#94a3b8" },

  twoCol: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16, marginBottom: 20 },
  panelCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", marginBottom: 20 },
  cardTitle: { fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 16px" },

  compRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 9 },
  compName: { fontSize: 13, color: "#475569", width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  compBarWrap: { flex: 1, height: 18, background: "#f1f5f9", borderRadius: 5, overflow: "hidden" },
  compBar: { height: "100%", borderRadius: 5 },
  compVal: { fontSize: 13, fontFamily: "monospace", color: "#0f172a", width: 70, textAlign: "left", flexShrink: 0 },

  custRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  custName: { fontSize: 13, color: "#475569", width: 110, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  custBarWrap: { flex: 1, height: 14, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" },
  custBar: { height: "100%", background: "#3b82f6", borderRadius: 4 },
  custVal: { fontSize: 12, fontFamily: "monospace", color: "#475569", width: 96, textAlign: "left", flexShrink: 0 },

  agingBar: { display: "flex", height: 22, borderRadius: 6, overflow: "hidden", marginBottom: 14, background: "#f1f5f9" },
  agingRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", fontSize: 13, fontFamily: "monospace" },
  agingDot: { display: "flex", alignItems: "center", gap: 8, color: "#475569" },
  dot: { width: 10, height: 10, borderRadius: "50%", display: "inline-block" },

  chart: { width: "100%", height: "auto", display: "block" },
  legend: { display: "flex", gap: 18, justifyContent: "center", marginTop: 10 },
  legendItem: { display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" },
  legendDot: { width: 11, height: 11, borderRadius: 3, display: "inline-block" },

  ratioGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14, marginBottom: 18 },
  ratioCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 5 },
  ratioHead: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  ratioLabel: { fontSize: 13, fontWeight: 600, color: "#334155" },
  ratioDot: { width: 12, height: 12, borderRadius: "50%" },
  ratioValue: { fontSize: 28, fontWeight: 800, fontFamily: "monospace" },
  ratioHint: { fontSize: 12, color: "#94a3b8" },
  ratioIdeal: { fontSize: 11, color: "#cbd5e1", marginTop: 2 },
  noteBox: { padding: "12px 16px", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, fontSize: 13, color: "#065f46" },

  forecastCards: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 20 },
  fcstCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 5 },
  fcstCardWarn: { borderColor: "#fecaca", background: "#fef2f2" },
  fcstCardLabel: { fontSize: 13, color: "#64748b" },
  fcstCardValue: { fontSize: 24, fontWeight: 800, fontFamily: "monospace" },
  fcstCardUnit: { fontSize: 13, fontWeight: 400, color: "#94a3b8" },
  fcstCardHint: { fontSize: 11, color: "#94a3b8" },

  forecastMethod: { fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 10, marginBottom: 0 },
  fcstTable: { width: "100%", borderCollapse: "collapse" },
  fcstTh: { textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  fcstThNum: { textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  fcstTd: { padding: "10px 12px", fontSize: 14, color: "#475569", borderBottom: "1px solid #f1f5f9" },
  fcstTdNum: { padding: "10px 12px", fontSize: 14, textAlign: "left", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" },
  disclaimer: { fontSize: 12, color: "#94a3b8", marginTop: 14, marginBottom: 0, lineHeight: 1.6 },

  recSummary: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 },
  recSummaryText: { fontSize: 14, fontWeight: 600, color: "#334155" },
  recCounts: { display: "flex", gap: 8 },
  recCount: { padding: "4px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700 },

  recCard: { border: "1px solid", borderRadius: 12, padding: "16px 20px", marginBottom: 14 },
  recHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 },
  recArea: { display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 700, color: "#0f172a" },
  recNum: { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, background: "rgba(15,23,42,.08)", borderRadius: "50%", fontSize: 13, fontWeight: 800 },
  recTag: { padding: "3px 12px", borderRadius: 16, fontSize: 12, fontWeight: 700, color: "#fff" },
  recBody: { display: "flex", flexDirection: "column", gap: 10 },
  recLine: { display: "flex", gap: 12 },
  recLabel: { fontSize: 12, fontWeight: 700, color: "#64748b", width: 90, flexShrink: 0, paddingTop: 1 },
  recText: { fontSize: 14, color: "#334155", lineHeight: 1.6, flex: 1 },
};
