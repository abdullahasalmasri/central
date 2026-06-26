import React from "react";
import {
  ShieldCheck, AlertTriangle, HardHat, Star, ClipboardCheck,
  Calendar, ChevronDown, TrendingDown, MapPin
} from "lucide-react";

/* ============================================================
   الجودة والسلامة — قسم العمليات (السلامة المهنية وجودة الخدمة الميدانية)
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getSafetySummary (دالة backend جديدة)
const KPIS = [
  { id: "days", label: "أيام بلا حوادث",   value: "47",  sub: "يوم",  icon: ShieldCheck,   color: "#16a34a" },
  { id: "inc",  label: "حوادث هذا الشهر",  value: "2",   sub: "حادث", icon: AlertTriangle, color: "#ea580c" },
  { id: "ppe",  label: "الالتزام بالوقاية", value: "94", suffix: "%", icon: HardHat,       color: "#2563eb" },
  { id: "qual", label: "تقييم الجودة",     value: "4.6", sub: "من ٥", icon: Star,          color: "#ca8a04" },
];

// 📋 سجل حوادث السلامة — مصدرها: getSafetyIncidents
// severity: minor=بسيطة · moderate=متوسطة · warning=تحذيرية | status: closed=مغلقة · review=قيد المراجعة
const INCIDENTS = [
  { type: "انزلاق في الموقع",       site: "مشروع نيوم",        date: "١٢ يونيو", severity: "minor",    status: "closed" },
  { type: "إصابة يد طفيفة",         site: "مشروع البحر الأحمر", date: "٨ يونيو",  severity: "moderate", status: "closed" },
  { type: "شبه حادث (Near-miss)",  site: "مشروع القدية",      date: "٢٠ يونيو", severity: "warning",  status: "review" },
  { type: "عطل معدّة",             site: "موقع الجبيل",       date: "٥ يونيو",  severity: "minor",    status: "closed" },
];
const TRIR = "1.2"; // معدل التكرار

// 🦺 الالتزام بمعدات الوقاية — مصدرها: getSafetySummary
const PPE = [
  { name: "الخوذة",          value: 98 },
  { name: "السترة العاكسة", value: 95 },
  { name: "الأحذية الواقية", value: 92 },
  { name: "القفازات",        value: 90 },
];

// 🔍 جولات التفتيش — مصدرها: getInspections
// result: pass=مطابق · notes=ملاحظات · action=يحتاج إجراء
const INSPECTIONS = [
  { site: "مشروع نيوم",        date: "٢٢ يونيو", result: "pass"   },
  { site: "مشروع البحر الأحمر", date: "٢٠ يونيو", result: "notes"  },
  { site: "موقع الجبيل",       date: "١٨ يونيو", result: "pass"   },
  { site: "مشروع القدية",      date: "١٥ يونيو", result: "action" },
];

// ⭐ جودة الخدمة — مصدرها: getServiceQuality
const QUALITY = {
  avg: 4.6,
  sites: [
    { name: "مشروع نيوم",        score: 4.8 },
    { name: "مشروع البحر الأحمر", score: 4.5 },
    { name: "مشروع القدية",      score: 4.4 },
  ],
};

const SEV = {
  minor:    { label: "بسيطة",   cls: "minor"    },
  moderate: { label: "متوسطة",  cls: "moderate" },
  warning:  { label: "تحذيرية", cls: "warning"  },
};
const RES = {
  pass:   { label: "مطابق",       cls: "pass"   },
  notes:  { label: "ملاحظات",     cls: "notes"  },
  action: { label: "يحتاج إجراء", cls: "action" },
};

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .qs-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .qs-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .qs-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .qs-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#ea580c1a; color:#ea580c; flex-shrink:0}
  .qs-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .qs-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .qs-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .qs-period svg:first-child{color:#ea580c}

  .qs-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .qs-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .qs-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .qs-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .qs-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .qs-kpi-val{font-size:24px; font-weight:700}
  .qs-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .qs-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .qs-row{display:grid; gap:16px; margin-bottom:16px; align-items:start}
  .qs-row.a{grid-template-columns:1.6fr 1fr}
  .qs-row.b{grid-template-columns:1.4fr 1fr}
  .qs-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .qs-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .qs-card-title{font-size:15.5px; font-weight:700}
  .qs-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* INCIDENTS TABLE */
  .qs-tablewrap{overflow-x:auto}
  table.qs-table{width:100%; border-collapse:collapse; min-width:520px}
  .qs-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .qs-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .qs-table tr:last-child td{border-bottom:none}
  .qs-inc-type{font-weight:600; color:var(--ink); white-space:nowrap}
  .qs-inc-site{color:var(--ink2); white-space:nowrap}
  .qs-inc-date{color:var(--ink3); font-size:12px; white-space:nowrap}
  .qs-spill{display:inline-block; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap}
  .qs-spill.minor{background:#fef9c3; color:#92740a}
  .qs-spill.moderate{background:#ffedd5; color:#9a3412}
  .qs-spill.warning{background:#dbeafe; color:#1d4ed8}
  .qs-st{font-size:11px; font-weight:700}
  .qs-st.closed{color:#15803d} .qs-st.review{color:#9a3412}

  /* PPE */
  .qs-ppe{display:flex; flex-direction:column; gap:13px}
  .qs-ppe-top{display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:6px}
  .qs-ppe-name{color:var(--ink2); font-weight:600}
  .qs-ppe-val{font-weight:700; font-variant-numeric:tabular-nums}
  .qs-ppe-bar{height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .qs-ppe-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#2563eb,#60a5fa)}

  /* INSPECTIONS */
  .qs-insps{display:flex; flex-direction:column; gap:9px}
  .qs-insp{display:flex; align-items:center; gap:12px; padding:12px 13px; border-radius:12px; background:var(--bg); border:1px solid var(--line)}
  .qs-insp-ic{width:34px; height:34px; border-radius:9px; background:#ea580c14; color:#ea580c; display:grid; place-items:center; flex-shrink:0}
  .qs-insp-info{flex:1; min-width:0}
  .qs-insp-site{font-size:13px; font-weight:600}
  .qs-insp-date{font-size:11.5px; color:var(--ink3); margin-top:1px}
  .qs-rpill{font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; flex-shrink:0; white-space:nowrap}
  .qs-rpill.pass{background:#dcfce7; color:#15803d}
  .qs-rpill.notes{background:#fef9c3; color:#92740a}
  .qs-rpill.action{background:#fee2e2; color:#b91c1c}

  /* QUALITY */
  .qs-qavg{display:flex; align-items:center; gap:13px; padding-bottom:16px; margin-bottom:16px; border-bottom:1px solid var(--line)}
  .qs-qavg-big{font-size:40px; font-weight:800; line-height:1; color:#ca8a04}
  .qs-stars{display:flex; gap:2px}
  .qs-qavg-cap{font-size:12px; color:var(--ink3); margin-top:3px}
  .qs-qsites{display:flex; flex-direction:column; gap:11px}
  .qs-qsite{display:flex; align-items:center; justify-content:space-between}
  .qs-qsite-name{display:flex; align-items:center; gap:7px; font-size:12.5px; font-weight:600}
  .qs-qsite-name svg{color:#ea580c}
  .qs-qsite-score{display:flex; align-items:center; gap:5px; font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .qs-qsite-score svg{color:#ca8a04}

  @media(max-width:1000px){
    .qs-kpis{grid-template-columns:repeat(2,1fr)}
    .qs-row.a,.qs-row.b{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .qs-root{padding:18px 14px}
    .qs-kpis{grid-template-columns:1fr}
    .qs-title{font-size:19px}
  }
`;

function Stars({ score, size = 14 }) {
  return (
    <span className="qs-stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} fill={n <= Math.round(score) ? "#ca8a04" : "none"}
              color={n <= Math.round(score) ? "#ca8a04" : "#d4d9e3"} />
      ))}
    </span>
  );
}

export default function QualitySafetyView() {
  return (
    <div className="qs-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="qs-head">
        <div className="qs-head-ic"><ShieldCheck size={24} /></div>
        <div>
          <div className="qs-title">الجودة والسلامة</div>
          <div className="qs-sub">السلامة المهنية وجودة الخدمة الميدانية · العمليات</div>
        </div>
        <button className="qs-period">
          <Calendar size={16} /> هذا الشهر <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="qs-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="qs-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="qs-kpi-ic"><Icon size={19} /></div>
              <div className="qs-kpi-label">{k.label}</div>
              <div className="qs-kpi-val qs-num">
                {k.value}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW A: INCIDENTS + PPE */}
      <div className="qs-row a">

        <div className="qs-card" style={{ marginBottom: 0 }}>
          <div className="qs-card-head">
            <span className="qs-card-title">سجل حوادث السلامة</span>
            <span className="qs-card-hint">معدل التكرار (TRIR) {TRIR}</span>
          </div>
          <div className="qs-tablewrap">
            <table className="qs-table">
              <thead>
                <tr>
                  <th>النوع</th>
                  <th>الموقع</th>
                  <th>التاريخ</th>
                  <th>الخطورة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {INCIDENTS.map((c, i) => {
                  const sv = SEV[c.severity];
                  return (
                    <tr key={i}>
                      <td className="qs-inc-type">{c.type}</td>
                      <td className="qs-inc-site">{c.site}</td>
                      <td className="qs-inc-date">{c.date}</td>
                      <td><span className={`qs-spill ${sv.cls}`}>{sv.label}</span></td>
                      <td><span className={`qs-st ${c.status}`}>{c.status === "closed" ? "مغلقة" : "قيد المراجعة"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="qs-card" style={{ marginBottom: 0 }}>
          <div className="qs-card-head">
            <span className="qs-card-title">الالتزام بمعدات الوقاية</span>
            <HardHat size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="qs-ppe">
            {PPE.map((p) => (
              <div key={p.name}>
                <div className="qs-ppe-top">
                  <span className="qs-ppe-name">{p.name}</span>
                  <span className="qs-ppe-val qs-num">{p.value}٪</span>
                </div>
                <div className="qs-ppe-bar"><i style={{ width: `${p.value}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ROW B: INSPECTIONS + QUALITY */}
      <div className="qs-row b">

        <div className="qs-card" style={{ marginBottom: 0 }}>
          <div className="qs-card-head">
            <span className="qs-card-title">جولات التفتيش الميدانية</span>
            <ClipboardCheck size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="qs-insps">
            {INSPECTIONS.map((it, i) => {
              const r = RES[it.result];
              return (
                <div className="qs-insp" key={i}>
                  <div className="qs-insp-ic"><ClipboardCheck size={16} /></div>
                  <div className="qs-insp-info">
                    <div className="qs-insp-site">{it.site}</div>
                    <div className="qs-insp-date">{it.date}</div>
                  </div>
                  <span className={`qs-rpill ${r.cls}`}>{r.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="qs-card" style={{ marginBottom: 0 }}>
          <div className="qs-card-head">
            <span className="qs-card-title">جودة الخدمة</span>
          </div>
          <div className="qs-qavg">
            <span className="qs-qavg-big qs-num">{QUALITY.avg}</span>
            <div>
              <Stars score={QUALITY.avg} size={16} />
              <div className="qs-qavg-cap">متوسط تقييم المواقع</div>
            </div>
          </div>
          <div className="qs-qsites">
            {QUALITY.sites.map((s) => (
              <div className="qs-qsite" key={s.name}>
                <span className="qs-qsite-name"><MapPin size={13} />{s.name}</span>
                <span className="qs-qsite-score"><Star size={13} fill="#ca8a04" />{s.score}</span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
