import React from "react";
import {
  MessageSquareWarning, Smile, Clock, CheckCircle2, Megaphone,
  Trophy, Calendar, ChevronDown, TrendingUp, Star
} from "lucide-react";

/* ============================================================
   علاقات الموظفين — قسم الموارد البشرية
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getEmployeeRelations (دالة backend جديدة)
const KPIS = [
  { id: "open",     label: "حالات مفتوحة",     value: "4",  sub: "حالة",  icon: MessageSquareWarning, color: "#ea580c" },
  { id: "sat",      label: "رضا الموظفين",      value: "82", suffix: "%",  icon: Smile,                color: "#16a34a" },
  { id: "time",     label: "متوسط وقت الحل",    value: "5",  sub: "أيام",  icon: Clock,                color: "#2563eb" },
  { id: "resolved", label: "محلولة هذا الشهر",  value: "11", sub: "حالة",  icon: CheckCircle2,         color: "#7c3aed" },
];

// 📋 الحالات والشكاوى — مصدرها: getCases
// status: open = مفتوحة · progress = قيد المعالجة · resolved = محلولة
const CASES = [
  { type: "طلب نقل قسم",         name: "أحمد العتيبي",  dept: "العمليات",        date: "٢٠ يونيو", status: "progress" },
  { type: "شكوى بيئة عمل",       name: "سارة القحطاني", dept: "المالية",         date: "١٨ يونيو", status: "open"     },
  { type: "طلب إجازة استثنائية", name: "نورة الدوسري",  dept: "الموارد البشرية", date: "١٩ يونيو", status: "progress" },
  { type: "استفسار راتب",        name: "فهد المطيري",   dept: "المبيعات",        date: "٢٢ يونيو", status: "resolved" },
  { type: "نزاع بين زملاء",      name: "خالد الشهري",   dept: "العمليات",        date: "١٥ يونيو", status: "resolved" },
];

// 😊 مؤشر الانخراط — مصدرها: getEngagement
const ENGAGEMENT = {
  score: 82, delta: "+4%",
  dimensions: [
    { name: "بيئة العمل", value: 85 },
    { name: "القيادة",    value: 80 },
    { name: "التطوير",    value: 78 },
    { name: "التوازن",    value: 84 },
  ],
};

// 📢 الإعلانات الداخلية — مصدرها: getAnnouncements
const ANNOUNCEMENTS = [
  { title: "تحديث سياسة العمل المرن",        date: "٢٣ يونيو" },
  { title: "حفل تكريم الموظفين المتميزين",   date: "٢١ يونيو" },
  { title: "برنامج التأمين الصحي الجديد",    date: "١٨ يونيو" },
];

// 🏆 التقدير والتكريم — مصدرها: getRecognition
const RECOGNITION = {
  employee: "خالد الشهري", dept: "العمليات",
  reason: "أداء استثنائي في إدارة مشروع نيوم",
  achievements: ["أعلى تقييم أداء للربع", "إتمام ٣ مشاريع قبل موعدها"],
};

const STATUS = {
  open:     { label: "مفتوحة",        cls: "open"     },
  progress: { label: "قيد المعالجة",  cls: "progress" },
  resolved: { label: "محلولة",        cls: "resolved" },
};

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .rel-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .rel-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .rel-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .rel-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#2563eb1a; color:#2563eb; flex-shrink:0}
  .rel-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .rel-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .rel-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .rel-period svg:first-child{color:#2563eb}

  .rel-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .rel-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .rel-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .rel-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .rel-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .rel-kpi-val{font-size:24px; font-weight:700}
  .rel-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .rel-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .rel-row{display:grid; gap:16px; margin-bottom:16px; align-items:start}
  .rel-row.a{grid-template-columns:1.6fr 1fr}
  .rel-row.b{grid-template-columns:1fr 1fr}
  .rel-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .rel-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .rel-card-title{font-size:15.5px; font-weight:700}
  .rel-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* CASES TABLE */
  .rel-tablewrap{overflow-x:auto}
  table.rel-table{width:100%; border-collapse:collapse; min-width:520px}
  .rel-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .rel-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .rel-table tr:last-child td{border-bottom:none}
  .rel-case-type{font-weight:600; color:var(--ink); white-space:nowrap}
  .rel-case-emp{color:var(--ink); white-space:nowrap}
  .rel-case-dept{font-size:11px; color:var(--ink3)}
  .rel-case-date{color:var(--ink3); font-size:12px; white-space:nowrap}
  .rel-spill{display:inline-block; font-size:11px; font-weight:700; padding:4px 11px; border-radius:999px; white-space:nowrap}
  .rel-spill.open{background:#ffedd5; color:#9a3412}
  .rel-spill.progress{background:#dbeafe; color:#1d4ed8}
  .rel-spill.resolved{background:#dcfce7; color:#15803d}

  /* ENGAGEMENT */
  .rel-eng-score{display:flex; align-items:baseline; gap:9px; margin-bottom:5px}
  .rel-eng-big{font-size:46px; font-weight:800; line-height:1; color:#16a34a}
  .rel-eng-big .p{font-size:24px}
  .rel-eng-delta{display:inline-flex; align-items:center; gap:3px; font-size:12.5px; font-weight:700; color:#15803d; background:#dcfce7; padding:4px 10px; border-radius:999px}
  .rel-eng-cap{font-size:12px; color:var(--ink3); margin-bottom:18px}
  .rel-dims{display:flex; flex-direction:column; gap:12px}
  .rel-dim-top{display:flex; justify-content:space-between; font-size:12.5px; margin-bottom:6px}
  .rel-dim-name{color:var(--ink2); font-weight:600}
  .rel-dim-val{font-weight:700; font-variant-numeric:tabular-nums}
  .rel-dim-bar{height:7px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .rel-dim-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#16a34a,#4ade80)}

  /* ANNOUNCEMENTS */
  .rel-anns{display:flex; flex-direction:column; gap:10px}
  .rel-ann{display:flex; align-items:center; gap:12px; padding:12px 13px; border-radius:12px; background:var(--bg); border:1px solid var(--line)}
  .rel-ann-ic{width:34px; height:34px; border-radius:9px; background:#dbeafe; color:#2563eb; display:grid; place-items:center; flex-shrink:0}
  .rel-ann-info{flex:1; min-width:0}
  .rel-ann-title{font-size:13px; font-weight:600}
  .rel-ann-date{font-size:11.5px; color:var(--ink3); margin-top:1px}

  /* RECOGNITION */
  .rel-recog{text-align:center; padding:6px 0 0}
  .rel-recog-crown{width:60px; height:60px; border-radius:50%; background:linear-gradient(160deg,#fbbf24,#f59e0b); display:grid; place-items:center; margin:0 auto 13px; color:#fff}
  .rel-recog-name{font-size:17px; font-weight:800}
  .rel-recog-dept{font-size:12.5px; color:var(--ink3); margin-top:2px}
  .rel-recog-reason{font-size:12.5px; color:var(--ink2); margin-top:11px; line-height:1.5; background:var(--bg); padding:10px 13px; border-radius:11px}
  .rel-recog-ach{display:flex; flex-direction:column; gap:8px; margin-top:13px; text-align:right}
  .rel-recog-item{display:flex; align-items:center; gap:9px; font-size:12.5px; color:var(--ink2); font-weight:500}
  .rel-recog-item svg{color:#f59e0b; flex-shrink:0}

  @media(max-width:1000px){
    .rel-kpis{grid-template-columns:repeat(2,1fr)}
    .rel-row.a,.rel-row.b{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .rel-root{padding:18px 14px}
    .rel-kpis{grid-template-columns:1fr}
    .rel-title{font-size:19px}
  }
`;

export default function EmployeeRelationsView() {
  return (
    <div className="rel-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="rel-head">
        <div className="rel-head-ic"><Smile size={24} /></div>
        <div>
          <div className="rel-title">علاقات الموظفين</div>
          <div className="rel-sub">الحالات والرضا والتواصل الداخلي · الموارد البشرية</div>
        </div>
        <button className="rel-period">
          <Calendar size={16} /> هذا الشهر <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="rel-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="rel-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="rel-kpi-ic"><Icon size={19} /></div>
              <div className="rel-kpi-label">{k.label}</div>
              <div className="rel-kpi-val rel-num">
                {k.value}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW A: CASES + ENGAGEMENT */}
      <div className="rel-row a">

        <div className="rel-card" style={{ marginBottom: 0 }}>
          <div className="rel-card-head">
            <span className="rel-card-title">الحالات والشكاوى</span>
            <span className="rel-card-hint">{CASES.length} حالة</span>
          </div>
          <div className="rel-tablewrap">
            <table className="rel-table">
              <thead>
                <tr>
                  <th>النوع</th>
                  <th>الموظف</th>
                  <th>التاريخ</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {CASES.map((c, i) => {
                  const st = STATUS[c.status];
                  return (
                    <tr key={i}>
                      <td className="rel-case-type">{c.type}</td>
                      <td>
                        <div className="rel-case-emp">{c.name}</div>
                        <div className="rel-case-dept">{c.dept}</div>
                      </td>
                      <td className="rel-case-date">{c.date}</td>
                      <td><span className={`rel-spill ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rel-card" style={{ marginBottom: 0 }}>
          <div className="rel-card-head">
            <span className="rel-card-title">مؤشر رضا الموظفين</span>
          </div>
          <div className="rel-eng-score">
            <span className="rel-eng-big rel-num">{ENGAGEMENT.score}<span className="p">٪</span></span>
            <span className="rel-eng-delta"><TrendingUp size={13} />{ENGAGEMENT.delta}</span>
          </div>
          <div className="rel-eng-cap">نبض الانخراط مقابل الربع السابق</div>
          <div className="rel-dims">
            {ENGAGEMENT.dimensions.map((d) => (
              <div key={d.name}>
                <div className="rel-dim-top">
                  <span className="rel-dim-name">{d.name}</span>
                  <span className="rel-dim-val rel-num">{d.value}٪</span>
                </div>
                <div className="rel-dim-bar"><i style={{ width: `${d.value}%` }} /></div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ROW B: ANNOUNCEMENTS + RECOGNITION */}
      <div className="rel-row b">

        <div className="rel-card" style={{ marginBottom: 0 }}>
          <div className="rel-card-head">
            <span className="rel-card-title">الإعلانات الداخلية</span>
            <Megaphone size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="rel-anns">
            {ANNOUNCEMENTS.map((a, i) => (
              <div className="rel-ann" key={i}>
                <div className="rel-ann-ic"><Megaphone size={15} /></div>
                <div className="rel-ann-info">
                  <div className="rel-ann-title">{a.title}</div>
                  <div className="rel-ann-date">{a.date}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rel-card" style={{ marginBottom: 0 }}>
          <div className="rel-card-head">
            <span className="rel-card-title">التقدير والتكريم</span>
            <Trophy size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="rel-recog">
            <div className="rel-recog-crown"><Trophy size={28} /></div>
            <div className="rel-recog-name">{RECOGNITION.employee}</div>
            <div className="rel-recog-dept">موظف الشهر · {RECOGNITION.dept}</div>
            <div className="rel-recog-reason">{RECOGNITION.reason}</div>
            <div className="rel-recog-ach">
              {RECOGNITION.achievements.map((a, i) => (
                <div className="rel-recog-item" key={i}>
                  <Star size={14} /> {a}
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
