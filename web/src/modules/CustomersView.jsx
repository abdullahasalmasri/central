import React, { useState, useEffect } from "react";
import {
  Users, Building2, User, Plus, Search, MapPin, UserCog, Phone, Mail,
  Globe, Hash, Trash2, X, Save, RefreshCw, AlertCircle, Inbox, FileText
} from "lucide-react";
import { getCustomers, addCustomer, deleteCustomer } from "./customersService";

/* ============================================================
   العملاء — قسم المالية
   مربوطة بـ Firebase (مجموعة customers). جلب + إضافة + حذف.
   كل عميل: معلومات أساسية + مواقع متعددة + مخوّلون متعددون.
   ============================================================ */

const emptyForm = () => ({
  name: "", phone: "", type: "company",
  crNumber: "", vatNumber: "", licenseNumber: "", email: "", website: "",
  locations: [{ label: "", mapLink: "", address: "" }],
  contacts: [{ name: "", phone: "" }],
});

const STYLES = `
  *{margin:0;padding:0;box-sizing:border-box}
  .cust-root{
    --bg:#f4f6f9; --panel:#fff; --ink:#161b26; --ink2:#5a6580; --ink3:#94a0b8;
    --line:#e7ebf1; --line2:#dde2ec; --c:#059669;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;
    direction:rtl; background:var(--bg); color:var(--ink); min-height:100vh;
    padding:26px 30px; -webkit-font-smoothing:antialiased;
  }
  .cust-num{font-variant-numeric:tabular-nums; letter-spacing:-.3px}

  .cust-head{display:flex; align-items:center; gap:14px; margin-bottom:22px; flex-wrap:wrap}
  .cust-head-ic{width:50px; height:50px; border-radius:13px; display:grid; place-items:center;
    background:#0596691a; color:#059669; flex-shrink:0}
  .cust-title{font-size:23px; font-weight:700; letter-spacing:-.4px; line-height:1.1}
  .cust-sub{font-size:13px; color:var(--ink2); margin-top:2px}
  .cust-add{margin-right:auto; display:inline-flex; align-items:center; gap:7px; height:42px; padding:0 18px;
    background:#059669; border:none; border-radius:11px; cursor:pointer; font-family:inherit; font-size:13.5px; font-weight:700; color:#fff}
  .cust-add:hover{background:#047857}

  .cust-kpis{display:grid; grid-template-columns:repeat(3,1fr); gap:14px; margin-bottom:16px}
  .cust-kpi{background:var(--panel); border:1px solid var(--line); border-radius:15px; padding:16px 18px; display:flex; align-items:center; gap:13px}
  .cust-kpi-ic{width:42px; height:42px; border-radius:11px; display:grid; place-items:center; flex-shrink:0;
    background:color-mix(in srgb,var(--kc) 14%,transparent); color:var(--kc)}
  .cust-kpi-val{font-size:23px; font-weight:800; font-variant-numeric:tabular-nums; line-height:1}
  .cust-kpi-label{font-size:12px; color:var(--ink2); font-weight:500; margin-top:3px}

  .cust-bar{display:flex; align-items:center; gap:12px; margin-bottom:16px}
  .cust-search{flex:1; display:flex; align-items:center; gap:9px; height:44px; padding:0 15px; background:var(--panel);
    border:1px solid var(--line2); border-radius:12px}
  .cust-search svg{color:var(--ink3); flex-shrink:0}
  .cust-search input{flex:1; border:none; outline:none; background:none; font-family:inherit; font-size:13.5px; color:var(--ink)}

  .cust-card{background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:20px}
  .cust-card-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:16px}
  .cust-card-title{font-size:15.5px; font-weight:700}
  .cust-card-hint{font-size:12px; color:var(--ink3); font-weight:500}

  .cust-tablewrap{overflow-x:auto}
  table.cust-table{width:100%; border-collapse:collapse; min-width:680px}
  .cust-table th{text-align:right; font-size:11.5px; color:var(--ink3); font-weight:700; padding:0 12px 11px;
    border-bottom:1px solid var(--line); white-space:nowrap}
  .cust-table td{padding:13px 12px; border-bottom:1px solid var(--line); font-size:13px; vertical-align:middle}
  .cust-table tr:last-child td{border-bottom:none}
  .cust-c-name{display:flex; align-items:center; gap:10px; font-weight:600; color:var(--ink); white-space:nowrap}
  .cust-c-avatar{width:34px; height:34px; border-radius:9px; display:grid; place-items:center; flex-shrink:0;
    background:#0596691a; color:#059669}
  .cust-c-phone{color:var(--ink2); white-space:nowrap; font-variant-numeric:tabular-nums}
  .cust-type{display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:700; padding:4px 10px; border-radius:999px; white-space:nowrap}
  .cust-type.company{background:#dbeafe; color:#1d4ed8}
  .cust-type.individual{background:#f3e8ff; color:#7c2d92}
  .cust-chip{display:inline-flex; align-items:center; gap:5px; font-size:11.5px; font-weight:600; color:var(--ink2); white-space:nowrap}
  .cust-chip svg{color:var(--ink3)}
  .cust-c-tax{font-variant-numeric:tabular-nums; color:var(--ink2); font-size:12px; white-space:nowrap}
  .cust-del{width:32px; height:32px; border-radius:8px; border:1px solid var(--line2); background:var(--panel); cursor:pointer;
    display:grid; place-items:center; color:#dc2626}
  .cust-del:hover{background:#fef2f2; border-color:#fecaca}

  /* STATES */
  .cust-state{display:grid; place-items:center; padding:56px 20px; text-align:center}
  .cust-state-ic{width:62px; height:62px; border-radius:16px; display:grid; place-items:center; margin-bottom:15px}
  .cust-state-ic.load{background:#d1fae5; color:#059669}
  .cust-state-ic.empty{background:#eef1f6; color:#94a0b8}
  .cust-state-ic.err{background:#fee2e2; color:#dc2626}
  .cust-state-ic.load svg{animation:cust-rot 1s linear infinite}
  @keyframes cust-rot{to{transform:rotate(360deg)}}
  .cust-spin{animation:cust-rot 1s linear infinite}
  .cust-state-t{font-size:16px; font-weight:700; margin-bottom:6px}
  .cust-state-d{font-size:13px; color:var(--ink2); line-height:1.6; max-width:380px}

  /* MODAL */
  .cust-overlay{position:fixed; inset:0; background:rgba(15,23,42,.5); display:grid; place-items:start center; z-index:60; padding:30px 20px; overflow-y:auto}
  .cust-modal{background:var(--panel); border-radius:18px; width:100%; max-width:680px; box-shadow:0 20px 60px rgba(0,0,0,.3); margin:auto}
  .cust-modal-head{display:flex; align-items:center; justify-content:space-between; padding:20px 24px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--panel); border-radius:18px 18px 0 0; z-index:2}
  .cust-modal-title{font-size:18px; font-weight:700; display:flex; align-items:center; gap:9px}
  .cust-modal-close{width:34px; height:34px; border-radius:9px; border:none; background:var(--bg); cursor:pointer; display:grid; place-items:center; color:var(--ink2)}
  .cust-modal-body{padding:22px 24px}

  .cust-section{margin-bottom:24px}
  .cust-section:last-child{margin-bottom:0}
  .cust-section-t{font-size:13px; font-weight:700; color:var(--ink); margin-bottom:13px; display:flex; align-items:center; gap:8px}
  .cust-section-t svg{color:#059669}

  .cust-grid{display:grid; grid-template-columns:1fr 1fr; gap:13px}
  .cust-field{display:flex; flex-direction:column; gap:6px}
  .cust-field.full{grid-column:1 / -1}
  .cust-label{font-size:12px; font-weight:600; color:var(--ink2)}
  .cust-label .req{color:#dc2626; margin-right:3px}
  .cust-input{font-family:inherit; font-size:13px; padding:11px 13px; border-radius:10px; border:1px solid var(--line2); background:var(--bg); color:var(--ink); width:100%}
  .cust-input:focus{outline:none; border-color:#059669; background:#fff}
  .cust-input::placeholder{color:var(--ink3)}
  textarea.cust-input{resize:vertical; min-height:58px; line-height:1.6}

  .cust-type-pick{display:flex; gap:9px}
  .cust-type-opt{flex:1; display:flex; align-items:center; justify-content:center; gap:7px; padding:10px; border-radius:10px; border:1px solid var(--line2);
    background:var(--bg); cursor:pointer; font-size:13px; font-weight:600; color:var(--ink2)}
  .cust-type-opt.on{border-color:#059669; background:#ecfdf5; color:#047857}

  /* REPEATER (locations/contacts) */
  .cust-rep{display:flex; flex-direction:column; gap:11px}
  .cust-rep-item{background:var(--bg); border:1px solid var(--line); border-radius:12px; padding:14px; position:relative}
  .cust-rep-head{display:flex; align-items:center; justify-content:space-between; margin-bottom:11px}
  .cust-rep-num{font-size:12px; font-weight:700; color:#059669; display:flex; align-items:center; gap:6px}
  .cust-rep-del{width:28px; height:28px; border-radius:7px; border:none; background:#fee2e2; color:#dc2626; cursor:pointer; display:grid; place-items:center}
  .cust-rep-del:hover{background:#fecaca}
  .cust-rep-del:disabled{opacity:.4; cursor:not-allowed}
  .cust-addrow{display:inline-flex; align-items:center; gap:7px; margin-top:11px; padding:9px 15px; border-radius:9px; border:1.5px dashed var(--line2);
    background:none; cursor:pointer; font-family:inherit; font-size:12.5px; font-weight:700; color:#059669}
  .cust-addrow:hover{background:#ecfdf5; border-color:#6ee7b7}

  .cust-modal-foot{display:flex; gap:11px; padding:18px 24px; border-top:1px solid var(--line); position:sticky; bottom:0; background:var(--panel); border-radius:0 0 18px 18px}
  .cust-btn-save{flex:1; display:flex; align-items:center; justify-content:center; gap:8px; padding:13px; border-radius:11px; border:none;
    background:#059669; color:#fff; font-family:inherit; font-size:14px; font-weight:700; cursor:pointer}
  .cust-btn-save:hover{background:#047857}
  .cust-btn-save:disabled{opacity:.6; cursor:not-allowed}
  .cust-btn-cancel{padding:13px 22px; border-radius:11px; border:1px solid var(--line2); background:var(--panel); color:var(--ink2);
    font-family:inherit; font-size:14px; font-weight:600; cursor:pointer}
  .cust-err-msg{display:flex; align-items:center; gap:8px; font-size:12.5px; color:#dc2626; font-weight:600; padding:0 24px 14px}

  @media(max-width:760px){ .cust-grid{grid-template-columns:1fr} }
  @media(max-width:560px){
    .cust-root{padding:18px 14px}
    .cust-kpis{grid-template-columns:1fr}
    .cust-title{font-size:19px}
  }
`;

export default function CustomersView() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = () => {
    setLoading(true); setError(null);
    getCustomers()
      .then((data) => { setCustomers(data); setLoading(false); })
      .catch((err) => { setError(err.message || "تعذّر تحميل العملاء"); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  // تحديث حقل أساسي
  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // المواقع
  const addLocation = () => setForm((f) => ({ ...f, locations: [...f.locations, { label: "", mapLink: "", address: "" }] }));
  const removeLocation = (i) => setForm((f) => ({ ...f, locations: f.locations.filter((_, idx) => idx !== i) }));
  const updateLocation = (i, k, v) => setForm((f) => ({
    ...f, locations: f.locations.map((loc, idx) => (idx === i ? { ...loc, [k]: v } : loc)),
  }));

  // المخوّلون
  const addContact = () => setForm((f) => ({ ...f, contacts: [...f.contacts, { name: "", phone: "" }] }));
  const removeContact = (i) => setForm((f) => ({ ...f, contacts: f.contacts.filter((_, idx) => idx !== i) }));
  const updateContact = (i, k, v) => setForm((f) => ({
    ...f, contacts: f.contacts.map((c, idx) => (idx === i ? { ...c, [k]: v } : c)),
  }));

  const openForm = () => { setForm(emptyForm()); setFormErr(""); setShowForm(true); };

  const handleSave = async () => {
    // التحقق من الإلزامي: الاسم + رقم التواصل + العنوان الوطني (أول موقع)
    const firstLoc = form.locations[0] || {};
    if (!form.name.trim()) return setFormErr("الاسم التجاري / اسم العميل مطلوب");
    if (!form.phone.trim()) return setFormErr("رقم التواصل الرسمي مطلوب");
    if (!firstLoc.address.trim() && !firstLoc.mapLink.trim())
      return setFormErr("العنوان الوطني مطلوب (اكتب العنوان أو ضع رابط الموقع)");

    // تنظيف: احذف المواقع/المخوّلين الفارغة تمامًا
    const cleanData = {
      ...form,
      locations: form.locations.filter((l) => l.address.trim() || l.mapLink.trim() || l.label.trim()),
      contacts: form.contacts.filter((c) => c.name.trim() || c.phone.trim()),
    };

    setSaving(true); setFormErr("");
    try {
      await addCustomer(cleanData);
      setShowForm(false);
      load();
    } catch (err) {
      setFormErr(err.message || "تعذّر حفظ العميل");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`حذف العميل "${name}"؟`)) return;
    try { await deleteCustomer(id); load(); }
    catch (err) { alert("تعذّر الحذف: " + err.message); }
  };

  // فلترة البحث
  const filtered = customers.filter((c) => {
    const q = search.trim();
    if (!q) return true;
    return (c.name || "").includes(q) || (c.phone || "").includes(q);
  });

  const total = customers.length;
  const companies = customers.filter((c) => c.type === "company").length;
  const individuals = customers.filter((c) => c.type === "individual").length;

  return (
    <div className="cust-root">
      <style>{STYLES}</style>

      {/* HEAD */}
      <div className="cust-head">
        <div className="cust-head-ic"><Users size={24} /></div>
        <div>
          <div className="cust-title">العملاء</div>
          <div className="cust-sub">إدارة عملاء الشركة ومواقعهم ومخوّليهم · المالية</div>
        </div>
        <button className="cust-add" onClick={openForm}><Plus size={17} /> عميل جديد</button>
      </div>

      {/* KPIs */}
      <div className="cust-kpis">
        <div className="cust-kpi" style={{ "--kc": "#059669" }}>
          <div className="cust-kpi-ic"><Users size={20} /></div>
          <div><div className="cust-kpi-val cust-num">{total}</div><div className="cust-kpi-label">إجمالي العملاء</div></div>
        </div>
        <div className="cust-kpi" style={{ "--kc": "#2563eb" }}>
          <div className="cust-kpi-ic"><Building2 size={20} /></div>
          <div><div className="cust-kpi-val cust-num">{companies}</div><div className="cust-kpi-label">شركات</div></div>
        </div>
        <div className="cust-kpi" style={{ "--kc": "#7c3aed" }}>
          <div className="cust-kpi-ic"><User size={20} /></div>
          <div><div className="cust-kpi-val cust-num">{individuals}</div><div className="cust-kpi-label">أفراد</div></div>
        </div>
      </div>

      {/* SEARCH */}
      <div className="cust-bar">
        <div className="cust-search">
          <Search size={17} />
          <input placeholder="ابحث بالاسم أو رقم الجوال..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button className="cust-add" style={{ marginRight: 0, background: "#fff", color: "#059669", border: "1px solid #6ee7b7" }} onClick={load}>
          <RefreshCw size={16} /> تحديث
        </button>
      </div>

      {/* TABLE / STATES */}
      <div className="cust-card">
        <div className="cust-card-head">
          <span className="cust-card-title">قائمة العملاء</span>
          {!loading && !error && <span className="cust-card-hint">{filtered.length} عميل</span>}
        </div>

        {loading ? (
          <div className="cust-state">
            <div className="cust-state-ic load"><RefreshCw size={26} /></div>
            <div className="cust-state-t">جاري تحميل العملاء...</div>
          </div>
        ) : error ? (
          <div className="cust-state">
            <div className="cust-state-ic err"><AlertCircle size={26} /></div>
            <div className="cust-state-t">تعذّر تحميل العملاء</div>
            <div className="cust-state-d">{error}<br />تأكد من تسجيل الدخول، ثم اضغط تحديث.</div>
          </div>
        ) : total === 0 ? (
          <div className="cust-state">
            <div className="cust-state-ic empty"><Inbox size={26} /></div>
            <div className="cust-state-t">لا يوجد عملاء بعد</div>
            <div className="cust-state-d">ابدأ بإضافة أول عميل بالضغط على «عميل جديد».</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="cust-state">
            <div className="cust-state-ic empty"><Search size={26} /></div>
            <div className="cust-state-t">لا نتائج للبحث</div>
            <div className="cust-state-d">جرّب كلمة بحث أخرى.</div>
          </div>
        ) : (
          <div className="cust-tablewrap">
            <table className="cust-table">
              <thead>
                <tr>
                  <th>العميل</th>
                  <th>النوع</th>
                  <th>رقم التواصل</th>
                  <th>المواقع</th>
                  <th>المخوّلون</th>
                  <th>الرقم الضريبي</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const isCompany = c.type !== "individual";
                  const locCount = (c.locations || []).length;
                  const conCount = (c.contacts || []).length;
                  return (
                    <tr key={c.id}>
                      <td>
                        <span className="cust-c-name">
                          <span className="cust-c-avatar">{isCompany ? <Building2 size={16} /> : <User size={16} />}</span>
                          {c.name}
                        </span>
                      </td>
                      <td>
                        <span className={`cust-type ${isCompany ? "company" : "individual"}`}>
                          {isCompany ? <Building2 size={11} /> : <User size={11} />}{isCompany ? "شركة" : "فرد"}
                        </span>
                      </td>
                      <td className="cust-c-phone">{c.phone || "—"}</td>
                      <td><span className="cust-chip"><MapPin size={13} />{locCount}</span></td>
                      <td><span className="cust-chip"><UserCog size={13} />{conCount}</span></td>
                      <td className="cust-c-tax">{c.vatNumber || "—"}</td>
                      <td><button className="cust-del" onClick={() => handleDelete(c.id, c.name)}><Trash2 size={15} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* FORM MODAL */}
      {showForm && (
        <div className="cust-overlay" onClick={() => !saving && setShowForm(false)}>
          <div className="cust-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cust-modal-head">
              <span className="cust-modal-title"><Plus size={20} style={{ color: "#059669" }} /> عميل جديد</span>
              <button className="cust-modal-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>

            <div className="cust-modal-body">
              {/* معلومات أساسية */}
              <div className="cust-section">
                <div className="cust-section-t"><FileText size={15} /> المعلومات الأساسية</div>

                <div className="cust-grid">
                  <div className="cust-field full">
                    <label className="cust-label">نوع العميل</label>
                    <div className="cust-type-pick">
                      <div className={`cust-type-opt ${form.type === "company" ? "on" : ""}`} onClick={() => setField("type", "company")}>
                        <Building2 size={16} /> شركة
                      </div>
                      <div className={`cust-type-opt ${form.type === "individual" ? "on" : ""}`} onClick={() => setField("type", "individual")}>
                        <User size={16} /> فرد
                      </div>
                    </div>
                  </div>

                  <div className="cust-field full">
                    <label className="cust-label"><span className="req">*</span>الاسم التجاري / اسم العميل</label>
                    <input className="cust-input" value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="مثل: مؤسسة النور للمقاولات" />
                  </div>

                  <div className="cust-field">
                    <label className="cust-label"><span className="req">*</span>رقم التواصل الرسمي</label>
                    <input className="cust-input" value={form.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="05xxxxxxxx" dir="ltr" style={{ textAlign: "right" }} />
                  </div>
                  <div className="cust-field">
                    <label className="cust-label">البريد الإلكتروني</label>
                    <input className="cust-input" value={form.email} onChange={(e) => setField("email", e.target.value)} placeholder="info@example.com" dir="ltr" style={{ textAlign: "right" }} />
                  </div>

                  <div className="cust-field">
                    <label className="cust-label">رقم السجل التجاري</label>
                    <input className="cust-input" value={form.crNumber} onChange={(e) => setField("crNumber", e.target.value)} placeholder="1010xxxxxx" dir="ltr" style={{ textAlign: "right" }} />
                  </div>
                  <div className="cust-field">
                    <label className="cust-label">الرقم الضريبي</label>
                    <input className="cust-input" value={form.vatNumber} onChange={(e) => setField("vatNumber", e.target.value)} placeholder="3xxxxxxxxxxxxx3" dir="ltr" style={{ textAlign: "right" }} />
                  </div>

                  <div className="cust-field">
                    <label className="cust-label">رقم الترخيص</label>
                    <input className="cust-input" value={form.licenseNumber} onChange={(e) => setField("licenseNumber", e.target.value)} placeholder="اختياري" />
                  </div>
                  <div className="cust-field">
                    <label className="cust-label">الموقع الإلكتروني</label>
                    <input className="cust-input" value={form.website} onChange={(e) => setField("website", e.target.value)} placeholder="www.example.com" dir="ltr" style={{ textAlign: "right" }} />
                  </div>
                </div>
              </div>

              {/* المواقع */}
              <div className="cust-section">
                <div className="cust-section-t"><MapPin size={15} /> المواقع والعناوين</div>
                <div className="cust-rep">
                  {form.locations.map((loc, i) => (
                    <div className="cust-rep-item" key={i}>
                      <div className="cust-rep-head">
                        <span className="cust-rep-num"><MapPin size={13} /> الموقع {i + 1}{i === 0 && " (الرئيسي)"}</span>
                        <button className="cust-rep-del" onClick={() => removeLocation(i)} disabled={form.locations.length === 1}><Trash2 size={14} /></button>
                      </div>
                      <div className="cust-grid">
                        <div className="cust-field">
                          <label className="cust-label">اسم الموقع</label>
                          <input className="cust-input" value={loc.label} onChange={(e) => updateLocation(i, "label", e.target.value)} placeholder="مثل: الفرع الرئيسي" />
                        </div>
                        <div className="cust-field">
                          <label className="cust-label">رابط قوقل ماب</label>
                          <input className="cust-input" value={loc.mapLink} onChange={(e) => updateLocation(i, "mapLink", e.target.value)} placeholder="https://maps.app.goo.gl/..." dir="ltr" style={{ textAlign: "right" }} />
                        </div>
                        <div className="cust-field full">
                          <label className="cust-label">{i === 0 && <span className="req">*</span>}العنوان الوطني</label>
                          <textarea className="cust-input" value={loc.address} onChange={(e) => updateLocation(i, "address", e.target.value)}
                            placeholder="المملكة العربية السعودية - الرياض، حي المهدية - شارع ابن الكلبي 34927" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="cust-addrow" onClick={addLocation}><Plus size={15} /> إضافة موقع آخر</button>
              </div>

              {/* المخوّلون */}
              <div className="cust-section">
                <div className="cust-section-t"><UserCog size={15} /> المخوّلون</div>
                <div className="cust-rep">
                  {form.contacts.map((con, i) => (
                    <div className="cust-rep-item" key={i}>
                      <div className="cust-rep-head">
                        <span className="cust-rep-num"><UserCog size={13} /> المخوّل {i + 1}</span>
                        <button className="cust-rep-del" onClick={() => removeContact(i)} disabled={form.contacts.length === 1}><Trash2 size={14} /></button>
                      </div>
                      <div className="cust-grid">
                        <div className="cust-field">
                          <label className="cust-label">اسم المخوّل</label>
                          <input className="cust-input" value={con.name} onChange={(e) => updateContact(i, "name", e.target.value)} placeholder="مثل: أحمد محمد" />
                        </div>
                        <div className="cust-field">
                          <label className="cust-label">رقم التواصل معه</label>
                          <input className="cust-input" value={con.phone} onChange={(e) => updateContact(i, "phone", e.target.value)} placeholder="05xxxxxxxx" dir="ltr" style={{ textAlign: "right" }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="cust-addrow" onClick={addContact}><Plus size={15} /> إضافة مخوّل آخر</button>
              </div>
            </div>

            {formErr && <div className="cust-err-msg"><AlertCircle size={15} /> {formErr}</div>}

            <div className="cust-modal-foot">
              <button className="cust-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? <><RefreshCw size={16} className="cust-spin" /> جاري الحفظ...</> : <><Save size={16} /> حفظ العميل</>}
              </button>
              <button className="cust-btn-cancel" onClick={() => setShowForm(false)} disabled={saving}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
