import React, { useState } from "react";
import {
  CreditCard, Users, Wallet, LayoutGrid, CalendarClock, ArrowUpCircle,
  Lock, CheckCircle2, X, AlertTriangle, Receipt, Zap
} from "lucide-react";

/* ============================================================
   الاشتراكات — قسم إدارة المنصة (جانب العميل: شركة التوريد تدير اشتراكها)
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بجانب كل مجموعة.
   النموذج: تسعير بعدد المستخدمين × أسعار الأقسام المفعّلة · باقات بحد أدنى 100 · العدد سقف فعلي.
   ============================================================ */

// 📦 حالة الاشتراك — مصدرها: getSubscription (دالة backend جديدة)
// status: trial=تجريبي · active=نشط · expired=منتهٍ
const SUB = {
  status: "active",
  plan: 100,          // سعة الباقة (السقف)
  users: 87,          // المستخدمون الحاليون (من المالك حتى آخر عامل)
  renewDays: 12,
  renewDate: "١ يوليو ٢٠٢٦",
};

// 🧩 الأقسام المفعّلة وأسعارها (لكل مستخدم) — مصدرها: getSubscription (feature flags + التسعير)
const MODULES = [
  { name: "المالية",            price: 0.50 },
  { name: "العمليات",           price: 0.45 },
  { name: "الموارد البشرية",    price: 0.40 },
  { name: "التكاليف والربحية",  price: 0.35 },
  { name: "الأصول والمرافق",    price: 0.30 },
];
const pricePerUser = MODULES.reduce((s, m) => s + m.price, 0); // = 2.00
const monthlyCost = pricePerUser * SUB.plan;                   // = 200

// 📈 الباقات المتدرّجة (للترقية) — مصدرها: ثابت في المنصة
const PACKAGES = [100, 150, 200, 250, 300];

// 🧾 المدفوعات والفواتير — مصدرها: getInvoices
const INVOICES = [
  { month: "يونيو ٢٠٢٦",  amount: 200, status: "paid" },
  { month: "مايو ٢٠٢٦",   amount: 200, status: "paid" },
  { month: "أبريل ٢٠٢٦",  amount: 200, status: "paid" },
  { month: "مارس ٢٠٢٦",   amount: 200, status: "paid" },
];

// 🔐 صلاحية إدارة الدفع — مصدرها: نظام الصلاحيات (المالك أو من يخوّله فقط)
const canManageBilling = true;

const SUB_STATUS = {
  trial:   { label: "تجريبي", cls: "trial"   },
  active:  { label: "نشط",    cls: "active"   },
  expired: { label: "منتهٍ",  cls: "expired"  },
};
const INV_STATUS = {
  paid:    { label: "مدفوعة",  cls: "paid"    },
  pending: { label: "معلّقة",  cls: "pending" },
  overdue: { label: "متأخرة",  cls: "overdue" },
};

const usagePct = Math.round((SUB.users / SUB.plan) * 100);
const remaining = SUB.plan - SUB.users;
const fmt = (n) => n.toLocaleString("en-US");

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .sub-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec; --gold:#d97706;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .sub-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .sub-head{display:flex; align-items:center; gap:14px; margin-bottom:22px; flex-wrap:wrap}
  .sub-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#d977061a; color:#d97706; flex-shrink:0}
  .sub-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .sub-subt{font-size:13px; color:var(--ink2); margin-top:2px}
  .sub-lock{margin-right:auto; display:flex; align-items:center; gap:7px; font-size:12px; color:var(--ink2); font-weight:600;
    background:#fffbeb; border:1px solid #fde68a; padding:8px 13px; border-radius:11px}
  .sub-lock svg{color:#d97706}

  /* BANNER */
  .sub-banner{background:linear-gradient(135deg,#b45309,#d97706 60%,#f59e0b); border-radius:18px; padding:22px 24px;
    color:#fff; margin-bottom:16px; box-shadow:0 10px 30px rgba(217,119,6,.25)}
  .sub-banner-head{display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:20px}
  .sub-banner-badge{display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:700; padding:4px 11px; border-radius:999px;
    background:rgba(255,255,255,.22); color:#fff; margin-bottom:9px}
  .sub-banner-plan{font-size:26px; font-weight:800; letter-spacing:-.5px}
  .sub-banner-btn{display:inline-flex; align-items:center; gap:7px; font-family:inherit; font-size:14px; font-weight:700;
    padding:11px 20px; border-radius:12px; border:none; background:#fff; color:#b45309; cursor:pointer; white-space:nowrap}
  .sub-banner-btn:hover{background:#fff7ed}
  .sub-banner-btn:disabled{opacity:.5; cursor:not-allowed}
  .sub-banner-stats{display:grid; grid-template-columns:repeat(3,1fr); gap:14px}
  .sub-bstat{background:rgba(255,255,255,.13); border-radius:12px; padding:13px 15px}
  .sub-bstat .l{font-size:12px; opacity:.85; display:block; margin-bottom:4px}
  .sub-bstat .v{font-size:19px; font-weight:800; font-variant-numeric:tabular-nums}
  .sub-bstat .v small{font-size:12px; opacity:.8; font-weight:600}

  .sub-row{display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px; align-items:start}
  .sub-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .sub-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:18px}
  .sub-card-title{font-size:15.5px; font-weight:700}
  .sub-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  /* USAGE */
  .sub-usage-num{font-size:34px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1; margin-bottom:14px}
  .sub-usage-num small{font-size:18px; color:var(--ink3); font-weight:600}
  .sub-usage-bar{height:14px; background:#eef1f6; border-radius:999px; overflow:hidden; margin-bottom:8px}
  .sub-usage-bar i{display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#d97706,#fbbf24)}
  .sub-usage-bar i.warn{background:linear-gradient(90deg,#dc2626,#f87171)}
  .sub-usage-meta{font-size:12px; color:var(--ink3); font-variant-numeric:tabular-nums}
  .sub-alert{display:flex; gap:10px; align-items:flex-start; padding:12px 13px; border-radius:11px; margin-top:14px;
    background:#fffbeb; border:1px solid #fde68a}
  .sub-alert.danger{background:#fef2f2; border-color:#fecaca}
  .sub-alert-ic{width:28px; height:28px; border-radius:8px; display:grid; place-items:center; flex-shrink:0; background:#fef3c7; color:#d97706}
  .sub-alert.danger .sub-alert-ic{background:#fee2e2; color:#dc2626}
  .sub-alert-t{font-size:12.5px; font-weight:700; margin-bottom:2px}
  .sub-alert-v{font-size:11.5px; color:var(--ink2); line-height:1.5}

  /* MODULES */
  .sub-mods{display:flex; flex-direction:column; gap:9px}
  .sub-mod{display:flex; align-items:center; justify-content:space-between; padding:11px 13px; border-radius:11px; background:var(--bg); border:1px solid var(--line)}
  .sub-mod-name{display:flex; align-items:center; gap:9px; font-size:13px; font-weight:600}
  .sub-mod-dot{width:8px; height:8px; border-radius:50%; background:#d97706; flex-shrink:0}
  .sub-mod-price{font-size:12.5px; font-weight:700; font-variant-numeric:tabular-nums; color:var(--ink2)}
  .sub-mod-price small{font-size:10.5px; color:var(--ink3); font-weight:500}
  .sub-total{display:flex; align-items:center; justify-content:space-between; margin-top:13px; padding-top:14px; border-top:2px solid var(--line)}
  .sub-total-l{font-size:13px; font-weight:700}
  .sub-total-l small{font-size:11px; color:var(--ink3); font-weight:500; display:block; margin-top:2px}
  .sub-total-v{font-size:20px; font-weight:800; font-variant-numeric:tabular-nums; color:var(--gold)}

  /* INVOICES */
  .sub-tablewrap{overflow-x:auto}
  table.sub-table{width:100%; border-collapse:collapse; min-width:420px}
  .sub-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .sub-table th.n, .sub-table td.n{text-align:left}
  .sub-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .sub-table tr:last-child td{border-bottom:none}
  .sub-inv-month{font-weight:600; color:var(--ink); white-space:nowrap}
  .sub-inv-amt{font-weight:700; font-variant-numeric:tabular-nums; text-align:left}
  .sub-spill{display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap}
  .sub-spill.paid{background:#dcfce7; color:#15803d}
  .sub-spill.pending{background:#ffedd5; color:#9a3412}
  .sub-spill.overdue{background:#fee2e2; color:#b91c1c}

  /* MODAL */
  .sub-overlay{position:fixed; inset:0; background:rgba(15,23,42,.5); display:grid; place-items:center; z-index:50; padding:20px}
  .sub-modal{background:var(--panel); border-radius:18px; width:100%; max-width:460px; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,.3); max-height:90vh; overflow-y:auto}
  .sub-modal-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:5px}
  .sub-modal-title{font-size:18px; font-weight:700}
  .sub-modal-close{width:34px; height:34px; border-radius:9px; border:none; background:var(--bg); cursor:pointer; display:grid; place-items:center; color:var(--ink2)}
  .sub-modal-sub{font-size:13px; color:var(--ink2); margin-bottom:18px}
  .sub-pkgs{display:flex; flex-direction:column; gap:10px}
  .sub-pkg{display:flex; align-items:center; justify-content:space-between; padding:15px 16px; border-radius:13px; border:1px solid var(--line2); background:var(--bg)}
  .sub-pkg.current{border-color:#d97706; background:#fffbeb}
  .sub-pkg-info{display:flex; align-items:center; gap:11px}
  .sub-pkg-ic{width:38px; height:38px; border-radius:10px; background:#d977061a; color:#d97706; display:grid; place-items:center; flex-shrink:0}
  .sub-pkg-users{font-size:15px; font-weight:800; font-variant-numeric:tabular-nums}
  .sub-pkg-price{font-size:11.5px; color:var(--ink3); font-variant-numeric:tabular-nums; margin-top:1px}
  .sub-pkg-btn{font-family:inherit; font-size:12.5px; font-weight:700; padding:8px 16px; border-radius:9px; border:none; cursor:pointer; white-space:nowrap}
  .sub-pkg-btn.pick{background:#d97706; color:#fff}
  .sub-pkg-btn.pick:hover{background:#b45309}
  .sub-pkg-cur{font-size:11.5px; font-weight:700; color:#d97706; background:#fef3c7; padding:6px 13px; border-radius:999px; white-space:nowrap}
  .sub-modal-note{display:flex; gap:8px; align-items:flex-start; font-size:11.5px; color:var(--ink2); margin-top:16px; padding:11px 13px; background:var(--bg); border-radius:11px; line-height:1.5}
  .sub-modal-note svg{color:#d97706; flex-shrink:0; margin-top:1px}

  @media(max-width:900px){
    .sub-row{grid-template-columns:1fr}
    .sub-banner-stats{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .sub-root{padding:18px 14px}
    .sub-title{font-size:19px}
    .sub-banner-plan{font-size:22px}
  }
`;

export default function SubscriptionView() {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const st = SUB_STATUS[SUB.status];
  const nearLimit = usagePct >= 80;

  return (
    <div className="sub-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="sub-head">
        <div className="sub-head-ic"><CreditCard size={24} /></div>
        <div>
          <div className="sub-title">الاشتراكات</div>
          <div className="sub-subt">إدارة باقة الاشتراك والمدفوعات · إدارة المنصة</div>
        </div>
        <div className="sub-lock"><Lock size={14} /> صلاحية الدفع للمالك فقط</div>
      </div>

      {/* STATUS BANNER */}
      <div className="sub-banner">
        <div className="sub-banner-head">
          <div>
            <span className="sub-banner-badge"><CheckCircle2 size={13} /> اشتراك {st.label}</span>
            <div className="sub-banner-plan">باقة {SUB.plan} مستخدم</div>
          </div>
          <button className="sub-banner-btn" disabled={!canManageBilling} onClick={() => setShowUpgrade(true)}>
            <ArrowUpCircle size={17} /> ترقية الباقة
          </button>
        </div>
        <div className="sub-banner-stats">
          <div className="sub-bstat">
            <span className="l">التكلفة الشهرية</span>
            <span className="v sub-num">{fmt(monthlyCost)} <small>ر.س</small></span>
          </div>
          <div className="sub-bstat">
            <span className="l">يتجدّد خلال</span>
            <span className="v sub-num">{SUB.renewDays} <small>يوم</small></span>
          </div>
          <div className="sub-bstat">
            <span className="l">تاريخ التجديد</span>
            <span className="v" style={{ fontSize: "15px" }}>{SUB.renewDate}</span>
          </div>
        </div>
      </div>

      {/* ROW: USAGE + MODULES */}
      <div className="sub-row">

        <div className="sub-card" style={{ marginBottom: 0 }}>
          <div className="sub-card-head">
            <span className="sub-card-title">استهلاك المستخدمين</span>
            <Users size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="sub-usage-num sub-num">{SUB.users} <small>/ {SUB.plan} مستخدم</small></div>
          <div className="sub-usage-bar"><i className={nearLimit ? "warn" : ""} style={{ width: `${usagePct}%` }} /></div>
          <div className="sub-usage-meta">{usagePct}٪ من سعة الباقة · {remaining} مستخدم متبقٍّ</div>
          {nearLimit && (
            <div className="sub-alert">
              <div className="sub-alert-ic"><AlertTriangle size={15} /></div>
              <div>
                <div className="sub-alert-t">اقتربت من الحد الأقصى</div>
                <div className="sub-alert-v">بقي {remaining} مستخدمين فقط. عند الوصول للسقف لن تتمكّن من إضافة مستخدمين جدد حتى ترقية الباقة.</div>
              </div>
            </div>
          )}
        </div>

        <div className="sub-card" style={{ marginBottom: 0 }}>
          <div className="sub-card-head">
            <span className="sub-card-title">الأقسام المفعّلة</span>
            <LayoutGrid size={17} style={{ color: "#94a0b8" }} />
          </div>
          <div className="sub-mods">
            {MODULES.map((m) => (
              <div className="sub-mod" key={m.name}>
                <span className="sub-mod-name"><span className="sub-mod-dot" />{m.name}</span>
                <span className="sub-mod-price sub-num">{m.price.toFixed(2)} <small>ر.س/مستخدم</small></span>
              </div>
            ))}
          </div>
          <div className="sub-total">
            <span className="sub-total-l">
              الإجمالي الشهري
              <small>{pricePerUser.toFixed(2)} ر.س × {SUB.plan} مستخدم</small>
            </span>
            <span className="sub-total-v sub-num">{fmt(monthlyCost)} ر.س</span>
          </div>
        </div>

      </div>

      {/* INVOICES */}
      <div className="sub-card">
        <div className="sub-card-head">
          <span className="sub-card-title">المدفوعات والفواتير</span>
          <Receipt size={17} style={{ color: "#94a0b8" }} />
        </div>
        <div className="sub-tablewrap">
          <table className="sub-table">
            <thead>
              <tr>
                <th>الشهر</th>
                <th className="n">المبلغ</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {INVOICES.map((inv, i) => {
                const ist = INV_STATUS[inv.status];
                return (
                  <tr key={i}>
                    <td className="sub-inv-month">{inv.month}</td>
                    <td className="sub-inv-amt n sub-num">{fmt(inv.amount)} ر.س</td>
                    <td>
                      <span className={`sub-spill ${ist.cls}`}>
                        {inv.status === "paid" && <CheckCircle2 size={12} />}{ist.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* UPGRADE MODAL */}
      {showUpgrade && (
        <div className="sub-overlay" onClick={() => setShowUpgrade(false)}>
          <div className="sub-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sub-modal-head">
              <span className="sub-modal-title">ترقية الباقة</span>
              <button className="sub-modal-close" onClick={() => setShowUpgrade(false)}><X size={18} /></button>
            </div>
            <div className="sub-modal-sub">اختر باقة أكبر لزيادة سقف المستخدمين. التكلفة = {pricePerUser.toFixed(2)} ر.س × عدد المستخدمين.</div>
            <div className="sub-pkgs">
              {PACKAGES.map((pkg) => {
                const isCurrent = pkg === SUB.plan;
                return (
                  <div className={`sub-pkg ${isCurrent ? "current" : ""}`} key={pkg}>
                    <div className="sub-pkg-info">
                      <div className="sub-pkg-ic"><Zap size={18} /></div>
                      <div>
                        <div className="sub-pkg-users sub-num">{pkg} مستخدم</div>
                        <div className="sub-pkg-price sub-num">{fmt(pricePerUser * pkg)} ر.س/شهر</div>
                      </div>
                    </div>
                    {isCurrent
                      ? <span className="sub-pkg-cur">باقتك الحالية</span>
                      : <button className="sub-pkg-btn pick" onClick={() => setShowUpgrade(false)}>اختيار</button>}
                  </div>
                );
              })}
            </div>
            <div className="sub-modal-note">
              <Lock size={14} />
              صلاحية الترقية والدفع للمالك فقط أو من يخوّله، لأن المبلغ يُسحب من حساب الشركة.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
