import React from "react";
import {
  ShieldCheck, FileCheck, CalendarClock, AlertTriangle, CheckCircle2,
  Calendar, ChevronDown, BadgeCheck, XCircle
} from "lucide-react";

/* ============================================================
   الامتثال والتراخيص — قسم القانونية والامتثال (مهم للسوق السعودي)
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getComplianceSummary (دالة backend جديدة)
const KPIS = [
  { id: "rate",     label: "نسبة الامتثال",   value: "92", suffix: "%", icon: ShieldCheck,   color: "#16a34a" },
  { id: "valid",    label: "تراخيص سارية",    value: "7",  sub: "ترخيص", icon: FileCheck,     color: "#78716c" },
  { id: "expiring", label: "تنتهي قريبًا",    value: "2",  sub: "ترخيص", icon: CalendarClock, color: "#ea580c" },
  { id: "viol",     label: "مخالفات مفتوحة",  value: "1",  sub: "مخالفة",icon: AlertTriangle, color: "#dc2626" },
];

// ✅ متطلبات الامتثال — مصدرها: getComplianceStatus
const REQUIREMENTS = [
  { name: "فوترة ZATCA",        note: "فوترة إلكترونية معتمدة", ok: true  },
  { name: "التأمينات (GOSI)",   note: "اشتراكات محدّثة",        ok: true  },
  { name: "نطاقات — السعودة",   note: "النطاق الأخضر",          ok: true  },
  { name: "حماية الأجور (WPS)", note: "الرواتب عبر النظام",     ok: true  },
  { name: "رخصة مكتب العمل",    note: "تحتاج تجديد",            ok: false },
];

// 📜 التراخيص والتصاريح — مصدرها: getLicenses
// status: valid=ساري · expiring=ينتهي قريبًا · expired=منتهٍ
const LICENSES = [
  { name: "السجل التجاري",            authority: "وزارة التجارة",   end: "١٢ مارس ٢٠٢٧",   status: "valid"    },
  { name: "رخصة مكتب توريد العمالة",  authority: "الموارد البشرية", end: "٨ يوليو ٢٠٢٦",   status: "expiring" },
  { name: "شهادة الزكاة والضريبة",    authority: "هيئة الزكاة",     end: "٣٠ يونيو ٢٠٢٦",  status: "expiring" },
  { name: "رخصة البلدية",            authority: "أمانة المنطقة",   end: "١٥ يناير ٢٠٢٧",  status: "valid"    },
  { name: "شهادة السعودة",           authority: "الموارد البشرية", end: "٢٠ أكتوبر ٢٠٢٦", status: "valid"    },
  { name: "تصريح السلامة",           authority: "الدفاع المدني",   end: "٥ سبتمبر ٢٠٢٦",  status: "valid"    },
];

// 🔔 متابعة التجديد — مصدرها: getLicenses (القريبة الانتهاء)
const RENEWALS = [
  { name: "رخصة مكتب التوريد",     days: 8 },
  { name: "شهادة الزكاة والضريبة", days: 4 },
];

const STATUS = {
  valid:    { label: "ساري",         cls: "valid"    },
  expiring: { label: "ينتهي قريبًا", cls: "expiring" },
  expired:  { label: "منتهٍ",        cls: "expired"  },
};

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .com-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .com-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .com-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .com-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#78716c1a; color:#78716c; flex-shrink:0}
  .com-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .com-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .com-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .com-period svg:first-child{color:#78716c}

  .com-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .com-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .com-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .com-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .com-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .com-kpi-val{font-size:24px; font-weight:700}
  .com-kpi-val .x{font-size:15px; color:var(--ink3); font-weight:600}
  .com-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .com-row{display:grid; grid-template-columns:1.5fr 1fr; gap:16px; margin-bottom:16px; align-items:start}
  .com-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .com-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .com-card-title{font-size:15.5px; font-weight:700}
  .com-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* TABLE */
  .com-tablewrap{overflow-x:auto}
  table.com-table{width:100%; border-collapse:collapse; min-width:480px}
  .com-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .com-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .com-table tr:last-child td{border-bottom:none}
  .com-lic-name{font-weight:600; color:var(--ink); white-space:nowrap}
  .com-lic-auth{color:var(--ink2); font-size:12px; white-space:nowrap}
  .com-lic-end{color:var(--ink2); font-size:12px; white-space:nowrap}
  .com-spill{display:inline-block; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap}
  .com-spill.valid{background:#dcfce7; color:#15803d}
  .com-spill.expiring{background:#ffedd5; color:#9a3412}
  .com-spill.expired{background:#fee2e2; color:#b91c1c}

  /* REQUIREMENTS */
  .com-reqs{display:flex; flex-direction:column; gap:10px}
  .com-req{display:flex; align-items:center; gap:11px; padding:12px 13px; border-radius:12px; background:var(--bg); border:1px solid var(--line)}
  .com-req-ic{width:32px; height:32px; border-radius:9px; display:grid; place-items:center; flex-shrink:0}
  .com-req-ic.ok{background:#dcfce7; color:#16a34a}
  .com-req-ic.no{background:#ffedd5; color:#d97706}
  .com-req-info{flex:1; min-width:0}
  .com-req-name{font-size:13px; font-weight:600}
  .com-req-note{font-size:11.5px; color:var(--ink3); margin-top:1px}
  .com-req-badge{font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; flex-shrink:0; white-space:nowrap}
  .com-req-badge.ok{background:#dcfce7; color:#15803d}
  .com-req-badge.no{background:#fef3c7; color:#92740a}

  /* RENEWALS */
  .com-renewals{display:flex; flex-direction:column; gap:10px}
  .com-renewal{display:flex; align-items:center; gap:12px; padding:13px 14px; border-radius:12px; background:#fffbeb; border:1px solid #fde68a}
  .com-renewal-ic{width:34px; height:34px; border-radius:9px; background:#fef3c7; color:#d97706; display:grid; place-items:center; flex-shrink:0}
  .com-renewal-name{flex:1; min-width:0; font-size:13px; font-weight:600}
  .com-renewal-days{font-size:12px; font-weight:700; color:#9a3412; background:#ffedd5; padding:5px 11px; border-radius:999px; flex-shrink:0; white-space:nowrap}

  @media(max-width:1000px){
    .com-kpis{grid-template-columns:repeat(2,1fr)}
    .com-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .com-root{padding:18px 14px}
    .com-kpis{grid-template-columns:1fr}
    .com-title{font-size:19px}
  }
`;

export default function ComplianceView() {
  return (
    <div className="com-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="com-head">
        <div className="com-head-ic"><BadgeCheck size={24} /></div>
        <div>
          <div className="com-title">الامتثال والتراخيص</div>
          <div className="com-sub">التراخيص النظامية ومتطلبات الامتثال · القانونية والامتثال</div>
        </div>
        <button className="com-period">
          <Calendar size={16} /> الكل <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="com-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="com-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="com-kpi-ic"><Icon size={19} /></div>
              <div className="com-kpi-label">{k.label}</div>
              <div className="com-kpi-val com-num">
                {k.value}
                {k.suffix && <span className="x">{k.suffix}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW: LICENSES TABLE + REQUIREMENTS */}
      <div className="com-row">

        <div className="com-card" style={{ marginBottom: 0 }}>
          <div className="com-card-head">
            <span className="com-card-title">التراخيص والتصاريح</span>
            <span className="com-card-hint">{LICENSES.length} ترخيص</span>
          </div>
          <div className="com-tablewrap">
            <table className="com-table">
              <thead>
                <tr>
                  <th>الترخيص</th>
                  <th>الجهة</th>
                  <th>الانتهاء</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {LICENSES.map((l, i) => {
                  const st = STATUS[l.status];
                  return (
                    <tr key={i}>
                      <td className="com-lic-name">{l.name}</td>
                      <td className="com-lic-auth">{l.authority}</td>
                      <td className="com-lic-end">{l.end}</td>
                      <td><span className={`com-spill ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="com-card" style={{ marginBottom: 0 }}>
          <div className="com-card-head">
            <span className="com-card-title">متطلبات الامتثال</span>
            <ShieldCheck size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="com-reqs">
            {REQUIREMENTS.map((r, i) => (
              <div className="com-req" key={i}>
                <div className={`com-req-ic ${r.ok ? "ok" : "no"}`}>
                  {r.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                </div>
                <div className="com-req-info">
                  <div className="com-req-name">{r.name}</div>
                  <div className="com-req-note">{r.note}</div>
                </div>
                <span className={`com-req-badge ${r.ok ? "ok" : "no"}`}>
                  {r.ok ? "ممتثل" : "إجراء"}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* RENEWALS */}
      <div className="com-card">
        <div className="com-card-head">
          <span className="com-card-title">متابعة تجديد التراخيص</span>
          <AlertTriangle size={17} style={{ color: "#94a0b8" }} />
        </div>
        <div className="com-renewals">
          {RENEWALS.map((r, i) => (
            <div className="com-renewal" key={i}>
              <div className="com-renewal-ic"><CalendarClock size={16} /></div>
              <span className="com-renewal-name">{r.name}</span>
              <span className="com-renewal-days">ينتهي خلال {r.days} يوم</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
