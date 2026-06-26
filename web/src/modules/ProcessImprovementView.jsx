import React from "react";
import {
  Activity, Wallet, TrendingUp, CheckCircle2, Sparkles, Clock,
  ArrowLeft, Building2, Calendar, ChevronDown
} from "lucide-react";

/* ============================================================
   تحسين العمليات — قسم التميز والجودة (آخر قسم تشغيلي)
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getImprovementSummary (دالة backend جديدة)
const KPIS = [
  { id: "active",  label: "مبادرات نشطة",     value: "5",  sub: "مبادرة", icon: Activity,     color: "#65a30d" },
  { id: "savings", label: "الوفورات المحققة", value: "420,000", unit: "ر.س", icon: Wallet,   color: "#16a34a" },
  { id: "eff",     label: "نسبة الكفاءة",     value: "+18", suffix: "%",  icon: TrendingUp,   color: "#2563eb" },
  { id: "done",    label: "مبادرات مكتملة",   value: "12", sub: "مبادرة", icon: CheckCircle2, color: "#7c3aed" },
];

// 🚀 مبادرات التحسين — مصدرها: getImprovements
// status: active=نشطة · done=مكتملة
const INITIATIVES = [
  { name: "أتمتة معالجة الفواتير",     dept: "المالية",         progress: 80,  status: "active" },
  { name: "توحيد عملية التحصيل",       dept: "المالية",         progress: 90,  status: "active" },
  { name: "تحسين دورة توريد العمالة",  dept: "العمليات",        progress: 65,  status: "active" },
  { name: "تحسين جدولة الأسطول",       dept: "الأصول والمرافق", progress: 45,  status: "active" },
  { name: "رقمنة طلبات الإجازة",       dept: "الموارد البشرية", progress: 100, status: "done"   },
];

// ⚡ مؤشرات الكفاءة (قبل/بعد) — مصدرها: getEfficiencyMetrics
const EFFICIENCY = [
  { name: "زمن معالجة الفاتورة", before: "٤٨ ساعة", after: "١٢ ساعة" },
  { name: "دورة توريد عامل",     before: "٢١ يوم",  after: "١٤ يوم"  },
  { name: "زمن إغلاق الذمم",     before: "٧٥ يوم",  after: "٥٨ يوم"  },
];

// 🏢 مبادرات حسب القسم — مصدرها: getImprovements (تجميع حسب القسم)
const BY_DEPT = [
  { name: "المالية",         value: 6 },
  { name: "العمليات",        value: 4 },
  { name: "الموارد البشرية", value: 3 },
  { name: "الأصول والمرافق", value: 2 },
];

// 💡 الأثر والوفورات — مصدرها: getImprovementSummary
const IMPACT = { time: "1,240", money: "420,000" };

const STATUS = {
  active: { label: "نشطة",   cls: "active" },
  done:   { label: "مكتملة", cls: "done"   },
};

const maxDept = Math.max(...BY_DEPT.map((d) => d.value));

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .imp-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .imp-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .imp-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .imp-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#65a30d1a; color:#65a30d; flex-shrink:0}
  .imp-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .imp-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .imp-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .imp-period svg:first-child{color:#65a30d}

  .imp-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .imp-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .imp-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .imp-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .imp-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .imp-kpi-val{font-size:24px; font-weight:700}
  .imp-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}
  .imp-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .imp-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .imp-row{display:grid; gap:16px; margin-bottom:16px; align-items:start}
  .imp-row.a{grid-template-columns:1.6fr 1fr}
  .imp-row.b{grid-template-columns:1.5fr 1fr}
  .imp-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .imp-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .imp-card-title{font-size:15.5px; font-weight:700}
  .imp-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* INITIATIVES */
  .imp-inits{display:flex; flex-direction:column; gap:14px}
  .imp-init-top{display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:9px}
  .imp-init-info{min-width:0}
  .imp-init-name{font-size:13.5px; font-weight:600}
  .imp-init-dept{font-size:11.5px; color:var(--ink3); margin-top:2px}
  .imp-ipill{font-size:10.5px; font-weight:700; padding:4px 10px; border-radius:999px; flex-shrink:0; white-space:nowrap}
  .imp-ipill.active{background:#dbeafe; color:#1d4ed8}
  .imp-ipill.done{background:#dcfce7; color:#15803d}
  .imp-init-barrow{display:flex; align-items:center; gap:10px}
  .imp-init-bar{flex:1; height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .imp-init-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#65a30d,#a3e635)}
  .imp-init-pct{font-size:12px; font-weight:700; color:var(--ink2); font-variant-numeric:tabular-nums; min-width:38px; text-align:left}

  /* EFFICIENCY */
  .imp-effs{display:flex; flex-direction:column; gap:14px}
  .imp-eff-name{font-size:12.5px; font-weight:600; margin-bottom:8px}
  .imp-eff-vals{display:flex; align-items:center; gap:11px}
  .imp-eff-before{flex:1; text-align:center; font-size:12.5px; font-weight:700; color:var(--ink2); background:var(--bg); padding:8px; border-radius:9px; border:1px solid var(--line)}
  .imp-eff-after{flex:1; text-align:center; font-size:12.5px; font-weight:700; color:#15803d; background:#dcfce7; padding:8px; border-radius:9px}
  .imp-eff-arrow{color:#65a30d; flex-shrink:0}

  /* BY DEPT */
  .imp-depts{display:flex; flex-direction:column; gap:14px}
  .imp-dept-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .imp-dept-name{display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600}
  .imp-dept-ic{width:26px; height:26px; border-radius:7px; background:#65a30d14; color:#65a30d; display:grid; place-items:center; flex-shrink:0}
  .imp-dept-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .imp-dept-bar{height:8px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .imp-dept-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#65a30d,#a3e635)}

  /* IMPACT */
  .imp-impact{display:flex; flex-direction:column; gap:12px}
  .imp-impact-item{display:flex; align-items:center; gap:13px; padding:16px; border-radius:13px; background:var(--bg); border:1px solid var(--line)}
  .imp-impact-ic{width:44px; height:44px; border-radius:12px; display:grid; place-items:center; flex-shrink:0}
  .imp-impact-ic.t{background:#2563eb14; color:#2563eb}
  .imp-impact-ic.m{background:#16a34a14; color:#16a34a}
  .imp-impact-v{font-size:21px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums}
  .imp-impact-v small{font-size:13px; color:var(--ink3); font-weight:600}
  .imp-impact-l{font-size:12px; color:var(--ink2); margin-top:3px}

  @media(max-width:1000px){
    .imp-kpis{grid-template-columns:repeat(2,1fr)}
    .imp-row.a,.imp-row.b{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .imp-root{padding:18px 14px}
    .imp-kpis{grid-template-columns:1fr}
    .imp-title{font-size:19px}
  }
`;

export default function ProcessImprovementView() {
  return (
    <div className="imp-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="imp-head">
        <div className="imp-head-ic"><Sparkles size={24} /></div>
        <div>
          <div className="imp-title">تحسين العمليات</div>
          <div className="imp-sub">مبادرات الكفاءة والتطوير المستمر · التميز والجودة</div>
        </div>
        <button className="imp-period">
          <Calendar size={16} /> هذا العام <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="imp-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="imp-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="imp-kpi-ic"><Icon size={19} /></div>
              <div className="imp-kpi-label">{k.label}</div>
              <div className="imp-kpi-val imp-num">
                {k.value}
                {k.unit && <span className="u">{k.unit}</span>}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW A: INITIATIVES + EFFICIENCY */}
      <div className="imp-row a">

        <div className="imp-card" style={{ marginBottom: 0 }}>
          <div className="imp-card-head">
            <span className="imp-card-title">مبادرات التحسين</span>
            <span className="imp-card-hint">{INITIATIVES.length} مبادرة</span>
          </div>
          <div className="imp-inits">
            {INITIATIVES.map((it, i) => {
              const st = STATUS[it.status];
              return (
                <div key={i}>
                  <div className="imp-init-top">
                    <div className="imp-init-info">
                      <div className="imp-init-name">{it.name}</div>
                      <div className="imp-init-dept">{it.dept}</div>
                    </div>
                    <span className={`imp-ipill ${st.cls}`}>{st.label}</span>
                  </div>
                  <div className="imp-init-barrow">
                    <div className="imp-init-bar"><i style={{ width: `${it.progress}%` }} /></div>
                    <span className="imp-init-pct">{it.progress}٪</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="imp-card" style={{ marginBottom: 0 }}>
          <div className="imp-card-head">
            <span className="imp-card-title">مؤشرات الكفاءة</span>
            <span className="imp-card-hint">قبل / بعد</span>
          </div>
          <div className="imp-effs">
            {EFFICIENCY.map((e) => (
              <div key={e.name}>
                <div className="imp-eff-name">{e.name}</div>
                <div className="imp-eff-vals">
                  <span className="imp-eff-before">{e.before}</span>
                  <ArrowLeft size={18} className="imp-eff-arrow" />
                  <span className="imp-eff-after">{e.after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ROW B: BY DEPT + IMPACT */}
      <div className="imp-row b">

        <div className="imp-card" style={{ marginBottom: 0 }}>
          <div className="imp-card-head">
            <span className="imp-card-title">مبادرات حسب القسم</span>
            <Building2 size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="imp-depts">
            {BY_DEPT.map((d) => (
              <div key={d.name}>
                <div className="imp-dept-top">
                  <span className="imp-dept-name">
                    <span className="imp-dept-ic"><Building2 size={13} /></span>
                    {d.name}
                  </span>
                  <span className="imp-dept-val imp-num">{d.value} مبادرة</span>
                </div>
                <div className="imp-dept-bar"><i style={{ width: `${(d.value / maxDept) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="imp-card" style={{ marginBottom: 0 }}>
          <div className="imp-card-head">
            <span className="imp-card-title">الأثر والوفورات</span>
          </div>
          <div className="imp-impact">
            <div className="imp-impact-item">
              <div className="imp-impact-ic t"><Clock size={21} /></div>
              <div>
                <div className="imp-impact-v imp-num">{IMPACT.time} <small>ساعة/شهر</small></div>
                <div className="imp-impact-l">توفير في زمن العمل</div>
              </div>
            </div>
            <div className="imp-impact-item">
              <div className="imp-impact-ic m"><Wallet size={21} /></div>
              <div>
                <div className="imp-impact-v imp-num">{IMPACT.money} <small>ر.س/سنة</small></div>
                <div className="imp-impact-l">توفير مالي محقق</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
