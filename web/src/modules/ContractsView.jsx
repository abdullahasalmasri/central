import React from "react";
import {
  FileText, Wallet, CalendarClock, RefreshCw, Users, Wrench, Home,
  Calendar, ChevronDown, Tag, AlertTriangle
} from "lucide-react";

/* ============================================================
   العقود — قسم القانونية والامتثال
   البيانات تجريبية. دالة backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getContracts (دالة backend جديدة)
const KPIS = [
  { id: "active",   label: "عقود نشطة",        value: "16", sub: "عقد",         icon: FileText,      color: "#78716c" },
  { id: "value",    label: "القيمة الإجمالية", value: "8,400,000", unit: "ر.س", icon: Wallet,        color: "#059669" },
  { id: "expiring", label: "تنتهي قريبًا",     value: "3",  sub: "خلال ٣٠ يوم", icon: CalendarClock, color: "#ea580c" },
  { id: "renew",    label: "قيد التجديد",      value: "2",  sub: "عقد",         icon: RefreshCw,     color: "#2563eb" },
];

// 🏷️ أنواع العقود — مصدرها: getContracts (تجميع حسب النوع)
const TYPES = [
  { name: "توريد عمالة", value: 9, pct: 56, icon: Users,  color: "#78716c" },
  { name: "خدمات",       value: 4, pct: 25, icon: Wrench, color: "#2563eb" },
  { name: "إيجارات",     value: 3, pct: 19, icon: Home,   color: "#7c3aed" },
];

// 🔔 متابعة التجديد — مصدرها: getContracts (القريبة الانتهاء)
const RENEWALS = [
  { name: "عقد توريد فنيين", party: "مشروع نيوم",          days: 12 },
  { name: "عقد صيانة شاملة", party: "مدينة الملك عبدالله", days: 25 },
  { name: "إيجار مجمّع سكن", party: "الجبيل",              days: 28 },
];

// 📄 العقود النشطة — مصدرها: getContracts
// type: supply=توريد · service=خدمة · rent=إيجار | status: active=نشط · expiring=ينتهي قريبًا · expired=منتهٍ
const CONTRACTS = [
  { name: "توريد عمالة فنية",   party: "أرامكو",             type: "supply",  value: 2400000, end: "١٥ ديسمبر ٢٠٢٦", status: "active"   },
  { name: "توريد سائقين",       party: "نيوم",               type: "supply",  value: 1800000, end: "٨ يوليو ٢٠٢٦",   status: "expiring" },
  { name: "عقد صيانة شاملة",    party: "مدينة الملك عبدالله", type: "service", value: 540000,  end: "٢٠ يوليو ٢٠٢٦",  status: "expiring" },
  { name: "إيجار مجمّع سكن",    party: "الجبيل",             type: "rent",    value: 720000,  end: "٢٣ يوليو ٢٠٢٦",  status: "expiring" },
  { name: "توريد عمالة موسمية", party: "البحر الأحمر",       type: "supply",  value: 950000,  end: "٣٠ مارس ٢٠٢٧",   status: "active"   },
  { name: "عقد تشغيل معدّات",   party: "القدية",             type: "service", value: 480000,  end: "١٠ يناير ٢٠٢٧",  status: "active"   },
];

const TYPE_LABEL = { supply: "توريد", service: "خدمة", rent: "إيجار" };
const STATUS = {
  active:   { label: "نشط",         cls: "active"   },
  expiring: { label: "ينتهي قريبًا", cls: "expiring" },
  expired:  { label: "منتهٍ",        cls: "expired"  },
};

const fmt = (n) => n.toLocaleString("en-US");

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .con-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .con-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .con-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .con-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#78716c1a; color:#78716c; flex-shrink:0}
  .con-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .con-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .con-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .con-period svg:first-child{color:#78716c}

  .con-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .con-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .con-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .con-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .con-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .con-kpi-val{font-size:24px; font-weight:700}
  .con-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}
  .con-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  .con-row{display:grid; grid-template-columns:1.6fr 1fr; gap:16px; margin-bottom:16px; align-items:start}
  .con-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .con-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .con-card-title{font-size:15.5px; font-weight:700}
  .con-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* TABLE */
  .con-tablewrap{overflow-x:auto}
  table.con-table{width:100%; border-collapse:collapse; min-width:600px}
  .con-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .con-table th.n, .con-table td.n{text-align:left}
  .con-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .con-table tr:last-child td{border-bottom:none}
  .con-c-name{font-weight:600; color:var(--ink); white-space:nowrap}
  .con-c-party{color:var(--ink2); white-space:nowrap}
  .con-c-type{font-size:11px; font-weight:700; padding:3px 9px; border-radius:7px; background:#f1f0ee; color:#57534e; white-space:nowrap}
  .con-c-val{font-weight:700; font-variant-numeric:tabular-nums; text-align:left}
  .con-c-end{color:var(--ink2); font-size:12px; white-space:nowrap}
  .con-spill{display:inline-block; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap}
  .con-spill.active{background:#dcfce7; color:#15803d}
  .con-spill.expiring{background:#ffedd5; color:#9a3412}
  .con-spill.expired{background:#eef1f6; color:#64748b}

  /* TYPES */
  .con-types{display:flex; flex-direction:column; gap:14px}
  .con-type-top{display:flex; align-items:center; justify-content:space-between; margin-bottom:7px}
  .con-type-name{display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600}
  .con-type-ic{width:26px; height:26px; border-radius:7px; display:grid; place-items:center; flex-shrink:0}
  .con-type-val{font-size:13px; font-weight:700; font-variant-numeric:tabular-nums}
  .con-type-val .p{font-size:11px; color:var(--ink3); font-weight:600; margin-right:5px}
  .con-type-bar{height:8px; background:#eef1f6; border-radius:999px; overflow:hidden}
  .con-type-bar i{display:block; height:100%; border-radius:999px}

  /* RENEWALS */
  .con-renewals{display:flex; flex-direction:column; gap:10px}
  .con-renewal{display:flex; align-items:center; gap:12px; padding:13px 14px; border-radius:12px; background:#fffbeb; border:1px solid #fde68a}
  .con-renewal-ic{width:34px; height:34px; border-radius:9px; background:#fef3c7; color:#d97706; display:grid; place-items:center; flex-shrink:0}
  .con-renewal-info{flex:1; min-width:0}
  .con-renewal-name{font-size:13px; font-weight:600}
  .con-renewal-party{font-size:11.5px; color:var(--ink3); margin-top:1px}
  .con-renewal-days{font-size:12px; font-weight:700; color:#9a3412; background:#ffedd5; padding:5px 11px; border-radius:999px; flex-shrink:0; white-space:nowrap}

  @media(max-width:1000px){
    .con-kpis{grid-template-columns:repeat(2,1fr)}
    .con-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .con-root{padding:18px 14px}
    .con-kpis{grid-template-columns:1fr}
    .con-title{font-size:19px}
  }
`;

export default function ContractsView() {
  return (
    <div className="con-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="con-head">
        <div className="con-head-ic"><FileText size={24} /></div>
        <div>
          <div className="con-title">العقود</div>
          <div className="con-sub">عقود العملاء والموردين ومتابعة التجديد · القانونية والامتثال</div>
        </div>
        <button className="con-period">
          <Calendar size={16} /> الكل <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="con-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="con-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="con-kpi-ic"><Icon size={19} /></div>
              <div className="con-kpi-label">{k.label}</div>
              <div className="con-kpi-val con-num">
                {k.value}
                {k.unit && <span className="u">{k.unit}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* ROW: TABLE + TYPES */}
      <div className="con-row">

        <div className="con-card" style={{ marginBottom: 0 }}>
          <div className="con-card-head">
            <span className="con-card-title">العقود النشطة</span>
            <span className="con-card-hint">{CONTRACTS.length} عقد</span>
          </div>
          <div className="con-tablewrap">
            <table className="con-table">
              <thead>
                <tr>
                  <th>العقد</th>
                  <th>الطرف</th>
                  <th>النوع</th>
                  <th className="n">القيمة</th>
                  <th>الانتهاء</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {CONTRACTS.map((c, i) => {
                  const st = STATUS[c.status];
                  return (
                    <tr key={i}>
                      <td className="con-c-name">{c.name}</td>
                      <td className="con-c-party">{c.party}</td>
                      <td><span className="con-c-type">{TYPE_LABEL[c.type]}</span></td>
                      <td className="con-c-val n con-num">{fmt(c.value)}</td>
                      <td className="con-c-end">{c.end}</td>
                      <td><span className={`con-spill ${st.cls}`}>{st.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="con-card" style={{ marginBottom: 0 }}>
          <div className="con-card-head">
            <span className="con-card-title">أنواع العقود</span>
            <Tag size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="con-types">
            {TYPES.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.name}>
                  <div className="con-type-top">
                    <span className="con-type-name">
                      <span className="con-type-ic" style={{ background: t.color + "1a", color: t.color }}>
                        <Icon size={14} />
                      </span>
                      {t.name}
                    </span>
                    <span className="con-type-val con-num">{t.value}<span className="p">{t.pct}٪</span></span>
                  </div>
                  <div className="con-type-bar"><i style={{ width: `${t.pct}%`, background: t.color }} /></div>
                </div>
              );
            })}
          </div>
        </div>

      </div>

      {/* RENEWALS */}
      <div className="con-card">
        <div className="con-card-head">
          <span className="con-card-title">متابعة التجديد — عقود قريبة الانتهاء</span>
          <AlertTriangle size={17} style={{ color: "#94a0b8" }} />
        </div>
        <div className="con-renewals">
          {RENEWALS.map((r, i) => (
            <div className="con-renewal" key={i}>
              <div className="con-renewal-ic"><CalendarClock size={16} /></div>
              <div className="con-renewal-info">
                <div className="con-renewal-name">{r.name}</div>
                <div className="con-renewal-party">{r.party}</div>
              </div>
              <span className="con-renewal-days">ينتهي خلال {r.days} يوم</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
