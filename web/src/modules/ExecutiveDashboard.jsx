import React, { useState, useEffect } from "react";
import {
  Banknote, TrendingUp, Receipt, Wallet, HardHat, Gauge,
  FolderKanban, UserRoundCheck, ArrowUpRight, ArrowDownRight,
  Calendar, ChevronDown, Crown
} from "lucide-react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   لوحة المؤشرات — الإدارة العليا
   البيانات هنا تجريبية. نقاط الربط بدوالك مكتوبة بجانب كل مجموعة.
   ============================================================ */

// helpers — البيانات تأتي من getEnterpriseProfitability + Range + getDepreciation
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString("en-US");
const MONTH_NAMES = ["ينا", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];
const monthName = (m) => { const [, mo] = m.split("-").map(Number); return MONTH_NAMES[mo - 1] || m; };
const thisMonthStr = () => new Date().toISOString().slice(0, 7);

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .ed-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .ed-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  /* HEAD */
  .ed-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .ed-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#7c3aed1a; color:#7c3aed; flex-shrink:0}
  .ed-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .ed-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .ed-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .ed-period:hover{border-color:#b9c2d4}
  .ed-period svg:first-child{color:#7c3aed}

  /* KPI CARDS */
  .ed-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:14px}
  .ed-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:18px 19px;
    position:relative; overflow:hidden}
  .ed-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .ed-kpi-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:14px}
  .ed-kpi-ic{width:40px; height:40px; border-radius:11px; display:grid; place-items:center;
    background:color-mix(in srgb, var(--c) 14%, transparent); color:var(--c)}
  .ed-delta{display:inline-flex; align-items:center; gap:3px; font-size:12.5px; font-weight:700;
    padding:3px 9px; border-radius:999px}
  .ed-delta.good{color:#15803d; background:#dcfce7}
  .ed-delta.bad{color:#b91c1c; background:#fee2e2}
  .ed-kpi-label{font-size:13px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .ed-kpi-val{font-size:25px; font-weight:700}
  .ed-kpi-val .u{font-size:14px; color:var(--ink3); font-weight:600; margin-right:3px}
  .ed-kpi-sub{font-size:11.5px; color:var(--ink3); margin-top:3px; font-weight:500}

  /* OPS */
  .ed-ops{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:14px}
  .ed-op{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px}
  .ed-op-top{display:flex; align-items:center; gap:10px; margin-bottom:13px}
  .ed-op-ic{width:34px; height:34px; border-radius:9px; display:grid; place-items:center;
    background:color-mix(in srgb, var(--c) 14%, transparent); color:var(--c); flex-shrink:0}
  .ed-op-label{font-size:12.5px; color:var(--ink2); font-weight:600}
  .ed-op-val{font-size:26px; font-weight:700}
  .ed-op-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:5px}
  .ed-op-bar{height:7px; background:#eef1f6; border-radius:999px; overflow:hidden; margin-top:11px}
  .ed-op-bar i{display:block; height:100%; border-radius:999px; background:var(--c)}

  /* CHARTS ROW */
  .ed-row{display:grid; grid-template-columns:1.55fr 1fr; gap:14px}
  .ed-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .ed-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .ed-card-title{font-size:15.5px; font-weight:700}
  .ed-legend{display:flex; gap:14px}
  .ed-leg{display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink2); font-weight:500}
  .ed-leg b{width:10px; height:10px; border-radius:3px; display:block}

  .ed-chart-wrap{width:100%}
  .ed-chart-wrap svg{width:100%; height:auto; display:block; overflow:visible}
  .ed-xlabels{display:flex; justify-content:space-between; margin-top:9px; padding:0 2px}
  .ed-xlabels span{font-size:11.5px; color:var(--ink3); font-weight:600}

  /* PROJECTS */
  .ed-proj{display:flex; flex-direction:column; gap:13px}
  .ed-proj-item{}
  .ed-proj-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; gap:10px}
  .ed-proj-rank{display:flex; align-items:center; gap:8px; min-width:0}
  .ed-proj-n{width:21px; height:21px; border-radius:6px; background:#7c3aed14; color:#7c3aed;
    font-size:11px; font-weight:800; display:grid; place-items:center; flex-shrink:0}
  .ed-proj-name{font-size:13px; font-weight:600; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
  .ed-proj-val{font-size:13px; font-weight:700; color:#15803d; flex-shrink:0; font-variant-numeric:tabular-nums}
  .ed-proj-bar{height:6px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .ed-proj-bar i{display:block; height:100%; border-radius:999px;
    background:linear-gradient(90deg,#16a34a,#4ade80)}

  @media(max-width:1000px){
    .ed-kpis,.ed-ops{grid-template-columns:repeat(2,1fr)}
    .ed-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .ed-root{padding:18px 14px}
    .ed-kpis,.ed-ops{grid-template-columns:1fr}
    .ed-title{font-size:19px}
  }
`;

export default function ExecutiveDashboard() {
  const [tenantId, setTenantId] = useState("");
  const [month, setMonth] = useState(thisMonthStr());
  const [ent, setEnt] = useState(null);
  const [trend, setTrend] = useState([]);
  const [assetsValue, setAssetsValue] = useState(0);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
  }, [tenantId, month]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [ty, tm] = month.split("-").map(Number);
      const fromDate = new Date(ty, tm - 1 - 5, 1);
      const fromMonth = fromDate.toISOString().slice(0, 7);
      const [entRes, rangeRes, depRes, empSnap] = await Promise.all([
        httpsCallable(functions, "getEnterpriseProfitability")({ month }),
        httpsCallable(functions, "getEnterpriseProfitabilityRange")({ fromMonth, toMonth: month }),
        httpsCallable(functions, "getDepreciation")({}).catch(() => ({ data: { kpis: { totalCost: 0 } } })),
        getDocs(query(collection(db, "employees"), where("tenantId", "==", tenantId))).catch(() => ({ size: 0 })),
      ]);
      setEnt(entRes.data);
      setTrend((rangeRes.data && rangeRes.data.monthly) || []);
      setAssetsValue((depRes.data && depRes.data.kpis && depRes.data.kpis.totalCost) || 0);
      setTotalEmployees(empSnap.size || 0);
    } catch (e) {
      setError(e.message || "تعذّر تحميل اللوحة.");
      setEnt(null);
    } finally {
      setLoading(false);
    }
  }

  // المؤشرات المحسوبة
  const t = ent ? ent.totals : { revenue: 0, cost: 0, profit: 0, margin: 0 };
  const workersCount = ent ? ent.workersCount : 0;
  const projectsCount = ent ? ent.projectsCount : 0;
  const util = totalEmployees > 0 ? Math.round((workersCount / totalEmployees) * 100) : 0;
  const avgWorkerProfit = workersCount > 0 ? Math.round(t.profit / workersCount) : 0;

  // delta من الشهر السابق
  const curIdx = trend.findIndex((m) => m.month === month);
  const prev = curIdx > 0 ? trend[curIdx - 1] : null;
  const pct = (cur, old) => (old && old !== 0 ? Math.round(((cur - old) / Math.abs(old)) * 1000) / 10 : null);
  const revDelta = prev ? pct(t.revenue, prev.revenue) : null;
  const profitDelta = prev ? pct(t.profit, prev.profit) : null;

  const KPIS = [
    { id: "rev", label: "إيرادات الشهر", value: fmt(t.revenue), unit: "ر.س", delta: revDelta, up: revDelta >= 0, good: revDelta >= 0, icon: Banknote, color: "#059669" },
    { id: "profit", label: "صافي الربح", value: fmt(t.profit), unit: "ر.س", sub: `هامش ${Math.round(t.margin)}%`, delta: profitDelta, up: profitDelta >= 0, good: profitDelta >= 0, icon: TrendingUp, color: "#16a34a" },
    { id: "exp", label: "إجمالي التكلفة", value: fmt(t.cost), unit: "ر.س", icon: Receipt, color: "#ea580c" },
    { id: "assets", label: "قيمة الأصول", value: fmt(assetsValue), unit: "ر.س", sub: "المملوكة", icon: Wallet, color: "#0891b2" },
  ];

  const OPS = [
    { id: "workers", label: "العمّال النشطون", value: String(workersCount), sub: totalEmployees > 0 ? `من ${totalEmployees}` : "", icon: HardHat, color: "#ea580c" },
    { id: "util", label: "نسبة الإشغال", value: String(util), suffix: "%", bar: Math.min(100, util), icon: Gauge, color: "#7c3aed" },
    { id: "projects", label: "المشاريع النشطة", value: String(projectsCount), sub: "بنشاط", icon: FolderKanban, color: "#2563eb" },
    { id: "wprofit", label: "متوسط ربحية العامل", value: fmt(avgWorkerProfit), unit: "ر.س/شهر", icon: UserRoundCheck, color: "#16a34a" },
  ];

  // المنحنى
  const MONTHS = trend.map((m) => monthName(m.month));
  const REVENUE = trend.map((m) => Math.round(m.revenue / 1000));
  const PROFIT = trend.map((m) => Math.round(m.profit / 1000));

  // أعلى المشاريع
  const topRaw = ent ? ent.projects.filter((p) => p.profit > 0).slice(0, 5) : [];
  const maxProfit = topRaw.length > 0 ? Math.max(...topRaw.map((p) => p.profit), 1) : 1;
  const TOP_PROJECTS = topRaw.map((p) => ({ name: p.projectName || `مشروع #${p.projectNumber}`, value: fmt(p.profit), pct: Math.round((p.profit / maxProfit) * 100) }));

  // حساب مسارات المنحنى
  const W = 600, H = 175, PAD = 8;
  const max = REVENUE.length > 0 ? Math.max(...REVENUE, 1) * 1.12 : 1;
  const xAt = (i) => PAD + (i * (W - 2 * PAD)) / (Math.max(1, MONTHS.length - 1));
  const yAt = (v) => H - PAD - (v / max) * (H - 2 * PAD);
  const pts = (arr) => arr.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const revArea = REVENUE.length > 0
    ? `M ${xAt(0)},${H - PAD} L ` + REVENUE.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" L ") + ` L ${xAt(MONTHS.length - 1)},${H - PAD} Z`
    : "";

  return (
    <div className="ed-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="ed-head">
        <div className="ed-head-ic"><Crown size={25} /></div>
        <div>
          <div className="ed-title">لوحة المؤشرات</div>
          <div className="ed-sub">نظرة تنفيذية شاملة · الإدارة العليا</div>
        </div>
        <div className="ed-period" style={{ padding: 0, border: "none", background: "none" }}>
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} dir="ltr"
            style={{ height: 42, padding: "0 15px", background: "#fff", border: "1px solid #dde2ec", borderRadius: 11, fontFamily: "inherit", fontSize: 13.5, fontWeight: 600, color: "#161b26", cursor: "pointer" }} />
        </div>
      </div>

      {loading ? (
        <p style={{ color: "#94a0b8", fontSize: 14 }}>جارٍ تحميل اللوحة...</p>
      ) : error ? (
        <div style={{ padding: "12px 16px", background: "#fee2e2", color: "#b91c1c", borderRadius: 10, fontSize: 14 }}>{error}</div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div className="ed-kpis">
            {KPIS.map((k) => {
              const Icon = k.icon;
              return (
                <div className="ed-kpi" key={k.id} style={{ "--c": k.color }}>
                  <div className="ed-kpi-top">
                    <div className="ed-kpi-ic"><Icon size={20} /></div>
                    {k.delta != null ? (
                      <span className={`ed-delta ${k.good ? "good" : "bad"}`}>
                        {k.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                        {Math.abs(k.delta)}%
                      </span>
                    ) : null}
                  </div>
                  <div className="ed-kpi-label">{k.label}</div>
                  <div className="ed-kpi-val ed-num">
                    {k.value}<span className="u">{k.unit}</span>
                  </div>
                  {k.sub && <div className="ed-kpi-sub">{k.sub}</div>}
                </div>
              );
            })}
          </div>

          {/* OPS */}
          <div className="ed-ops">
            {OPS.map((o) => {
              const Icon = o.icon;
              return (
                <div className="ed-op" key={o.id} style={{ "--c": o.color }}>
                  <div className="ed-op-top">
                    <div className="ed-op-ic"><Icon size={18} /></div>
                    <span className="ed-op-label">{o.label}</span>
                  </div>
                  <div className="ed-op-val ed-num">
                    {o.value}{o.suffix && <span>{o.suffix}</span>}
                    {o.unit && <span className="s">{o.unit}</span>}
                    {o.sub && <span className="s">{o.sub}</span>}
                  </div>
                  {o.bar != null && (
                    <div className="ed-op-bar"><i style={{ width: `${o.bar}%` }} /></div>
                  )}
                </div>
              );
            })}
          </div>

          {/* CHARTS ROW */}
          <div className="ed-row">
            {/* المنحنى */}
            <div className="ed-card">
              <div className="ed-card-head">
                <span className="ed-card-title">الإيراد والربح — آخر ٦ أشهر</span>
                <div className="ed-legend">
                  <span className="ed-leg"><b style={{ background: "#2563eb" }} /> الإيراد</span>
                  <span className="ed-leg"><b style={{ background: "#16a34a" }} /> الربح</span>
                </div>
              </div>
              {MONTHS.length === 0 ? <p style={{ color: "#94a0b8", fontSize: 13, padding: "20px 0" }}>لا توجد بيانات.</p> : (
                <div className="ed-chart-wrap">
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#2563eb" stopOpacity="0.16" />
                        <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[0.25, 0.5, 0.75].map((g) => (
                      <line key={g} x1={PAD} y1={H * g} x2={W - PAD} y2={H * g} stroke="#eef1f6" strokeWidth="1" />
                    ))}
                    {revArea ? <path d={revArea} fill="url(#revFill)" /> : null}
                    <polyline points={pts(REVENUE)} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    <polyline points={pts(PROFIT)} fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {REVENUE.map((v, i) => (
                      <circle key={"r" + i} cx={xAt(i)} cy={yAt(v)} r="3.5" fill="#fff" stroke="#2563eb" strokeWidth="2" />
                    ))}
                    {PROFIT.map((v, i) => (
                      <circle key={"p" + i} cx={xAt(i)} cy={yAt(v)} r="3.5" fill="#fff" stroke="#16a34a" strokeWidth="2" />
                    ))}
                  </svg>
                  <div className="ed-xlabels">
                    {MONTHS.map((m, i) => <span key={i}>{m}</span>)}
                  </div>
                </div>
              )}
            </div>

            {/* أعلى المشاريع */}
            <div className="ed-card">
              <div className="ed-card-head">
                <span className="ed-card-title">أعلى ٥ مشاريع ربحية</span>
              </div>
              <div className="ed-proj">
                {TOP_PROJECTS.length === 0 ? <p style={{ color: "#94a0b8", fontSize: 13 }}>لا توجد مشاريع رابحة في هذا الشهر.</p> : TOP_PROJECTS.map((p, i) => (
                  <div className="ed-proj-item" key={i}>
                    <div className="ed-proj-top">
                      <div className="ed-proj-rank">
                        <span className="ed-proj-n">{i + 1}</span>
                        <span className="ed-proj-name">{p.name}</span>
                      </div>
                      <span className="ed-proj-val">{p.value}</span>
                    </div>
                    <div className="ed-proj-bar"><i style={{ width: `${p.pct}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
