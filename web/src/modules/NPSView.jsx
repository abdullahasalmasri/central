import React from "react";
import {
  Gauge, Smile, ClipboardList, TrendingUp, Users, Award,
  Calendar, ChevronDown
} from "lucide-react";

/* ============================================================
   رضا العملاء و NPS — قسم التميز والجودة
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getNPS + getCustomerSatisfaction (دوال backend جديدة)
const KPIS = [
  { id: "nps",     label: "مؤشر NPS",         value: "62",  note: "ممتاز", icon: Gauge,         color: "#65a30d" },
  { id: "csat",    label: "رضا العملاء",       value: "88",  suffix: "%",   icon: Smile,         color: "#16a34a" },
  { id: "surveys", label: "استطلاعات مكتملة",  value: "145", icon: ClipboardList, color: "#2563eb" },
  { id: "trend",   label: "الاتجاه",          value: "+8",  sub: "تحسّن",  icon: TrendingUp,    color: "#7c3aed" },
];

// 🎯 توزيع NPS — مصدرها: getNPS
const NPS_DIST = [
  { name: "مروّجون", range: "٩-١٠", pct: 68, color: "#16a34a" },
  { name: "محايدون", range: "٧-٨",  pct: 26, color: "#94a3b8" },
  { name: "منتقدون", range: "٠-٦",  pct: 6,  color: "#dc2626" },
];

// 📈 رضا العملاء عبر الزمن (CSAT شهري) — مصدرها: getCustomerSatisfaction
const CSAT_TREND = [82, 84, 83, 86, 87, 88];
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو"];

// 👥 التقييم حسب العميل — مصدرها: getCustomerSatisfaction
const CUSTOMERS = [
  { name: "أرامكو",              score: 95 },
  { name: "نيوم",                score: 92 },
  { name: "البحر الأحمر",        score: 88 },
  { name: "مدينة الملك عبدالله", score: 84 },
  { name: "القدية",              score: 78 },
];

// 📋 نتائج الاستطلاعات — مصدرها: getSurveys
const SURVEYS = [
  { name: "رضا الخدمة Q2",       score: 88 },
  { name: "جودة العمالة",        score: 91 },
  { name: "الالتزام بالمواعيد",  score: 85 },
];

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .nps-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .nps-numfont{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .nps-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .nps-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#65a30d1a; color:#65a30d; flex-shrink:0}
  .nps-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .nps-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .nps-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .nps-period svg:first-child{color:#65a30d}

  .nps-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .nps-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .nps-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .nps-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .nps-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .nps-kpi-val{font-size:24px; font-weight:700; display:flex; align-items:baseline; gap:6px}
  .nps-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .nps-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500}
  .nps-kpi-val .badge{font-size:10.5px; font-weight:700; padding:2px 8px; border-radius:999px; background:#dcfce7; color:#15803d}

  .nps-row{display:grid; gap:16px; margin-bottom:16px; align-items:start}
  .nps-row.a{grid-template-columns:1fr 1.5fr}
  .nps-row.b{grid-template-columns:1.5fr 1fr}
  .nps-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .nps-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .nps-card-title{font-size:15.5px; font-weight:700}
  .nps-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* NPS GAUGE */
  .nps-score{text-align:center; padding-bottom:16px; margin-bottom:16px; border-bottom:1px solid var(--line)}
  .nps-score-big{font-size:52px; font-weight:800; line-height:1; color:#65a30d}
  .nps-score-cap{font-size:12px; color:var(--ink3); margin-top:6px}
  .nps-distbar{display:flex; height:12px; border-radius:7px; overflow:hidden; margin-bottom:14px}
  .nps-distbar i{height:100%}
  .nps-distlist{display:flex; flex-direction:column; gap:10px}
  .nps-distitem{display:flex; align-items:center; justify-content:space-between}
  .nps-distname{display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600}
  .nps-distdot{width:9px; height:9px; border-radius:3px; flex-shrink:0}
  .nps-distrange{font-size:11px; color:var(--ink3); font-weight:500}
  .nps-distpct{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}

  /* TREND CHART */
  .nps-chart-wrap svg{width:100%; height:auto; display:block; overflow:visible}
  .nps-xlabels{display:flex; justify-content:space-between; margin-top:9px}
  .nps-xlabels span{font-size:11px; color:var(--ink3); font-weight:600}

  /* CUSTOMERS */
  .nps-custs{display:flex; flex-direction:column; gap:13px}
  .nps-cust-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:6px}
  .nps-cust-name{display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600}
  .nps-cust-tag{font-size:9.5px; font-weight:700; padding:1px 7px; border-radius:999px}
  .nps-cust-tag.top{background:#dcfce7; color:#15803d}
  .nps-cust-tag.low{background:#ffedd5; color:#9a3412}
  .nps-cust-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .nps-cust-bar{height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .nps-cust-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#65a30d,#a3e635)}

  /* SURVEYS */
  .nps-surveys{display:flex; flex-direction:column; gap:11px}
  .nps-survey{padding:13px 14px; border-radius:12px; background:var(--bg); border:1px solid var(--line)}
  .nps-survey-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:8px}
  .nps-survey-name{font-size:12.5px; font-weight:600}
  .nps-survey-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums; color:#65a30d}
  .nps-survey-bar{height:6px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .nps-survey-bar i{display:block; height:100%; border-radius:999px; background:#65a30d}

  @media(max-width:1000px){
    .nps-kpis{grid-template-columns:repeat(2,1fr)}
    .nps-row.a,.nps-row.b{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .nps-root{padding:18px 14px}
    .nps-kpis{grid-template-columns:1fr}
    .nps-title{font-size:19px}
  }
`;

export default function NPSView() {
  // مسار رسم اتجاه CSAT
  const W = 520, H = 150, PAD = 8;
  const min = Math.min(...CSAT_TREND) - 3;
  const max = Math.max(...CSAT_TREND) + 2;
  const xAt = (i) => PAD + (i * (W - 2 * PAD)) / (CSAT_TREND.length - 1);
  const yAt = (v) => H - PAD - ((v - min) / (max - min)) * (H - 2 * PAD);
  const pts = CSAT_TREND.map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
  const areaPts = `${PAD},${H - PAD} ${pts} ${W - PAD},${H - PAD}`;

  return (
    <div className="nps-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="nps-head">
        <div className="nps-head-ic"><Gauge size={24} /></div>
        <div>
          <div className="nps-title">رضا العملاء و NPS</div>
          <div className="nps-sub">قياس الولاء والرضا الاستراتيجي · التميز والجودة</div>
        </div>
        <button className="nps-period">
          <Calendar size={16} /> هذا الربع <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="nps-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="nps-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="nps-kpi-ic"><Icon size={19} /></div>
              <div className="nps-kpi-label">{k.label}</div>
              <div className="nps-kpi-val nps-numfont">
                {k.value}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
                {k.note && <span className="badge">{k.note}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW A: NPS + TREND */}
      <div className="nps-row a">

        <div className="nps-card" style={{ marginBottom: 0 }}>
          <div className="nps-card-head">
            <span className="nps-card-title">مؤشر NPS</span>
          </div>
          <div className="nps-score">
            <div className="nps-score-big nps-numfont">62</div>
            <div className="nps-score-cap">صافي نقاط الترويج (مروّجون − منتقدون)</div>
          </div>
          <div className="nps-distbar">
            {NPS_DIST.map((d) => (
              <i key={d.name} style={{ width: `${d.pct}%`, background: d.color }} />
            ))}
          </div>
          <div className="nps-distlist">
            {NPS_DIST.map((d) => (
              <div className="nps-distitem" key={d.name}>
                <span className="nps-distname">
                  <span className="nps-distdot" style={{ background: d.color }} />
                  {d.name} <span className="nps-distrange">({d.range})</span>
                </span>
                <span className="nps-distpct nps-numfont">{d.pct}٪</span>
              </div>
            ))}
          </div>
        </div>

        <div className="nps-card" style={{ marginBottom: 0 }}>
          <div className="nps-card-head">
            <span className="nps-card-title">رضا العملاء عبر الزمن</span>
            <span className="nps-card-hint">CSAT شهري</span>
          </div>
          <div className="nps-chart-wrap">
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
              {[0.25, 0.5, 0.75].map((g) => (
                <line key={g} x1={PAD} y1={H * g} x2={W - PAD} y2={H * g} stroke="#eef1f6" strokeWidth="1" />
              ))}
              <polygon points={areaPts} fill="#65a30d" opacity="0.08" />
              <polyline points={pts} fill="none" stroke="#65a30d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {CSAT_TREND.map((v, i) => (
                <circle key={i} cx={xAt(i)} cy={yAt(v)} r="3.5" fill="#fff" stroke="#65a30d" strokeWidth="2" />
              ))}
            </svg>
            <div className="nps-xlabels">
              {MONTHS.map((m) => <span key={m}>{m}</span>)}
            </div>
          </div>
        </div>

      </div>

      {/* ROW B: CUSTOMERS + SURVEYS */}
      <div className="nps-row b">

        <div className="nps-card" style={{ marginBottom: 0 }}>
          <div className="nps-card-head">
            <span className="nps-card-title">التقييم حسب العميل</span>
            <Users size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="nps-custs">
            {CUSTOMERS.map((c, i) => (
              <div key={c.name}>
                <div className="nps-cust-top">
                  <span className="nps-cust-name">
                    {c.name}
                    {i === 0 && <span className="nps-cust-tag top">الأعلى</span>}
                    {i === CUSTOMERS.length - 1 && <span className="nps-cust-tag low">الأدنى</span>}
                  </span>
                  <span className="nps-cust-val nps-numfont">{c.score}</span>
                </div>
                <div className="nps-cust-bar"><i style={{ width: `${c.score}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="nps-card" style={{ marginBottom: 0 }}>
          <div className="nps-card-head">
            <span className="nps-card-title">نتائج الاستطلاعات</span>
            <ClipboardList size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="nps-surveys">
            {SURVEYS.map((s) => (
              <div className="nps-survey" key={s.name}>
                <div className="nps-survey-top">
                  <span className="nps-survey-name">{s.name}</span>
                  <span className="nps-survey-val nps-numfont">{s.score}٪</span>
                </div>
                <div className="nps-survey-bar"><i style={{ width: `${s.score}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
