import React from "react";
import {
  Folder, AlertCircle, TrendingUp, Wallet, Clock, Handshake, Gavel,
  Calendar, ChevronDown, Scale, Tag
} from "lucide-react";

/* ============================================================
   المنازعات — قسم القانونية والامتثال
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getDisputes (دالة backend جديدة)
const KPIS = [
  { id: "open", label: "قضايا مفتوحة",          value: "4",  sub: "قضية", icon: Folder,      color: "#78716c" },
  { id: "risk", label: "القيمة المعرّضة للخطر", value: "680,000", unit: "ر.س", icon: AlertCircle, color: "#dc2626" },
  { id: "win",  label: "معدل الكسب",            value: "75", suffix: "%", icon: TrendingUp,  color: "#16a34a" },
  { id: "prov", label: "المخصّصات القانونية",   value: "250,000", unit: "ر.س", icon: Wallet,  color: "#2563eb" },
];

// ⚖️ حالة القضايا — مصدرها: getDisputes (تجميع حسب الحالة)
const CASE_STATUS = [
  { name: "قيد النظر", count: 2, color: "#2563eb", icon: Clock },
  { name: "تسوية",     count: 1, color: "#ea580c", icon: Handshake },
  { name: "حكم",       count: 1, color: "#7c3aed", icon: Gavel },
];

// 🏷️ أنواع المنازعات — مصدرها: getDisputes (تجميع حسب النوع)
const TYPES = [
  { name: "عمالية",  value: 3, pct: 50, color: "#78716c" },
  { name: "تجارية",  value: 2, pct: 33, color: "#2563eb" },
  { name: "تعاقدية", value: 1, pct: 17, color: "#7c3aed" },
];

// 📋 القضايا — مصدرها: getDisputes
// type: labor=عمالية · commercial=تجارية · contractual=تعاقدية
// status: review=قيد النظر · settlement=تسوية · ruling=حكم · closed=مغلقة
const CASES = [
  { name: "نزاع مستحقات عامل",  party: "عامل سابق",           type: "labor",       value: 85000,  status: "review"     },
  { name: "خلاف فاتورة",        party: "مورد معدّات",         type: "commercial",  value: 145000, status: "review"     },
  { name: "مطالبة تأخير توريد", party: "مدينة الملك عبدالله", type: "contractual", value: 320000, status: "settlement" },
  { name: "دعوى إنهاء خدمة",    party: "عامل سابق",           type: "labor",       value: 65000,  status: "ruling"     },
  { name: "مطالبة جودة خدمة",   party: "أرامكو",              type: "commercial",  value: 65000,  status: "closed"     },
];

const TYPE_LABEL = { labor: "عمالية", commercial: "تجارية", contractual: "تعاقدية" };
const STATUS = {
  review:     { label: "قيد النظر", cls: "review"     },
  settlement: { label: "تسوية",     cls: "settlement" },
  ruling:     { label: "حكم",       cls: "ruling"     },
  closed:     { label: "مغلقة",     cls: "closed"     },
};

const fmt = (n) => n.toLocaleString("en-US");

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .dis-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .dis-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .dis-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .dis-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#78716c1a; color:#78716c; flex-shrink:0}
  .dis-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .dis-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .dis-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .dis-period svg:first-child{color:#78716c}

  .dis-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .dis-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .dis-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .dis-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .dis-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .dis-kpi-val{font-size:24px; font-weight:700}
  .dis-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}
  .dis-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .dis-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  /* CASE STATUS */
  .dis-status{display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:16px}
  .dis-stat{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px; display:flex; align-items:center; gap:13px}
  .dis-stat-ic{width:44px; height:44px; border-radius:12px; display:grid; place-items:center; flex-shrink:0}
  .dis-stat-count{font-size:26px; font-weight:800; line-height:1; font-variant-numeric:tabular-nums}
  .dis-stat-name{font-size:12.5px; color:var(--ink2); font-weight:600; margin-top:3px}

  .dis-row{display:grid; grid-template-columns:1.6fr 1fr; gap:16px; align-items:start}
  .dis-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .dis-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .dis-card-title{font-size:15.5px; font-weight:700}
  .dis-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* TABLE */
  .dis-tablewrap{overflow-x:auto}
  table.dis-table{width:100%; border-collapse:collapse; min-width:560px}
  .dis-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .dis-table th.n, .dis-table td.n{text-align:left}
  .dis-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .dis-table tr:last-child td{border-bottom:none}
  .dis-case-name{font-weight:600; color:var(--ink); white-space:nowrap}
  .dis-case-party{color:var(--ink2); font-size:12px; white-space:nowrap}
  .dis-case-type{font-size:11px; font-weight:700; padding:3px 9px; border-radius:7px; background:#f1f0ee; color:#57534e; white-space:nowrap}
  .dis-case-val{font-weight:700; font-variant-numeric:tabular-nums; text-align:left}
  .dis-spill{display:inline-block; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap}
  .dis-spill.review{background:#dbeafe; color:#1d4ed8}
  .dis-spill.settlement{background:#ffedd5; color:#9a3412}
  .dis-spill.ruling{background:#ede9fe; color:#6d28d9}
  .dis-spill.closed{background:#dcfce7; color:#15803d}

  /* TYPES */
  .dis-types{display:flex; flex-direction:column; gap:14px}
  .dis-type-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .dis-type-name{display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600}
  .dis-type-dot{width:9px; height:9px; border-radius:3px; flex-shrink:0}
  .dis-type-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .dis-type-val .p{font-size:11px; color:var(--ink3); font-weight:600; margin-right:5px}
  .dis-type-bar{height:8px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .dis-type-bar i{display:block; height:100%; border-radius:999px}

  @media(max-width:1000px){
    .dis-kpis{grid-template-columns:repeat(2,1fr)}
    .dis-status{grid-template-columns:1fr}
    .dis-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .dis-root{padding:18px 14px}
    .dis-kpis{grid-template-columns:1fr}
    .dis-title{font-size:19px}
  }
`;

export default function DisputesView() {
  return (
    <div className="dis-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="dis-head">
        <div className="dis-head-ic"><Scale size={24} /></div>
        <div>
          <div className="dis-title">المنازعات</div>
          <div className="dis-sub">القضايا القانونية والتسويات · القانونية والامتثال</div>
        </div>
        <button className="dis-period">
          <Calendar size={16} /> الكل <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="dis-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="dis-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="dis-kpi-ic"><Icon size={19} /></div>
              <div className="dis-kpi-label">{k.label}</div>
              <div className="dis-kpi-val dis-num">
                {k.value}
                {k.unit && <span className="u">{k.unit}</span>}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* CASE STATUS */}
      <div className="dis-status">
        {CASE_STATUS.map((s) => {
          const Icon = s.icon;
          return (
            <div className="dis-stat" key={s.name}>
              <div className="dis-stat-ic" style={{ background: s.color + "1a", color: s.color }}>
                <Icon size={22} />
              </div>
              <div>
                <div className="dis-stat-count">{s.count}</div>
                <div className="dis-stat-name">{s.name}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW: TABLE + TYPES */}
      <div className="dis-row">

        <div className="dis-card" style={{ marginBottom: 0 }}>
          <div className="dis-card-head">
            <span className="dis-card-title">القضايا والمنازعات</span>
            <span className="dis-card-hint">{CASES.length} قضية</span>
          </div>
          <div className="dis-tablewrap">
            <table className="dis-table">
              <thead>
                <tr>
                  <th>القضية</th>
                  <th>الطرف</th>
                  <th>النوع</th>
                  <th className="n">القيمة</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {CASES.map((c, i) => {
                  const st = STATUS[c.status];
                  return (
                    <tr key={i}>
                      <td className="dis-case-name">{c.name}</td>
                      <td className="dis-case-party">{c.party}</td>
                      <td><span className="dis-case-type">{TYPE_LABEL[c.type]}</span></td>
                      <td className="dis-case-val n dis-num">{fmt(c.value)}</td>
                      <td><span className={`dis-spill ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dis-card" style={{ marginBottom: 0 }}>
          <div className="dis-card-head">
            <span className="dis-card-title">أنواع المنازعات</span>
            <Tag size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="dis-types">
            {TYPES.map((t) => (
              <div key={t.name}>
                <div className="dis-type-top">
                  <span className="dis-type-name">
                    <span className="dis-type-dot" style={{ background: t.color }} />
                    {t.name}
                  </span>
                  <span className="dis-type-val dis-num">{t.value}<span className="p">{t.pct}٪</span></span>
                </div>
                <div className="dis-type-bar"><i style={{ width: `${t.pct}%`, background: t.color }} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
