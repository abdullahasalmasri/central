import React, { useState } from "react";
import {
  Banknote, Users, CheckCircle2, AlertTriangle, CreditCard,
  Plus, X, Calendar, ChevronDown, Wallet, Clock, TrendingDown
} from "lucide-react";

/* ============================================================
   التحصيل والائتمان — قسم المالية
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   ============================================================ */

// 📊 البطاقات — مصدرها: getReceivables (دالة backend جديدة تُبنى)
const KPIS = [
  { id: "due",     label: "إجمالي المستحق",       value: "1,847,000", unit: "ر.س", icon: Wallet,       color: "#059669" },
  { id: "debtors", label: "عملاء مدينون",          value: "23",        sub: "عميل",  icon: Users,        color: "#2563eb" },
  { id: "collected", label: "محصّل هذا الشهر",     value: "612,000",   unit: "ر.س", icon: CheckCircle2, color: "#16a34a" },
  { id: "overdue", label: "متأخر +٩٠ يوم",         value: "284,000",   unit: "ر.س", icon: AlertTriangle, color: "#dc2626" },
];

// ⏳ أعمار الديون — مصدرها: getReceivables (تجميع حسب تاريخ الفاتورة)
const AGING = [
  { label: "٠ – ٣٠ يوم",  value: 980000, pct: 53, color: "#16a34a" },
  { label: "٣١ – ٦٠ يوم", value: 410000, pct: 22, color: "#ca8a04" },
  { label: "٦١ – ٩٠ يوم", value: 173000, pct: 9,  color: "#ea580c" },
  { label: "+٩٠ يوم",     value: 284000, pct: 16, color: "#dc2626" },
];

// 👥 العملاء المدينون — مصدرها: getReceivables + getCustomers + حدود الائتمان
// status: ok = منتظم · over = تجاوز الائتمان · late = متأخر (>90 يوم)
const CLIENTS = [
  { name: "عقد أرامكو — الجبيل",      due: 420000, age: 25,  limit: 500000, status: "ok"   },
  { name: "مدينة الملك عبدالله",      due: 310000, age: 48,  limit: 300000, status: "over" },
  { name: "مشروع نيوم — الإسكان",     due: 256000, age: 95,  limit: 400000, status: "late" },
  { name: "مشروع البحر الأحمر",       due: 198000, age: 12,  limit: 250000, status: "ok"   },
  { name: "القدية — المرحلة الثانية", due: 167000, age: 67,  limit: 200000, status: "ok"   },
  { name: "شركة الواحة للمقاولات",    due: 142000, age: 110, limit: 150000, status: "late" },
  { name: "مجموعة الخليج الصناعية",   due: 98000,  age: 33,  limit: 120000, status: "ok"   },
];

const STATUS = {
  ok:   { label: "منتظم",          cls: "ok"   },
  over: { label: "تجاوز الائتمان",  cls: "over" },
  late: { label: "متأخر",          cls: "late" },
};

const fmt = (n) => n.toLocaleString("en-US");

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .col-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .col-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .col-head{display:flex; align-items:center; gap:14px; margin-bottom:24px; flex-wrap:wrap}
  .col-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#0596691a; color:#059669; flex-shrink:0}
  .col-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .col-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .col-period{margin-right:auto; display:flex; align-items:center; gap:7px; height:42px; padding:0 15px;
    background:var(--panel); border:1px solid var(--line2); border-radius:11px; cursor:pointer;
    font-family:inherit; font-size:13.5px; font-weight:600; color:var(--ink)}
  .col-period svg:first-child{color:#059669}

  /* KPIs */
  .col-kpis{display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:16px}
  .col-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:17px 18px;
    position:relative; overflow:hidden}
  .col-kpi::after{content:""; position:absolute; top:0; right:0; width:3px; height:100%; background:var(--c)}
  .col-kpi-ic{width:38px; height:38px; border-radius:10px; display:grid; place-items:center;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c); margin-bottom:12px}
  .col-kpi-label{font-size:12.5px; color:var(--ink2); font-weight:500; margin-bottom:5px}
  .col-kpi-val{font-size:24px; font-weight:700}
  .col-kpi-val .u{font-size:13px; color:var(--ink3); font-weight:600; margin-right:3px}
  .col-kpi-val .s{font-size:13px; color:var(--ink3); font-weight:500; margin-right:4px}

  /* AGING */
  .col-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px; margin-bottom:16px}
  .col-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:16px}
  .col-card-title{font-size:15.5px; font-weight:700}
  .col-card-hint{font-size:12px; color:var(--ink3); font-weight:500}
  .col-agebar{display:flex; height:13px; border-radius:7px; overflow:hidden; margin-bottom:16px}
  .col-agebar i{height:100%}
  .col-agegrid{display:grid; grid-template-columns:repeat(4,1fr); gap:12px}
  .col-agecell{padding:13px 15px; border-radius:11px; background:var(--bg); border:1px solid var(--line)}
  .col-agecell .dot{width:9px; height:9px; border-radius:50%; display:inline-block; margin-left:7px}
  .col-agecell .al{font-size:12px; color:var(--ink2); font-weight:600}
  .col-agecell .av{font-size:18px; font-weight:700; margin-top:6px}
  .col-agecell .ap{font-size:11.5px; color:var(--ink3); font-weight:600; margin-top:1px}

  /* ROW */
  .col-row{display:grid; grid-template-columns:1.7fr 1fr; gap:16px; align-items:start}

  /* TABLE */
  .col-tablewrap{overflow-x:auto}
  table.col-table{width:100%; border-collapse:collapse; min-width:560px}
  .col-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 10px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .col-table td{padding:13px 10px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .col-table tr:last-child td{border-bottom:none}
  .col-cname{font-weight:600; color:var(--ink); white-space:nowrap}
  .col-cdue{font-weight:700; font-variant-numeric:tabular-nums; color:var(--ink)}
  .col-cage{font-variant-numeric:tabular-nums; color:var(--ink2)}
  .col-climit{font-variant-numeric:tabular-nums; color:var(--ink2); white-space:nowrap}
  .col-pill{display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700;
    padding:4px 10px; border-radius:999px; white-space:nowrap}
  .col-pill.ok{color:#15803d; background:#dcfce7}
  .col-pill.over{color:#b91c1c; background:#fee2e2}
  .col-pill.late{color:#9a3412; background:#ffedd5}
  .col-paybtn{display:inline-flex; align-items:center; gap:5px; font-family:inherit; font-size:12px; font-weight:700;
    padding:7px 12px; border-radius:9px; border:1px solid #05966933; background:#05966914; color:#059669; cursor:pointer; white-space:nowrap}
  .col-paybtn:hover{background:#05966922}

  /* ALERTS */
  .col-alerts{display:flex; flex-direction:column; gap:10px}
  .col-alert{display:flex; gap:11px; align-items:flex-start; padding:13px 14px; border-radius:12px;
    background:#fef2f2; border:1px solid #fecaca}
  .col-alert.warn{background:#fffbeb; border-color:#fde68a}
  .col-alert-ic{width:30px; height:30px; border-radius:8px; display:grid; place-items:center; flex-shrink:0}
  .col-alert.over-al .col-alert-ic{background:#fee2e2; color:#dc2626}
  .col-alert.warn .col-alert-ic{background:#fef3c7; color:#d97706}
  .col-alert-t{font-size:13px; font-weight:700; margin-bottom:2px}
  .col-alert-v{font-size:12px; color:var(--ink2); line-height:1.5}
  .col-empty{text-align:center; padding:24px; color:var(--ink3); font-size:13px}

  /* MODAL */
  .col-overlay{position:fixed; inset:0; background:rgba(15,23,42,.5); display:grid; place-items:center; z-index:50; padding:20px}
  .col-modal{background:var(--panel); border-radius:18px; width:100%; max-width:400px; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,.3)}
  .col-modal-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:5px}
  .col-modal-title{font-size:18px; font-weight:700}
  .col-modal-close{width:34px; height:34px; border-radius:9px; border:none; background:var(--bg); cursor:pointer; display:grid; place-items:center; color:var(--ink2)}
  .col-modal-sub{font-size:13px; color:var(--ink2); margin-bottom:18px}
  .col-field{margin-bottom:14px}
  .col-field label{display:block; font-size:12.5px; font-weight:600; color:var(--ink2); margin-bottom:6px}
  .col-field input{width:100%; height:44px; border:1px solid var(--line2); border-radius:10px; padding:0 13px;
    font-family:inherit; font-size:14px; color:var(--ink); outline:none}
  .col-field input:focus{border-color:#059669}
  .col-modal-actions{display:flex; gap:10px; margin-top:20px}
  .col-btn{flex:1; height:46px; border-radius:11px; border:none; font-family:inherit; font-size:14px; font-weight:700; cursor:pointer}
  .col-btn.primary{background:#059669; color:#fff}
  .col-btn.primary:hover{background:#047857}
  .col-btn.ghost{background:var(--bg); color:var(--ink2)}

  @media(max-width:1000px){
    .col-kpis,.col-agegrid{grid-template-columns:repeat(2,1fr)}
    .col-row{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .col-root{padding:18px 14px}
    .col-kpis{grid-template-columns:1fr}
    .col-title{font-size:19px}
  }
`;

export default function CollectionsView() {
  const [payFor, setPayFor] = useState(null);
  const overLimit = CLIENTS.filter((c) => c.status === "over");
  const veryLate = CLIENTS.filter((c) => c.status === "late");

  return (
    <div className="col-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="col-head">
        <div className="col-head-ic"><TrendingDown size={25} /></div>
        <div>
          <div className="col-title">التحصيل والائتمان</div>
          <div className="col-sub">متابعة الذمم المدينة وحدود الائتمان · المالية</div>
        </div>
        <button className="col-period">
          <Calendar size={16} /> هذا الشهر <ChevronDown size={15} />
        </button>
      </div>

      {/* KPIs */}
      <div className="col-kpis">
        {KPIS.map((k) => {
          const Icon = k.icon;
          return (
            <div className="col-kpi" key={k.id} style={{ "--c": k.color }}>
              <div className="col-kpi-ic"><Icon size={19} /></div>
              <div className="col-kpi-label">{k.label}</div>
              <div className="col-kpi-val col-num">
                {k.value}
                {k.unit && <span className="u">{k.unit}</span>}
                {k.sub && <span className="s">{k.sub}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* AGING */}
      <div className="col-card">
        <div className="col-card-head">
          <span className="col-card-title">أعمار الديون</span>
          <span className="col-card-hint">توزيع المستحقات حسب تاريخ الاستحقاق</span>
        </div>
        <div className="col-agebar">
          {AGING.map((a) => (
            <i key={a.label} style={{ width: `${a.pct}%`, background: a.color }} />
          ))}
        </div>
        <div className="col-agegrid">
          {AGING.map((a) => (
            <div className="col-agecell" key={a.label}>
              <div>
                <span className="dot" style={{ background: a.color }} />
                <span className="al">{a.label}</span>
              </div>
              <div className="av col-num">{fmt(a.value)}</div>
              <div className="ap">{a.pct}٪ من المستحق</div>
            </div>
          ))}
        </div>
      </div>

      {/* ROW: TABLE + ALERTS */}
      <div className="col-row">

        {/* TABLE */}
        <div className="col-card" style={{ marginBottom: 0 }}>
          <div className="col-card-head">
            <span className="col-card-title">العملاء المدينون</span>
            <span className="col-card-hint">{CLIENTS.length} عميل</span>
          </div>
          <div className="col-tablewrap">
            <table className="col-table">
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>المستحق</th>
                  <th>أقدم دين</th>
                  <th>حد الائتمان</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {CLIENTS.map((c, i) => {
                  const st = STATUS[c.status];
                  return (
                    <tr key={i}>
                      <td className="col-cname">{c.name}</td>
                      <td className="col-cdue">{fmt(c.due)}</td>
                      <td className="col-cage">{c.age} يوم</td>
                      <td className="col-climit">{fmt(c.due)} / {fmt(c.limit)}</td>
                      <td><span className={`col-pill ${st.cls}`}>{st.label}</span></td>
                      <td>
                        <button className="col-paybtn" onClick={() => setPayFor(c)}>
                          <Plus size={13} /> دفعة
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ALERTS */}
        <div className="col-card" style={{ marginBottom: 0 }}>
          <div className="col-card-head">
            <span className="col-card-title">تنبيهات الائتمان</span>
            <CreditCard size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="col-alerts">
            {overLimit.map((c, i) => (
              <div className="col-alert over-al" key={"o" + i}>
                <div className="col-alert-ic"><AlertTriangle size={16} /></div>
                <div>
                  <div className="col-alert-t">{c.name}</div>
                  <div className="col-alert-v">تجاوز حد الائتمان — مستحق {fmt(c.due)} مقابل حد {fmt(c.limit)}</div>
                </div>
              </div>
            ))}
            {veryLate.map((c, i) => (
              <div className="col-alert warn" key={"l" + i}>
                <div className="col-alert-ic"><Clock size={16} /></div>
                <div>
                  <div className="col-alert-t">{c.name}</div>
                  <div className="col-alert-v">دين متأخر {c.age} يوم — يحتاج متابعة تحصيل</div>
                </div>
              </div>
            ))}
            {overLimit.length === 0 && veryLate.length === 0 && (
              <div className="col-empty">لا تنبيهات — كل العملاء ضمن الحدود ✓</div>
            )}
          </div>
        </div>

      </div>

      {/* PAYMENT MODAL */}
      {payFor && (
        <div className="col-overlay" onClick={() => setPayFor(null)}>
          <div className="col-modal" onClick={(e) => e.stopPropagation()}>
            <div className="col-modal-head">
              <span className="col-modal-title">تسجيل دفعة</span>
              <button className="col-modal-close" onClick={() => setPayFor(null)}><X size={18} /></button>
            </div>
            <div className="col-modal-sub">{payFor.name} · المستحق الحالي {fmt(payFor.due)} ر.س</div>
            <div className="col-field">
              <label>مبلغ الدفعة (ر.س)</label>
              <input type="number" placeholder="0" autoFocus />
            </div>
            <div className="col-field">
              <label>تاريخ الدفعة</label>
              <input type="date" />
            </div>
            <div className="col-modal-actions">
              <button className="col-btn ghost" onClick={() => setPayFor(null)}>إلغاء</button>
              <button className="col-btn primary" onClick={() => setPayFor(null)}>تسجيل الدفعة</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
