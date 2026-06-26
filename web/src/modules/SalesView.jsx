import React from "react";
import {
  TrendingUp, CheckCircle2, Percent, Briefcase, Phone, FileText,
  MessagesSquare, User, Calendar, ChevronDown
} from "lucide-react";

/* ============================================================
   المبيعات المباشرة — قسم المبيعات والتسويق
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getSalesSummary (دالة backend جديدة)
const KPIS = [
  { id: "pipe",   label: "قيمة خط الأنابيب", value: "3,200,000", unit: "ر.س", icon: TrendingUp,   color: "#db2777" },
  { id: "closed", label: "صفقات مغلقة",      value: "5",  sub: "صفقة", icon: CheckCircle2, color: "#16a34a" },
  { id: "conv",   label: "معدل التحويل",     value: "32", suffix: "%", icon: Percent,      color: "#2563eb" },
  { id: "active", label: "صفقات نشطة",       value: "14", sub: "صفقة", icon: Briefcase,    color: "#ea580c" },
];

// 🔀 خط أنابيب المبيعات — مصدرها: getDeals (تجميع حسب المرحلة)
const PIPELINE = [
  { stage: "تواصل أولي", value: 1200000, count: 6, icon: Phone,          color: "#60a5fa" },
  { stage: "عرض",        value: 980000,  count: 4, icon: FileText,       color: "#818cf8" },
  { stage: "تفاوض",      value: 620000,  count: 3, icon: MessagesSquare, color: "#fb923c" },
  { stage: "إغلاق",      value: 400000,  count: 1, icon: CheckCircle2,   color: "#34d399" },
];

// 💼 الصفقات النشطة — مصدرها: getDeals
const DEALS = [
  { name: "توريد عمالة — نيوم م٣",          value: 850000,  stage: "negotiation", rep: "أحمد العتيبي" },
  { name: "توريد فنيين — أرامكو",            value: 1200000, stage: "contact",     rep: "فهد المطيري"  },
  { name: "عقد صيانة — مدينة الملك عبدالله", value: 420000,  stage: "proposal",    rep: "سعد الغامدي"  },
  { name: "توريد سائقين — القدية",           value: 350000,  stage: "proposal",    rep: "نورة الدوسري" },
  { name: "عمالة موسمية — البحر الأحمر",     value: 280000,  stage: "closing",     rep: "أحمد العتيبي" },
];

// 👤 أداء المندوبين — مصدرها: getSalesReps
const REPS = [
  { name: "فهد المطيري",  value: 1200000 },
  { name: "أحمد العتيبي", value: 1130000 },
  { name: "سعد الغامدي",  value: 420000  },
  { name: "نورة الدوسري", value: 350000  },
];

const STAGE = {
  contact:     { label: "تواصل",  cls: "contact"     },
  proposal:    { label: "عرض",    cls: "proposal"    },
  negotiation: { label: "تفاوض",  cls: "negotiation" },
  closing:     { label: "إغلاق",  cls: "closing"     },
};

const maxPipe = Math.max(...PIPELINE.map((p) => p.value));
const maxRep = Math.max(...REPS.map((r) => r.value));
const fmt = (n) => n.toLocaleString("en-US");

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .sal-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .sal-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .sal-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .sal-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#db27771a; color:#db2777; flex-shrink:0}
  .sal-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .sal-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .sal-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .sal-period svg:first-child{color:#db2777}

  .sal-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .sal-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .sal-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .sal-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .sal-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .sal-kpi-val{font-size:24px; font-weight:700}
  .sal-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}
  .sal-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .sal-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .sal-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:16px}
  .sal-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .sal-card-title{font-size:15.5px; font-weight:700}
  .sal-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* PIPELINE */
  .sal-pipe{display:grid; grid-template-columns:repeat(4,1fr); gap:12px}
  .sal-stage{padding:16px; border-radius:13px; background:var(--bg); border:1px solid var(--line)}
  .sal-stage-top{display:flex; align-items:center; gap:9px; margin-bottom:13px}
  .sal-stage-ic{width:32px; height:32px; border-radius:9px; display:grid; place-items:center; flex-shrink:0}
  .sal-stage-name{font-size:12.5px; color:var(--ink2); font-weight:600}
  .sal-stage-val{font-size:18px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1}
  .sal-stage-count{font-size:11.5px; color:var(--ink3); margin-top:4px; font-weight:500}
  .sal-stage-bar{height:6px; background:#eef1f6; border-radius:999px; overflow:hidden; margin-top:11px}
  .sal-stage-bar i{display:block; height:100%; border-radius:999px}

  .sal-row{display:grid; grid-template-columns:1.6fr 1fr; gap:16px; align-items:start}

  /* DEALS TABLE */
  .sal-tablewrap{overflow-x:auto}
  table.sal-table{width:100%; border-collapse:collapse; min-width:560px}
  .sal-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .sal-table th.n, .sal-table td.n{text-align:left}
  .sal-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .sal-table tr:last-child td{border-bottom:none}
  .sal-deal-name{font-weight:600; color:var(--ink); white-space:nowrap}
  .sal-deal-val{font-weight:700; font-variant-numeric:tabular-nums; text-align:left}
  .sal-deal-rep{color:var(--ink2); white-space:nowrap}
  .sal-spill{display:inline-block; font-size:11px; font-weight:700; padding:4px 11px; border-radius:999px; white-space:nowrap}
  .sal-spill.contact{background:#dbeafe; color:#1d4ed8}
  .sal-spill.proposal{background:#ede9fe; color:#6d28d9}
  .sal-spill.negotiation{background:#ffedd5; color:#9a3412}
  .sal-spill.closing{background:#dcfce7; color:#15803d}

  /* REPS */
  .sal-reps{display:flex; flex-direction:column; gap:14px}
  .sal-rep-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .sal-rep-name{display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600}
  .sal-rep-ic{width:28px; height:28px; border-radius:50%; background:#db27771a; color:#db2777; display:grid; place-items:center; flex-shrink:0}
  .sal-rep-val{font-size:12.5px; font-weight:700; font-variant-numeric:tabular-nums}
  .sal-rep-bar{height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .sal-rep-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#db2777,#f472b6)}

  @media(max-width:1000px){
    .sal-kpis,.sal-pipe{grid-template-columns:repeat(2,1fr)}
    .sal-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .sal-root{padding:18px 14px}
    .sal-kpis,.sal-pipe{grid-template-columns:1fr}
    .sal-title{font-size:19px}
  }
`;

export default function SalesView() {
  return (
    <div className="sal-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="sal-head">
        <div className="sal-head-ic"><TrendingUp size={24} /></div>
        <div>
          <div className="sal-title">المبيعات المباشرة</div>
          <div className="sal-sub">خط أنابيب الصفقات وأداء المبيعات · المبيعات والتسويق</div>
        </div>
        <button className="sal-period">
          <Calendar size={16} /> هذا الربع <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="sal-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="sal-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="sal-kpi-ic"><Icon size={19} /></div>
              <div className="sal-kpi-label">{k.label}</div>
              <div className="sal-kpi-val sal-num">
                {k.value}
                {k.unit && <span className="u">{k.unit}</span>}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* PIPELINE */}
      <div className="sal-card">
        <div className="sal-card-head">
          <span className="sal-card-title">خط أنابيب المبيعات</span>
          <span className="sal-card-hint">القيمة في كل مرحلة</span>
        </div>
        <div className="sal-pipe">
          {PIPELINE.map((p) => {
            const Icon = p.icon;
            return (
              <div className="sal-stage" key={p.stage}>
                <div className="sal-stage-top">
                  <span className="sal-stage-ic" style={{ background: p.color + "22", color: p.color }}>
                    <Icon size={17} />
                  </span>
                  <span className="sal-stage-name">{p.stage}</span>
                </div>
                <div className="sal-stage-val">{fmt(p.value)}</div>
                <div className="sal-stage-count">{p.count} صفقات</div>
                <div className="sal-stage-bar">
                  <i style={{ width: `${(p.value / maxPipe) * 100}%`, background: p.color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ROW: DEALS + REPS */}
      <div className="sal-row">

        <div className="sal-card" style={{ marginBottom: 0 }}>
          <div className="sal-card-head">
            <span className="sal-card-title">الصفقات النشطة</span>
            <span className="sal-card-hint">{DEALS.length} صفقة</span>
          </div>
          <div className="sal-tablewrap">
            <table className="sal-table">
              <thead>
                <tr>
                  <th>الصفقة</th>
                  <th className="n">القيمة</th>
                  <th>المرحلة</th>
                  <th>المندوب</th>
                </tr>
              </thead>
              <tbody>
                {DEALS.map((d, i) => {
                  const st = STAGE[d.stage];
                  return (
                    <tr key={i}>
                      <td className="sal-deal-name">{d.name}</td>
                      <td className="sal-deal-val n sal-num">{fmt(d.value)}</td>
                      <td><span className={`sal-spill ${st.cls}`}>{st.label}</span></td>
                      <td className="sal-deal-rep">{d.rep}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sal-card" style={{ marginBottom: 0 }}>
          <div className="sal-card-head">
            <span className="sal-card-title">أداء المندوبين</span>
            <User size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="sal-reps">
            {REPS.map((r, i) => (
              <div key={i}>
                <div className="sal-rep-top">
                  <span className="sal-rep-name">
                    <span className="sal-rep-ic"><User size={14} /></span>
                    {r.name}
                  </span>
                  <span className="sal-rep-val sal-num">{fmt(r.value)}</span>
                </div>
                <div className="sal-rep-bar"><i style={{ width: `${(r.value / maxRep) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
