import React, { useState } from "react";
import {
  Banknote, TrendingUp, Receipt, Wallet, HardHat, Gauge,
  FolderKanban, UserRoundCheck, ArrowUpRight, ArrowDownRight,
  Calendar, ChevronDown, Crown
} from "lucide-react";

/* ============================================================
   لوحة المؤشرات — الإدارة العليا
   البيانات هنا تجريبية. نقاط الربط بدوالك مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات العلوية — مصدرها: getEnterpriseProfitability + getFinancialStatements
const KPIS = [
  { id: "rev",    label: "إيرادات الشهر",    value: "1,250,000", unit: "ر.س", delta: "8.5%",  up: true,  good: true,  icon: Banknote,  color: "#059669" },
  { id: "profit", label: "صافي الربح",        value: "312,000",   unit: "ر.س", sub: "هامش 25%", delta: "3.2%",  up: true,  good: true,  icon: TrendingUp, color: "#16a34a" },
  { id: "exp",    label: "إجمالي المصروفات",  value: "938,000",   unit: "ر.س", delta: "5.1%",  up: true,  good: false, icon: Receipt,   color: "#ea580c" },
  { id: "cash",   label: "التدفق النقدي",     value: "540,000",   unit: "ر.س", sub: "الرصيد المتاح", delta: "12%", up: true, good: true, icon: Wallet,    color: "#0891b2" },
];

// ⚙️ المؤشرات التشغيلية — مصدرها: عدّادات العمّال + الإسناد + getWorkerProfitabilityByMonth
const OPS = [
  { id: "workers",  label: "العمّال النشطون",     value: "142", sub: "من 150",       icon: HardHat,        color: "#ea580c" },
  { id: "util",     label: "نسبة الإشغال",        value: "88",  suffix: "%", bar: 88, icon: Gauge,          color: "#7c3aed" },
  { id: "projects", label: "المشاريع النشطة",     value: "12",  sub: "قيد التنفيذ",  icon: FolderKanban,   color: "#2563eb" },
  { id: "wprofit",  label: "متوسط ربحية العامل",  value: "2,200", unit: "ر.س/شهر",   icon: UserRoundCheck, color: "#16a34a" },
];

// 📈 منحنى 6 أشهر (بالألف ريال) — مصدره: getEnterpriseProfitability عبر الزمن
const MONTHS  = ["ينا", "فبر", "مار", "أبر", "ماي", "يون"];
const REVENUE = [980, 1050, 1120, 1080, 1180, 1250];
const PROFIT  = [210, 245, 270, 250, 290, 312];

// 🏆 أعلى المشاريع ربحية — مصدره: getProjectProfitability
const TOP_PROJECTS = [
  { name: "عقد أرامكو — الجبيل",     value: "82,000", pct: 100 },
  { name: "مدينة الملك عبدالله",     value: "64,000", pct: 78  },
  { name: "مشروع البحر الأحمر",      value: "51,000", pct: 62  },
  { name: "مشروع نيوم — الإسكان",    value: "43,000", pct: 52  },
  { name: "القدية — المرحلة الثانية", value: "37,000", pct: 45  },
];

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
  const [period, setPeriod] = useState("month");

  // حساب مسارات المنحنى
  const W = 600, H = 175, PAD = 8;
  const max = Math.max(...REVENUE) * 1.12;
  const xAt = (i) => PAD + (i * (W - 2 * PAD)) / (MONTHS.length - 1);
  const yAt = (v) => H - PAD - (v / max) * (H - 2 * PAD);
  const pts = (arr) => arr.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const revArea =
    `M ${xAt(0)},${H - PAD} L ` +
    REVENUE.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" L ") +
    ` L ${xAt(MONTHS.length - 1)},${H - PAD} Z`;

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
        <button className="ed-period" onClick={() => setPeriod(period)}>
          <Calendar size={16} /> هذا الشهر <ChevronDown size={15} />
        </button>
      </div>

      {/* KPI CARDS */}
      <div className="ed-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="ed-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="ed-kpi-top">
                <div className="ed-kpi-ic"><Icon size={20} /></div>
                <span className={`ed-delta ${k.good ? "good" : "bad"}`}>
                  {k.up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {k.delta}
                </span>
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
          <div className="ed-chart-wrap">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              <defs>
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#2563eb" stopOpacity="0.16" />
                  <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1={PAD} y1={H * g} x2={W - PAD} y2={H * g}
                  stroke="#eef1f6" strokeWidth="1" />
              ))}
              <path d={revArea} fill="url(#revFill)" />
              <polyline points={pts(REVENUE)} fill="none" stroke="#2563eb"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points={pts(PROFIT)} fill="none" stroke="#16a34a"
                strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {REVENUE.map((v, i) => (
                <circle key={"r" + i} cx={xAt(i)} cy={yAt(v)} r="3.5" fill="#fff" stroke="#2563eb" strokeWidth="2" />
              ))}
              {PROFIT.map((v, i) => (
                <circle key={"p" + i} cx={xAt(i)} cy={yAt(v)} r="3.5" fill="#fff" stroke="#16a34a" strokeWidth="2" />
              ))}
            </svg>
            <div className="ed-xlabels">
              {MONTHS.map((m) => <span key={m}>{m}</span>)}
            </div>
          </div>
        </div>

        {/* أعلى المشاريع */}
        <div className="ed-card">
          <div className="ed-card-head">
            <span className="ed-card-title">أعلى ٥ مشاريع ربحية</span>
          </div>
          <div className="ed-proj">
            {TOP_PROJECTS.map((p, i) => (
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
    </div>
  );
}
