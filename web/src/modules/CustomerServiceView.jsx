import React from "react";
import {
  Ticket, Clock, CheckCircle2, Smile, MessageSquare, Tag, User,
  Calendar, ChevronDown, Headphones, TrendingUp
} from "lucide-react";

/* ============================================================
   خدمة العملاء — قسم المبيعات والتسويق
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getServiceSummary (دالة backend جديدة)
const KPIS = [
  { id: "open", label: "تذاكر مفتوحة",     value: "9",   sub: "تذكرة", icon: Ticket,       color: "#db2777" },
  { id: "resp", label: "متوسط الاستجابة",  value: "2.4", sub: "ساعة",  icon: Clock,        color: "#2563eb" },
  { id: "res",  label: "متوسط الحل",       value: "1.2", sub: "يوم",   icon: CheckCircle2, color: "#7c3aed" },
  { id: "csat", label: "رضا العملاء",      value: "91",  suffix: "%",  icon: Smile,        color: "#16a34a" },
];

// 🎫 تذاكر الدعم — مصدرها: getTickets
// priority: high=عالية · medium=متوسطة · low=منخفضة | status: open=مفتوحة · progress=قيد المعالجة · resolved=محلولة
const TICKETS = [
  { subject: "تأخر توريد عمالة",   client: "مشروع نيوم",         priority: "high",   status: "open"     },
  { subject: "طلب استبدال عامل",   client: "البحر الأحمر",       priority: "high",   status: "open"     },
  { subject: "شكوى جودة خدمة",     client: "أرامكو",             priority: "high",   status: "progress" },
  { subject: "استفسار عن فاتورة",  client: "مدينة الملك عبدالله", priority: "medium", status: "progress" },
  { subject: "تحديث بيانات العقد", client: "القدية",             priority: "low",    status: "resolved" },
];

// 🏷️ تصنيف التذاكر — مصدرها: getTickets (تجميع حسب النوع)
const TYPES = [
  { name: "استفسارات", value: 12, pct: 40, color: "#2563eb" },
  { name: "شكاوى",     value: 8,  pct: 27, color: "#dc2626" },
  { name: "طلبات",     value: 7,  pct: 23, color: "#ea580c" },
  { name: "تقني",      value: 3,  pct: 10, color: "#7c3aed" },
];

// 😊 رضا العملاء — مصدرها: getCSAT
const CSAT = { score: 91, delta: "+3%" };

// 👤 أداء فريق الدعم — مصدرها: getSupportTeam
const TEAM = [
  { name: "سعد الغامدي",   resolved: 24 },
  { name: "منى العتيبي",   resolved: 19 },
  { name: "فيصل القحطاني", resolved: 16 },
  { name: "رنا الشهري",    resolved: 12 },
];

const PRI = {
  high:   { label: "عالية",   cls: "high"   },
  medium: { label: "متوسطة",  cls: "medium" },
  low:    { label: "منخفضة",  cls: "low"    },
};
const STATUS = {
  open:     { label: "مفتوحة",       cls: "open"     },
  progress: { label: "قيد المعالجة", cls: "progress" },
  resolved: { label: "محلولة",       cls: "resolved" },
};

const maxTeam = Math.max(...TEAM.map((t) => t.resolved));

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .cs-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .cs-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .cs-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .cs-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#db27771a; color:#db2777; flex-shrink:0}
  .cs-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .cs-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .cs-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .cs-period svg:first-child{color:#db2777}

  .cs-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .cs-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .cs-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .cs-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .cs-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .cs-kpi-val{font-size:24px; font-weight:700}
  .cs-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .cs-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .cs-row{display:grid; gap:16px; margin-bottom:16px; align-items:start}
  .cs-row.a{grid-template-columns:1.6fr 1fr}
  .cs-row.b{grid-template-columns:1.5fr 1fr}
  .cs-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .cs-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .cs-card-title{font-size:15.5px; font-weight:700}
  .cs-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* TICKETS TABLE */
  .cs-tablewrap{overflow-x:auto}
  table.cs-table{width:100%; border-collapse:collapse; min-width:520px}
  .cs-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .cs-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .cs-table tr:last-child td{border-bottom:none}
  .cs-tk-subject{font-weight:600; color:var(--ink); white-space:nowrap}
  .cs-tk-client{color:var(--ink2); white-space:nowrap}
  .cs-pill{display:inline-block; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap}
  .cs-pill.high{background:#fee2e2; color:#b91c1c}
  .cs-pill.medium{background:#ffedd5; color:#9a3412}
  .cs-pill.low{background:#eef1f6; color:#64748b}
  .cs-st{font-size:11px; font-weight:700}
  .cs-st.open{color:#9a3412} .cs-st.progress{color:#1d4ed8} .cs-st.resolved{color:#15803d}

  /* TYPES */
  .cs-types{display:flex; flex-direction:column; gap:14px}
  .cs-type-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .cs-type-name{display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600}
  .cs-type-dot{width:9px; height:9px; border-radius:3px; flex-shrink:0}
  .cs-type-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .cs-type-val .p{font-size:11px; color:var(--ink3); font-weight:600; margin-right:5px}
  .cs-type-bar{height:8px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .cs-type-bar i{display:block; height:100%; border-radius:999px}

  /* TEAM */
  .cs-team{display:flex; flex-direction:column; gap:14px}
  .cs-team-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .cs-team-name{display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:600}
  .cs-team-ic{width:28px; height:28px; border-radius:50%; background:#db27771a; color:#db2777; display:grid; place-items:center; flex-shrink:0}
  .cs-team-val{font-size:12.5px; font-weight:700; font-variant-numeric:tabular-nums}
  .cs-team-bar{height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .cs-team-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#db2777,#f472b6)}

  /* CSAT */
  .cs-csat{text-align:center; padding:8px 0}
  .cs-csat-big{font-size:50px; font-weight:800; line-height:1; color:#16a34a}
  .cs-csat-big .p{font-size:27px}
  .cs-csat-delta{display:inline-flex; align-items:center; gap:3px; font-size:12.5px; font-weight:700; color:#15803d; background:#dcfce7; padding:4px 11px; border-radius:999px; margin-top:12px}
  .cs-csat-cap{font-size:12px; color:var(--ink3); margin-top:12px; line-height:1.5}
  .cs-csat-bar{height:9px; background:#eef1f6; border-radius:999px; overflow:hidden; margin-top:16px}
  .cs-csat-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#16a34a,#4ade80)}

  @media(max-width:1000px){
    .cs-kpis{grid-template-columns:repeat(2,1fr)}
    .cs-row.a,.cs-row.b{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .cs-root{padding:18px 14px}
    .cs-kpis{grid-template-columns:1fr}
    .cs-title{font-size:19px}
  }
`;

export default function CustomerServiceView() {
  return (
    <div className="cs-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="cs-head">
        <div className="cs-head-ic"><Headphones size={24} /></div>
        <div>
          <div className="cs-title">خدمة العملاء</div>
          <div className="cs-sub">تذاكر الدعم ورضا العملاء · المبيعات والتسويق</div>
        </div>
        <button className="cs-period">
          <Calendar size={16} /> هذا الشهر <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="cs-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="cs-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="cs-kpi-ic"><Icon size={19} /></div>
              <div className="cs-kpi-label">{k.label}</div>
              <div className="cs-kpi-val cs-num">
                {k.value}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW A: TICKETS + TYPES */}
      <div className="cs-row a">

        <div className="cs-card" style={{ marginBottom: 0 }}>
          <div className="cs-card-head">
            <span className="cs-card-title">تذاكر الدعم</span>
            <span className="cs-card-hint">{TICKETS.length} تذكرة</span>
          </div>
          <div className="cs-tablewrap">
            <table className="cs-table">
              <thead>
                <tr>
                  <th>الموضوع</th>
                  <th>العميل</th>
                  <th>الأولوية</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {TICKETS.map((t, i) => {
                  const pr = PRI[t.priority];
                  const st = STATUS[t.status];
                  return (
                    <tr key={i}>
                      <td className="cs-tk-subject">{t.subject}</td>
                      <td className="cs-tk-client">{t.client}</td>
                      <td><span className={`cs-pill ${pr.cls}`}>{pr.label}</span></td>
                      <td><span className={`cs-st ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="cs-card" style={{ marginBottom: 0 }}>
          <div className="cs-card-head">
            <span className="cs-card-title">تصنيف التذاكر</span>
            <Tag size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="cs-types">
            {TYPES.map((t) => (
              <div key={t.name}>
                <div className="cs-type-top">
                  <span className="cs-type-name">
                    <span className="cs-type-dot" style={{ background: t.color }} />
                    {t.name}
                  </span>
                  <span className="cs-type-val cs-num">{t.value}<span className="p">{t.pct}٪</span></span>
                </div>
                <div className="cs-type-bar"><i style={{ width: `${t.pct}%`, background: t.color }} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ROW B: TEAM + CSAT */}
      <div className="cs-row b">

        <div className="cs-card" style={{ marginBottom: 0 }}>
          <div className="cs-card-head">
            <span className="cs-card-title">أداء فريق الدعم</span>
            <span className="cs-card-hint">تذاكر محلولة</span>
          </div>
          <div className="cs-team">
            {TEAM.map((t, i) => (
              <div key={i}>
                <div className="cs-team-top">
                  <span className="cs-team-name">
                    <span className="cs-team-ic"><User size={14} /></span>
                    {t.name}
                  </span>
                  <span className="cs-team-val cs-num">{t.resolved} تذكرة</span>
                </div>
                <div className="cs-team-bar"><i style={{ width: `${(t.resolved / maxTeam) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="cs-card" style={{ marginBottom: 0 }}>
          <div className="cs-card-head">
            <span className="cs-card-title">رضا العملاء (CSAT)</span>
          </div>
          <div className="cs-csat">
            <div className="cs-csat-big cs-num">{CSAT.score}<span className="p">٪</span></div>
            <div className="cs-csat-delta"><TrendingUp size={13} />{CSAT.delta} عن الشهر السابق</div>
            <div className="cs-csat-cap">نسبة العملاء الراضين عن الخدمة</div>
            <div className="cs-csat-bar"><i style={{ width: `${CSAT.score}%` }} /></div>
          </div>
        </div>

      </div>
    </div>
  );
}
