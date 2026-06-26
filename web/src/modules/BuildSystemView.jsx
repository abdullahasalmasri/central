import React, { useState, useMemo } from "react";
import {
  Crown, Wallet, Users, Settings, Building2, TrendingUp, Megaphone,
  Scale, Award, Check, Plus, CreditCard, X, Calculator, Lock, Send, CheckCircle2
} from "lucide-react";

/* ============================================================
   بناء النظام — قسم إدارة المنصة (قلب نموذج الاشتراك المعياري)
   العميل يبني نظامه: يختار الأقسام الفرعية، والتكلفة تتحدّث فوريًا.
   التسعير: مجموع أسعار الفروع المختارة × عدد المستخدمين.
   البيانات تجريبية. دوال backend المطلوبة (جديدة) مكتوبة بالأسفل.
   ============================================================ */

// 🧩 الأقسام التسعة وفروعها وأسعارها — مصدرها: getSystemStructure + getModulePricing
// (المالك يسعّر الإدارة ويوزّعها على فروعها؛ العميل يدفع لكل فرع مختار × المستخدمين)
const DEPARTMENTS = [
  { id: "exec", name: "الإدارة العليا", color: "#7c3aed", icon: Crown, subs: [
    { id: "exec_kpi",  name: "لوحة المؤشرات",   price: 0.15 },
    { id: "exec_org",  name: "الهيكل التنظيمي", price: 0.08 },
    { id: "exec_perm", name: "الصلاحيات",       price: 0.07 },
  ]},
  { id: "fin", name: "المالية", color: "#059669", icon: Wallet, subs: [
    { id: "fin_acc",   name: "المحاسبة",          price: 0.10 },
    { id: "fin_inv",   name: "الفوترة و ZATCA",   price: 0.10 },
    { id: "fin_cust",  name: "العملاء",           price: 0.05 },
    { id: "fin_fs",    name: "القوائم المالية",   price: 0.06 },
    { id: "fin_coll",  name: "التحصيل",           price: 0.05 },
    { id: "fin_treas", name: "الخزينة",           price: 0.05 },
    { id: "fin_fpa",   name: "التخطيط والتحليل",  price: 0.05 },
    { id: "fin_proc",  name: "المشتريات",         price: 0.04 },
  ]},
  { id: "hr", name: "الموارد البشرية", color: "#2563eb", icon: Users, subs: [
    { id: "hr_emp",   name: "شؤون الموظفين",  price: 0.10 },
    { id: "hr_pay",   name: "الرواتب",        price: 0.08 },
    { id: "hr_rec",   name: "التوظيف",        price: 0.08 },
    { id: "hr_train", name: "التدريب",        price: 0.07 },
    { id: "hr_rel",   name: "علاقات الموظفين", price: 0.07 },
  ]},
  { id: "ops", name: "العمليات", color: "#ea580c", icon: Settings, subs: [
    { id: "ops_book", name: "الحجوزات والجدولة", price: 0.15 },
    { id: "ops_req",  name: "طلبات الموارد",     price: 0.12 },
    { id: "ops_proj", name: "المشاريع",          price: 0.10 },
    { id: "ops_qs",   name: "الجودة والسلامة",   price: 0.08 },
  ]},
  { id: "assets", name: "الأصول والمرافق", color: "#0e7490", icon: Building2, subs: [
    { id: "as_veh",  name: "المركبات", price: 0.10 },
    { id: "as_hous", name: "الإسكان",  price: 0.08 },
    { id: "as_equ",  name: "المعدّات", price: 0.07 },
    { id: "as_dep",  name: "الإهلاك",  price: 0.05 },
  ]},
  { id: "cost", name: "التكاليف والربحية", color: "#ca8a04", icon: TrendingUp, subs: [
    { id: "cost_full", name: "التكلفة الشاملة",  price: 0.15 },
    { id: "cost_prof", name: "تقارير الربحية",   price: 0.12 },
    { id: "cost_alloc",name: "توزيع الموارد",    price: 0.08 },
  ]},
  { id: "sales", name: "المبيعات والتسويق", color: "#db2777", icon: Megaphone, subs: [
    { id: "sal_dir",  name: "المبيعات المباشرة", price: 0.12 },
    { id: "sal_mkt",  name: "التسويق والتواصل",  price: 0.10 },
    { id: "sal_serv", name: "خدمة العملاء",      price: 0.08 },
  ]},
  { id: "legal", name: "القانونية والامتثال", color: "#78716c", icon: Scale, subs: [
    { id: "leg_con", name: "العقود",          price: 0.10 },
    { id: "leg_com", name: "الامتثال والتراخيص", price: 0.08 },
    { id: "leg_dis", name: "المنازعات",       price: 0.07 },
  ]},
  { id: "quality", name: "التميز والجودة", color: "#65a30d", icon: Award, subs: [
    { id: "qa_aud", name: "التدقيق الداخلي",   price: 0.10 },
    { id: "qa_nps", name: "رضا العملاء و NPS", price: 0.08 },
    { id: "qa_imp", name: "تحسين العمليات",    price: 0.07 },
  ]},
];

// الأقسام المفعّلة مسبقًا (المشترك بها حاليًا) — مصدرها: getSystemStructure (feature flags)
const ACTIVE_DEPTS = ["fin", "hr", "ops", "cost", "assets"];

// عدد المستخدمين (أساس التسعير) — مصدرها: getSubscription
const USERS = 100;

// صلاحية الدفع/الترقية — مصدرها: نظام الصلاحيات (المالك أو من يخوّله)
const canManageBilling = true;

const fmt = (n) => n.toLocaleString("en-US");

const buildInitial = () => {
  const s = new Set();
  DEPARTMENTS.forEach((d) => {
    if (ACTIVE_DEPTS.includes(d.id)) d.subs.forEach((sub) => s.add(sub.id));
  });
  return s;
};

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .bld-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec; --brand:#4f46e5;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px 40px; -webkit-font-smoothing:antialiased;
  }
  .bld-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .bld-head{display:flex; align-items:center; gap:14px; margin-bottom:20px; flex-wrap:wrap}
  .bld-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#4f46e51a; color:#4f46e5; flex-shrink:0}
  .bld-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .bld-subt{font-size:13px; color:var(--ink2); margin-top:2px}

  /* CALC BAR (sticky) */
  .bld-calc{position:sticky; top:14px; z-index:20; background:linear-gradient(135deg,#4338ca,#4f46e5 55%,#6366f1);
    border-radius:16px; padding:16px 20px; margin-bottom:20px; color:#fff;
    display:flex; align-items:center; gap:22px; flex-wrap:wrap; box-shadow:0 10px 30px rgba(79,70,229,.28)}
  .bld-calc-ic{width:42px; height:42px; border-radius:11px; background:rgba(255,255,255,.18); display:grid; place-items:center; flex-shrink:0}
  .bld-calc-item{display:flex; flex-direction:column; gap:2px}
  .bld-calc-item .l{font-size:11.5px; opacity:.85}
  .bld-calc-item .v{font-size:18px; font-weight:800; font-variant-numeric:tabular-nums}
  .bld-calc-cost{margin-right:auto; text-align:left}
  .bld-calc-cost .l{font-size:11.5px; opacity:.85}
  .bld-calc-cost .v{font-size:24px; font-weight:800; font-variant-numeric:tabular-nums}
  .bld-calc-cost .v small{font-size:13px; opacity:.85; font-weight:600}
  .bld-calc-btn{display:inline-flex; align-items:center; gap:7px; font-family:inherit; font-size:14px; font-weight:700;
    padding:11px 20px; border-radius:11px; border:none; background:#fff; color:#4338ca; cursor:pointer; white-space:nowrap}
  .bld-calc-btn:hover{background:#eef2ff}
  .bld-calc-btn:disabled{opacity:.5; cursor:not-allowed}

  .bld-hint{font-size:12.5px; color:var(--ink2); margin-bottom:16px; display:flex; align-items:center; gap:7px}
  .bld-hint svg{color:#4f46e5; flex-shrink:0}

  /* GRID */
  .bld-grid{display:grid; grid-template-columns:repeat(2,1fr); gap:16px; align-items:start}
  .bld-dept{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:18px; border-top:3px solid var(--c)}
  .bld-dept.on{box-shadow:0 0 0 1px var(--c)}
  .bld-dept-head{display:flex; align-items:center; gap:11px; margin-bottom:14px}
  .bld-dept-ic{width:40px; height:40px; border-radius:11px; display:grid; place-items:center; flex-shrink:0;
    background:color-mix(in srgb,var(--c) 14%,transparent); color:var(--c)}
  .bld-dept-titles{flex:1; min-width:0}
  .bld-dept-name{font-size:15px; font-weight:700}
  .bld-dept-count{font-size:11.5px; color:var(--ink3); margin-top:1px}
  .bld-dept-badge{font-size:10.5px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap; flex-shrink:0}
  .bld-dept-badge.active{background:#dcfce7; color:#15803d}
  .bld-dept-badge.avail{background:#eef2ff; color:#4338ca}

  .bld-subs{display:flex; flex-direction:column; gap:7px; margin-bottom:14px}
  .bld-sub{display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:10px; background:var(--bg);
    border:1px solid var(--line); cursor:pointer; transition:background .12s}
  .bld-sub:hover{background:#eef2ff55}
  .bld-sub.sel{background:#eef2ff; border-color:#c7d2fe}
  .bld-check{width:20px; height:20px; border-radius:6px; border:2px solid var(--line2); display:grid; place-items:center; flex-shrink:0; background:#fff; color:#fff}
  .bld-sub.sel .bld-check{background:var(--c); border-color:var(--c)}
  .bld-sub-name{flex:1; font-size:12.5px; font-weight:600; min-width:0}
  .bld-sub-price{font-size:11px; color:var(--ink3); font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap}

  .bld-dept-foot{display:flex; align-items:center; justify-content:space-between; padding-top:13px; border-top:1px solid var(--line)}
  .bld-dept-toggle{font-family:inherit; font-size:12px; font-weight:700; padding:7px 13px; border-radius:8px; border:1px solid var(--line2);
    background:#fff; cursor:pointer; color:var(--ink2)}
  .bld-dept-toggle:hover{background:var(--bg)}
  .bld-dept-sum{font-size:13px; font-weight:800; font-variant-numeric:tabular-nums; color:var(--c)}
  .bld-dept-sum small{font-size:10.5px; color:var(--ink3); font-weight:600}

  /* CUSTOM */
  .bld-custom{grid-column:1 / -1; display:flex; align-items:center; gap:14px; padding:18px 20px; border-radius:16px;
    background:#fff; border:2px dashed var(--line2)}
  .bld-custom-ic{width:46px; height:46px; border-radius:12px; background:#eef2ff; color:#4f46e5; display:grid; place-items:center; flex-shrink:0}
  .bld-custom-info{flex:1; min-width:0}
  .bld-custom-t{font-size:14px; font-weight:700}
  .bld-custom-v{font-size:12px; color:var(--ink2); margin-top:2px}
  .bld-custom-btn{display:inline-flex; align-items:center; gap:7px; font-family:inherit; font-size:13px; font-weight:700;
    padding:10px 18px; border-radius:10px; border:none; background:#4f46e5; color:#fff; cursor:pointer; white-space:nowrap}
  .bld-custom-btn:hover{background:#4338ca}

  /* MODAL */
  .bld-overlay{position:fixed; inset:0; background:rgba(15,23,42,.5); display:grid; place-items:center; z-index:60; padding:20px}
  .bld-modal{background:var(--panel); border-radius:18px; width:100%; max-width:480px; padding:24px; box-shadow:0 20px 60px rgba(0,0,0,.3); max-height:90vh; overflow-y:auto}
  .bld-modal-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:5px}
  .bld-modal-title{font-size:18px; font-weight:700}
  .bld-modal-close{width:34px; height:34px; border-radius:9px; border:none; background:var(--bg); cursor:pointer; display:grid; place-items:center; color:var(--ink2)}
  .bld-modal-sub{font-size:13px; color:var(--ink2); margin-bottom:18px}

  .bld-summary{display:flex; flex-direction:column; gap:8px; margin-bottom:16px}
  .bld-sum-row{display:flex; align-items:center; justify-content:space-between; padding:10px 13px; border-radius:10px; background:var(--bg)}
  .bld-sum-name{display:flex; align-items:center; gap:9px; font-size:13px; font-weight:600}
  .bld-sum-dot{width:8px; height:8px; border-radius:50%; flex-shrink:0}
  .bld-sum-meta{font-size:12px; color:var(--ink3); font-variant-numeric:tabular-nums}
  .bld-sum-total{display:flex; align-items:center; justify-content:space-between; padding:15px 16px; border-radius:12px; background:#eef2ff; margin-bottom:16px}
  .bld-sum-total-l{font-size:13.5px; font-weight:700}
  .bld-sum-total-l small{display:block; font-size:11px; color:var(--ink3); font-weight:500; margin-top:2px}
  .bld-sum-total-v{font-size:22px; font-weight:800; font-variant-numeric:tabular-nums; color:#4f46e5}
  .bld-modal-btn{width:100%; display:flex; align-items:center; justify-content:center; gap:8px; font-family:inherit; font-size:14px; font-weight:700;
    padding:13px; border-radius:12px; border:none; background:#4f46e5; color:#fff; cursor:pointer}
  .bld-modal-btn:hover{background:#4338ca}
  .bld-modal-note{display:flex; gap:8px; align-items:flex-start; font-size:11.5px; color:var(--ink2); margin-top:14px; padding:11px 13px; background:var(--bg); border-radius:11px; line-height:1.5}
  .bld-modal-note svg{color:#4f46e5; flex-shrink:0; margin-top:1px}

  .bld-field{margin-bottom:14px}
  .bld-field-l{font-size:12.5px; font-weight:600; margin-bottom:7px; display:block}
  .bld-input{width:100%; font-family:inherit; font-size:13px; padding:11px 13px; border-radius:10px; border:1px solid var(--line2); background:var(--bg); color:var(--ink)}
  .bld-input:focus{outline:none; border-color:#4f46e5; background:#fff}
  textarea.bld-input{resize:vertical; min-height:80px}

  @media(max-width:900px){
    .bld-grid{grid-template-columns:1fr}
    .bld-calc{gap:16px}
    .bld-calc-cost{margin-right:0; width:100%; order:3}
  }
  @media(max-width:560px){
    .bld-root{padding:18px 14px 30px}
    .bld-title{font-size:19px}
  }
`;

export default function BuildSystemView() {
  const [selected, setSelected] = useState(buildInitial);
  const [showPay, setShowPay] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDesc, setCustomDesc] = useState("");

  const toggleSub = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDept = (dept) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOn = dept.subs.every((s) => next.has(s.id));
      dept.subs.forEach((s) => (allOn ? next.delete(s.id) : next.add(s.id)));
      return next;
    });
  };

  // التكلفة الجارية (تتحدّث فوريًا)
  const { perUser, count, activeDepts } = useMemo(() => {
    let pu = 0, c = 0;
    const ad = [];
    DEPARTMENTS.forEach((d) => {
      const chosen = d.subs.filter((s) => selected.has(s.id));
      if (chosen.length) {
        const deptPU = chosen.reduce((sum, s) => sum + s.price, 0);
        ad.push({ ...d, chosenCount: chosen.length, deptCost: deptPU * USERS });
        pu += deptPU;
        c += chosen.length;
      }
    });
    return { perUser: pu, count: c, activeDepts: ad };
  }, [selected]);

  const monthlyCost = Math.round(perUser * USERS);

  return (
    <div className="bld-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="bld-head">
        <div className="bld-head-ic"><Settings size={24} /></div>
        <div>
          <div className="bld-title">بناء النظام</div>
          <div className="bld-subt">اختر الأقسام التي يحتاجها نظامك وادفع لما تستخدمه فقط · إدارة المنصة</div>
        </div>
      </div>

      {/* CALC BAR */}
      <div className="bld-calc">
        <div className="bld-calc-ic"><Calculator size={22} /></div>
        <div className="bld-calc-item">
          <span className="l">عدد المستخدمين</span>
          <span className="v bld-num">{USERS}</span>
        </div>
        <div className="bld-calc-item">
          <span className="l">الأقسام الفرعية المختارة</span>
          <span className="v bld-num">{count}</span>
        </div>
        <div className="bld-calc-cost">
          <span className="l">التكلفة الشهرية</span>
          <div className="v bld-num">{fmt(monthlyCost)} <small>ر.س/شهر</small></div>
        </div>
        <button className="bld-calc-btn" disabled={!canManageBilling || count === 0} onClick={() => setShowPay(true)}>
          <CreditCard size={17} /> تأكيد والدفع
        </button>
      </div>

      <div className="bld-hint">
        <Check size={15} /> الأقسام المختارة تُحسب في الفوترة فورًا. اضغط أي فرع لتفعيله أو إلغائه — والتكلفة تتحدّث مباشرة.
      </div>

      {/* GRID */}
      <div className="bld-grid">
        {DEPARTMENTS.map((d) => {
          const Icon = d.icon;
          const chosen = d.subs.filter((s) => selected.has(s.id));
          const allOn = d.subs.every((s) => selected.has(s.id));
          const someOn = chosen.length > 0;
          const deptCost = Math.round(chosen.reduce((sum, s) => sum + s.price, 0) * USERS);
          return (
            <div className={`bld-dept ${someOn ? "on" : ""}`} key={d.id} style={{ "--c": d.color }}>
              <div className="bld-dept-head">
                <div className="bld-dept-ic"><Icon size={20} /></div>
                <div className="bld-dept-titles">
                  <div className="bld-dept-name">{d.name}</div>
                  <div className="bld-dept-count">{chosen.length} من {d.subs.length} أقسام مختارة</div>
                </div>
                <span className={`bld-dept-badge ${someOn ? "active" : "avail"}`}>
                  {someOn ? "مفعّل" : "متاح للإضافة"}
                </span>
              </div>

              <div className="bld-subs">
                {d.subs.map((s) => {
                  const sel = selected.has(s.id);
                  return (
                    <div className={`bld-sub ${sel ? "sel" : ""}`} key={s.id}
                         style={{ "--c": d.color }} onClick={() => toggleSub(s.id)}>
                      <span className="bld-check">{sel && <Check size={13} strokeWidth={3} />}</span>
                      <span className="bld-sub-name">{s.name}</span>
                      <span className="bld-sub-price">{s.price.toFixed(2)} ر.س</span>
                    </div>
                  );
                })}
              </div>

              <div className="bld-dept-foot">
                <button className="bld-dept-toggle" onClick={() => toggleDept(d)}>
                  {allOn ? "إلغاء الكل" : "تفعيل الكل"}
                </button>
                <span className="bld-dept-sum bld-num">
                  {fmt(deptCost)} <small>ر.س/شهر</small>
                </span>
              </div>
            </div>
          );
        })}

        {/* CUSTOM SECTION REQUEST */}
        <div className="bld-custom">
          <div className="bld-custom-ic"><Plus size={22} /></div>
          <div className="bld-custom-info">
            <div className="bld-custom-t">طلب قسم مخصّص</div>
            <div className="bld-custom-v">تحتاج قسمًا غير موجود؟ أرسل طلبك ويصل لمالك المنصة لدراسته وبنائه.</div>
          </div>
          <button className="bld-custom-btn" onClick={() => setShowCustom(true)}>
            <Plus size={16} /> طلب قسم
          </button>
        </div>
      </div>

      {/* PAY MODAL */}
      {showPay && (
        <div className="bld-overlay" onClick={() => setShowPay(false)}>
          <div className="bld-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bld-modal-head">
              <span className="bld-modal-title">تأكيد الاشتراك والدفع</span>
              <button className="bld-modal-close" onClick={() => setShowPay(false)}><X size={18} /></button>
            </div>
            <div className="bld-modal-sub">ملخّص الأقسام المختارة وتكلفتها الشهرية.</div>
            <div className="bld-summary">
              {activeDepts.map((d) => (
                <div className="bld-sum-row" key={d.id}>
                  <span className="bld-sum-name">
                    <span className="bld-sum-dot" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="bld-sum-meta">{d.chosenCount} قسم · {fmt(d.deptCost)} ر.س</span>
                </div>
              ))}
            </div>
            <div className="bld-sum-total">
              <span className="bld-sum-total-l">
                الإجمالي الشهري
                <small>{perUser.toFixed(2)} ر.س × {USERS} مستخدم</small>
              </span>
              <span className="bld-sum-total-v bld-num">{fmt(monthlyCost)} ر.س</span>
            </div>
            <button className="bld-modal-btn" onClick={() => setShowPay(false)}>
              <CreditCard size={17} /> المتابعة للدفع
            </button>
            <div className="bld-modal-note">
              <Lock size={14} />
              صلاحية الدفع للمالك فقط أو من يخوّله، لأن المبلغ يُسحب من حساب الشركة.
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM REQUEST MODAL */}
      {showCustom && (
        <div className="bld-overlay" onClick={() => setShowCustom(false)}>
          <div className="bld-modal" onClick={(e) => e.stopPropagation()}>
            <div className="bld-modal-head">
              <span className="bld-modal-title">طلب قسم مخصّص</span>
              <button className="bld-modal-close" onClick={() => setShowCustom(false)}><X size={18} /></button>
            </div>
            <div className="bld-modal-sub">صف القسم الذي تحتاجه وسيصل طلبك لمالك المنصة لدراسته.</div>
            <div className="bld-field">
              <label className="bld-field-l">اسم القسم المطلوب</label>
              <input className="bld-input" value={customName} onChange={(e) => setCustomName(e.target.value)}
                     placeholder="مثال: قسم التعويضات والمطالبات" />
            </div>
            <div className="bld-field">
              <label className="bld-field-l">وصف الحاجة</label>
              <textarea className="bld-input" value={customDesc} onChange={(e) => setCustomDesc(e.target.value)}
                        placeholder="اشرح ما تريد أن يفعله هذا القسم..." />
            </div>
            <button className="bld-modal-btn" onClick={() => { setShowCustom(false); setCustomName(""); setCustomDesc(""); }}>
              <Send size={16} /> إرسال الطلب للمالك
            </button>
            <div className="bld-modal-note">
              <CheckCircle2 size={14} />
              بعد الموافقة، يُبنى القسم ويُسعّر ويصبح متاحًا لك ولبقية المشتركين.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
