import React from "react";
import {
  Percent, Droplets, Target, TrendingUp, BarChart3, Layers,
  Calendar, ChevronDown, ArrowUp, ArrowDown
} from "lucide-react";

/* ============================================================
   التخطيط والتحليل المالي (FP&A) — قسم المالية
   البيانات تجريبية. دوال backend المطلوبة مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 النسب المالية — مصدرها: getFinancialStatements + getEnterpriseProfitability
const RATIOS = [
  { id: "margin", label: "هامش الربح",        value: "25", suffix: "%", delta: "+2%",  up: true, icon: Percent,    color: "#16a34a" },
  { id: "liq",    label: "نسبة السيولة",       value: "1.8", note: "صحية",             icon: Droplets,   color: "#0891b2" },
  { id: "roi",    label: "العائد على الإيراد", value: "18", suffix: "%",               icon: Target,     color: "#7c3aed" },
  { id: "growth", label: "نمو الإيراد",        value: "+12", suffix: "%", sub: "سنوي", icon: TrendingUp, color: "#059669" },
];

// 📋 الموازنة مقابل الفعلي (بالألف، تراكمي للسنة) — مصدرها: getBudgetVsActual (دالة جديدة)
const BUDGET = [
  { name: "الإيرادات",        budget: 7200, actual: 6680, type: "rev" },
  { name: "تكلفة العمالة",    budget: 3600, actual: 3420, type: "exp" },
  { name: "الرواتب الإدارية", budget: 1080, actual: 1140, type: "exp" },
  { name: "تشغيل الأصول",     budget: 720,  actual: 690,  type: "exp" },
  { name: "مصاريف عامة",      budget: 540,  actual: 580,  type: "exp" },
];

// 📈 توقّعات نهاية السنة (الإيراد بالألف) — أول 6 فعلي، الباقي متوقّع
const YEAR = [980, 1050, 1120, 1080, 1180, 1250, 1150, 1220, 1300, 1280, 1350, 1340];
const ACTUAL_N = 6;

// 🎯 السيناريوهات — مصدرها: getBudgetVsActual + نماذج التوقّع
const SCENARIOS = [
  { id: "opt",  label: "متفائل",  rev: "14,200", profit: "3,700", tone: "up"   },
  { id: "real", label: "واقعي",   rev: "13,500", profit: "3,200", tone: "base" },
  { id: "cons", label: "متحفّظ",  rev: "12,400", profit: "2,600", tone: "down" },
];

const maxBudget = Math.max(...BUDGET.map((b) => Math.max(b.budget, b.actual)));
const fmt = (n) => n.toLocaleString("en-US");
const variance = (b) => Math.round(((b.actual - b.budget) / b.budget) * 100);
const isFav = (b) => (b.type === "rev" ? b.actual >= b.budget : b.actual <= b.budget);

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .fpa-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .fpa-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .fpa-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .fpa-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#0596691a; color:#059669; flex-shrink:0}
  .fpa-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .fpa-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .fpa-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .fpa-period svg:first-child{color:#059669}

  .fpa-ratios{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .fpa-ratio{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px}
  .fpa-ratio-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:13px}
  .fpa-ratio-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c)}
  .fpa-chip{display:inline-flex; align-items:center; gap:3px; font-size:12px; font-weight:700; padding:3px 9px; border-radius:999px; background:#dcfce7; color:#15803d}
  .fpa-chip.note{background:#e0f2fe; color:#0369a1}
  .fpa-ratio-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:4px}
  .fpa-ratio-val{font-size:25px; font-weight:700}
  .fpa-ratio-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .fpa-ratio-sub{font-size:11.5px; color:var(--ink3); font-weight:500; margin-top:2px}

  .fpa-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:16px}
  .fpa-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .fpa-card-title{font-size:15.5px; font-weight:700}
  .fpa-legend{display:flex; gap:13px}
  .fpa-leg{display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--ink2); font-weight:500}
  .fpa-leg b{width:9px; height:9px; border-radius:2px; display:block}

  /* BUDGET vs ACTUAL */
  .fpa-bva{display:flex; flex-direction:column; gap:16px}
  .fpa-bva-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:8px}
  .fpa-bva-name{font-size:13.5px; font-weight:600}
  .fpa-var{display:inline-flex; align-items:center; gap:3px; font-size:12px; font-weight:700; padding:3px 9px; border-radius:999px}
  .fpa-var.fav{background:#dcfce7; color:#15803d}
  .fpa-var.unfav{background:#fee2e2; color:#b91c1c}
  .fpa-bva-bars{display:flex; flex-direction:column; gap:5px}
  .fpa-bva-bar{height:9px; border-radius:5px; position:relative; background:#eef1f6}
  .fpa-bva-bar i{display:block; height:100%; border-radius:5px}
  .fpa-bva-bar.plan i{background:#cbd5e1}
  .fpa-bva-bar.act i.fav{background:linear-gradient(90deg,#16a34a,#4ade80)}
  .fpa-bva-bar.act i.unfav{background:linear-gradient(90deg,#dc2626,#f87171)}
  .fpa-bva-vals{font-size:11.5px; color:var(--ink3); margin-top:6px; font-variant-numeric:tabular-nums}
  .fpa-bva-vals b{color:var(--ink2); font-weight:600}

  /* ROW */
  .fpa-row{display:grid; grid-template-columns:1.5fr 1fr; gap:16px; align-items:start}

  /* FORECAST chart */
  .fpa-chart-wrap svg{width:100%; height:auto; display:block; overflow:visible}
  .fpa-xlabels{display:flex; justify-content:space-between; margin-top:9px}
  .fpa-xlabels span{font-size:11.5px; color:var(--ink3); font-weight:600}

  /* SCENARIOS */
  .fpa-scen{display:flex; flex-direction:column; gap:11px}
  .fpa-scen-item{padding:15px 16px; border-radius:13px; border:1px solid var(--line); background:var(--bg)}
  .fpa-scen-item.base{border-color:#05966955; background:#0596690a}
  .fpa-scen-htop{display:flex; align-items:center; justify-content:space-between; margin-bottom:11px}
  .fpa-scen-label{display:flex; align-items:center; gap:7px; font-size:13.5px; font-weight:700}
  .fpa-scen-tag{width:9px; height:9px; border-radius:50%}
  .fpa-scen-badge{font-size:10px; font-weight:700; padding:2px 8px; border-radius:999px; background:#059669; color:#fff}
  .fpa-scen-grid{display:grid; grid-template-columns:1fr 1fr; gap:10px}
  .fpa-scen-cell .l{font-size:11px; color:var(--ink3); font-weight:600; margin-bottom:3px}
  .fpa-scen-cell .v{font-size:16px; font-weight:700; font-variant-numeric:tabular-nums}

  @media(max-width:1000px){
    .fpa-ratios{grid-template-columns:repeat(2,1fr)}
    .fpa-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .fpa-root{padding:18px 14px}
    .fpa-ratios{grid-template-columns:1fr}
    .fpa-title{font-size:19px}
  }
`;

export default function FPAView() {
  // مسار رسم التوقّعات
  const W = 600, H = 165, PAD = 8;
  const max = Math.max(...YEAR) * 1.1;
  const xAt = (i) => PAD + (i * (W - 2 * PAD)) / (YEAR.length - 1);
  const yAt = (v) => H - PAD - (v / max) * (H - 2 * PAD);
  const actualPts = YEAR.slice(0, ACTUAL_N).map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const foreStart = ACTUAL_N - 1;
  const forePts = YEAR.slice(foreStart).map((v, i) => `${xAt(foreStart + i)},${yAt(v)}`).join(" ");
  const splitX = xAt(ACTUAL_N - 1);

  return (
    <div className="fpa-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="fpa-head">
        <div className="fpa-head-ic"><BarChart3 size={24} /></div>
        <div>
          <div className="fpa-title">التخطيط والتحليل المالي</div>
          <div className="fpa-sub">الموازنات والانحرافات والتوقّعات · المالية</div>
        </div>
        <button className="fpa-period">
          <Calendar size={16} /> السنة المالية <ChevronDown size={15} />
        </button>
      </div>

      {/* RATIOS */}
      <div className="fpa-ratios">
        {RATIOS.map((r) => {
          const Icon = r.icon;
          return (
            <div className="fpa-ratio" key={r.id} style={{ "--c": r.color }}>
              <div className="fpa-ratio-top">
                <div className="fpa-ratio-ic"><Icon size={19} /></div>
                {r.delta && <span className="fpa-chip"><ArrowUp size={12} />{r.delta}</span>}
                {r.note && <span className="fpa-chip note">{r.note}</span>}
              </div>
              <div className="fpa-ratio-label">{r.label}</div>
              <div className="fpa-ratio-val fpa-num">
                {r.value}{r.suffix && <span className="x">{r.suffix}</span>}
              </div>
              {r.sub && <div className="fpa-ratio-sub">{r.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* BUDGET vs ACTUAL */}
      <div className="fpa-card">
        <div className="fpa-card-head">
          <span className="fpa-card-title">الموازنة مقابل الفعلي</span>
          <div className="fpa-legend">
            <span className="fpa-leg"><b style={{ background: "#cbd5e1" }} /> المخطّط</span>
            <span className="fpa-leg"><b style={{ background: "#16a34a" }} /> الفعلي</span>
          </div>
        </div>
        <div className="fpa-bva">
          {BUDGET.map((b, i) => {
            const v = variance(b);
            const fav = isFav(b);
            return (
              <div key={i}>
                <div className="fpa-bva-top">
                  <span className="fpa-bva-name">{b.name}</span>
                  <span className={`fpa-var ${fav ? "fav" : "unfav"}`}>
                    {v >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                    {v >= 0 ? "+" : ""}{v}%
                  </span>
                </div>
                <div className="fpa-bva-bars">
                  <div className="fpa-bva-bar plan"><i style={{ width: `${(b.budget / maxBudget) * 100}%` }} /></div>
                  <div className="fpa-bva-bar act"><i className={fav ? "fav" : "unfav"} style={{ width: `${(b.actual / maxBudget) * 100}%` }} /></div>
                </div>
                <div className="fpa-bva-vals">
                  مخطّط <b>{fmt(b.budget)}</b> · فعلي <b>{fmt(b.actual)}</b> (بالألف)
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ROW: FORECAST + SCENARIOS */}
      <div className="fpa-row">

        <div className="fpa-card" style={{ marginBottom: 0 }}>
          <div className="fpa-card-head">
            <span className="fpa-card-title">توقّعات نهاية السنة — الإيراد</span>
            <div className="fpa-legend">
              <span className="fpa-leg"><b style={{ background: "#059669" }} /> فعلي</span>
              <span className="fpa-leg"><b style={{ background: "#94a3b8" }} /> متوقّع</span>
            </div>
          </div>
          <div className="fpa-chart-wrap">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1={PAD} y1={H * g} x2={W - PAD} y2={H * g} stroke="#eef1f6" strokeWidth="1" />
              ))}
              <rect x={splitX} y="0" width={W - splitX - PAD} height={H} fill="#f8fafc" />
              <line x1={splitX} y1={PAD} x2={splitX} y2={H - PAD} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
              <polyline points={actualPts} fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={forePts} fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeDasharray="5 4" strokeLinecap="round" strokeLinejoin="round" />
              {YEAR.slice(0, ACTUAL_N).map((v, i) => (
                <circle key={"a" + i} cx={xAt(i)} cy={yAt(v)} r="3" fill="#fff" stroke="#059669" strokeWidth="2" />
              ))}
            </svg>
            <div className="fpa-xlabels">
              <span>يناير (فعلي)</span>
              <span>يونيو</span>
              <span>ديسمبر (متوقّع)</span>
            </div>
          </div>
        </div>

        <div className="fpa-card" style={{ marginBottom: 0 }}>
          <div className="fpa-card-head">
            <span className="fpa-card-title">السيناريوهات</span>
            <Layers size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="fpa-scen">
            {SCENARIOS.map((s) => {
              const dot = s.tone === "up" ? "#16a34a" : s.tone === "down" ? "#dc2626" : "#059669";
              return (
                <div className={`fpa-scen-item ${s.tone === "base" ? "base" : ""}`} key={s.id}>
                  <div className="fpa-scen-htop">
                    <span className="fpa-scen-label">
                      <span className="fpa-scen-tag" style={{ background: dot }} />
                      {s.label}
                    </span>
                    {s.tone === "base" && <span className="fpa-scen-badge">الأساس</span>}
                  </div>
                  <div className="fpa-scen-grid">
                    <div className="fpa-scen-cell">
                      <div className="l">الإيراد</div>
                      <div className="v fpa-num">{s.rev}</div>
                    </div>
                    <div className="fpa-scen-cell">
                      <div className="l">الربح</div>
                      <div className="v fpa-num" style={{ color: dot }}>{s.profit}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
