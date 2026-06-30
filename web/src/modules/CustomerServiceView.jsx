import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   خدمة العملاء و CRM — قسم المبيعات والتسويق
   نظام تذاكر احترافي + سجل تفاعلات العملاء + نظرة عامة.
   getServiceData / createTicket / updateTicket / addTicketReply /
   deleteTicket / createInteraction / deleteInteraction.
   ============================================================ */

const CATEGORY = {
  complaint: { label: "شكوى", color: "#dc2626" },
  inquiry: { label: "استفسار", color: "#2563eb" },
  service_request: { label: "طلب خدمة", color: "#ea580c" },
  technical: { label: "دعم فني", color: "#7c3aed" },
  billing: { label: "فوترة", color: "#0891b2" },
  other: { label: "أخرى", color: "#64748b" },
};
const PRIORITY = {
  urgent: { label: "عاجلة", color: "#dc2626", bg: "#fee2e2" },
  high: { label: "عالية", color: "#ea580c", bg: "#ffedd5" },
  medium: { label: "متوسطة", color: "#2563eb", bg: "#dbeafe" },
  low: { label: "منخفضة", color: "#64748b", bg: "#f1f5f9" },
};
const STATUS = {
  open: { label: "مفتوحة", color: "#db2777", bg: "#fce7f3" },
  in_progress: { label: "قيد المعالجة", color: "#2563eb", bg: "#dbeafe" },
  pending: { label: "معلّقة", color: "#92400e", bg: "#fef3c7" },
  resolved: { label: "محلولة", color: "#16a34a", bg: "#dcfce7" },
  closed: { label: "مغلقة", color: "#64748b", bg: "#f1f5f9" },
};
const INTERACTION = {
  call: { label: "مكالمة", icon: "📞" },
  meeting: { label: "اجتماع", icon: "🤝" },
  email: { label: "بريد", icon: "📧" },
  visit: { label: "زيارة", icon: "🚗" },
  message: { label: "رسالة", icon: "💬" },
};
const CAT_ORDER = ["complaint", "inquiry", "service_request", "technical", "billing", "other"];
const PRI_ORDER = ["urgent", "high", "medium", "low"];
const STATUS_ORDER = ["open", "in_progress", "pending", "resolved", "closed"];
const INTER_ORDER = ["call", "meeting", "email", "visit", "message"];

const num4 = (n) => String(n).padStart(4, "0");
function fmtDateTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  return `${d.toLocaleDateString("en-GB")} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function CustomerServiceView() {
  const [tenantId, setTenantId] = useState("");
  const [tab, setTab] = useState("tickets");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة."); setLoading(false); return; }
        setTenantId(tid);
      } catch (e) {
        setError("تعذّر تحميل بيانات المستخدم."); setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (tenantId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const res = await httpsCallable(functions, "getServiceData")({});
      setData(res.data);
    } catch (e) {
      setError(e.message || "تعذّر تحميل البيانات.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const s = data ? data.summary : { openCount: 0, totalCount: 0, resolvedCount: 0, resolutionRate: 0, avgSatisfaction: null, interactionsCount: 0 };

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>خدمة العملاء و CRM</h1>
          <p style={styles.pageSub}>إدارة التذاكر وتفاعلات العملاء بشكل احترافي.</p>
        </div>
      </div>

      {/* تبويب */}
      <div style={styles.tabs}>
        <button style={tab === "tickets" ? styles.tabActive : styles.tab} onClick={() => setTab("tickets")}>🎫 التذاكر {s.openCount > 0 ? <span style={styles.tabBadge}>{s.openCount}</span> : null}</button>
        <button style={tab === "interactions" ? styles.tabActive : styles.tab} onClick={() => setTab("interactions")}>📇 التفاعلات</button>
        <button style={tab === "overview" ? styles.tabActive : styles.tab} onClick={() => setTab("overview")}>📊 نظرة عامة</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : !data ? (
        <div style={styles.warnBox}>تعذّر تحميل البيانات.</div>
      ) : (
        <>
          {tab === "tickets" ? <TicketsTab data={data} onReload={loadData} /> : null}
          {tab === "interactions" ? <InteractionsTab data={data} onReload={loadData} /> : null}
          {tab === "overview" ? <OverviewTab data={data} /> : null}
        </>
      )}
    </div>
  );
}

/* ===================== تبويب التذاكر ===================== */
function TicketsTab({ data, onReload }) {
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const s = data.summary;
  let tickets = data.tickets;
  if (filter === "open") tickets = tickets.filter((t) => ["open", "in_progress", "pending"].includes(t.status));
  else if (filter === "resolved") tickets = tickets.filter((t) => ["resolved", "closed"].includes(t.status));

  return (
    <>
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}><span style={styles.kpiLabel}>تذاكر مفتوحة</span><span style={{ ...styles.kpiValue, color: "#db2777" }}>{s.openCount}</span></div>
        <div style={styles.kpiCard}><span style={styles.kpiLabel}>إجمالي التذاكر</span><span style={styles.kpiValue}>{s.totalCount}</span></div>
        <div style={styles.kpiCard}><span style={styles.kpiLabel}>معدل الحل</span><span style={{ ...styles.kpiValue, color: "#16a34a" }} dir="ltr">{s.resolutionRate}%</span></div>
        <div style={styles.kpiCard}><span style={styles.kpiLabel}>رضا العملاء</span><span style={{ ...styles.kpiValue, color: "#7c3aed" }}>{s.avgSatisfaction != null ? `${s.avgSatisfaction}/5` : "—"}</span></div>
      </div>

      <div style={styles.toolbar}>
        <div style={styles.filterTabs}>
          <button style={filter === "all" ? styles.filterOn : styles.filterOff} onClick={() => setFilter("all")}>الكل</button>
          <button style={filter === "open" ? styles.filterOn : styles.filterOff} onClick={() => setFilter("open")}>المفتوحة</button>
          <button style={filter === "resolved" ? styles.filterOn : styles.filterOff} onClick={() => setFilter("resolved")}>المحلولة</button>
        </div>
        <button style={styles.addBtn} onClick={() => setModal("new")}>+ تذكرة جديدة</button>
      </div>

      {tickets.length === 0 ? (
        <div style={styles.warnBox}>لا توجد تذاكر في هذا التصنيف.</div>
      ) : (
        <div style={styles.list}>
          {tickets.map((t) => {
            const cat = CATEGORY[t.category] || CATEGORY.other;
            const pri = PRIORITY[t.priority] || PRIORITY.medium;
            const st = STATUS[t.status] || STATUS.open;
            return (
              <div key={t.id} style={styles.ticketCard} onClick={() => setModal({ detail: t })}>
                <div style={styles.tkTop}>
                  <div style={styles.tkLeft}>
                    <span style={styles.tkNum}>#{num4(t.ticketNumber)}</span>
                    <span style={styles.tkSubject}>{t.subject}</span>
                  </div>
                  <span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span>
                </div>
                <div style={styles.tkMeta}>
                  {t.customerName ? <span style={styles.tkChip}>🏢 {t.customerName}</span> : null}
                  <span style={{ ...styles.tkChip, color: cat.color }}>{cat.label}</span>
                  <span style={{ ...styles.priBadge, color: pri.color, background: pri.bg }}>{pri.label}</span>
                  {t.assignedTo ? <span style={styles.tkChip}>👤 {t.assignedTo}</span> : null}
                  {t.repliesCount > 0 ? <span style={styles.tkChip}>💬 {t.repliesCount}</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal === "new" ? <NewTicketModal onClose={() => setModal(null)} onSaved={() => { setModal(null); onReload(); }} /> : null}
      {modal && modal.detail ? <TicketDetailModal ticket={modal.detail} onClose={() => setModal(null)} onChanged={onReload} onCloseAfter={() => { setModal(null); onReload(); }} /> : null}
    </>
  );
}

function NewTicketModal({ onClose, onSaved }) {
  const [f, setF] = useState({ subject: "", customerName: "", contactPerson: "", contactPhone: "", category: "inquiry", priority: "medium", assignedTo: "", description: "" });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setErr("");
    if (f.subject.trim().length < 2) { setErr("موضوع التذكرة مطلوب."); return; }
    setSaving(true);
    try {
      await httpsCallable(functions, "createTicket")({
        subject: f.subject.trim(), customerName: f.customerName.trim(), contactPerson: f.contactPerson.trim(),
        contactPhone: f.contactPhone.trim(), category: f.category, priority: f.priority,
        assignedTo: f.assignedTo.trim(), description: f.description.trim(),
      });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); setSaving(false); }
  }
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>تذكرة جديدة</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <div style={styles.field}><label style={styles.label}>الموضوع *</label><input style={styles.input} value={f.subject} onChange={(e) => set("subject", e.target.value)} disabled={saving} placeholder="تأخر توريد عمالة" /></div>
        <div style={styles.field}><label style={styles.label}>العميل</label><input style={styles.input} value={f.customerName} onChange={(e) => set("customerName", e.target.value)} disabled={saving} /></div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الشخص المسؤول</label><input style={styles.input} value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} disabled={saving} /></div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الجوال</label><input style={styles.input} value={f.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الفئة</label>
            <select style={styles.input} value={f.category} onChange={(e) => set("category", e.target.value)} disabled={saving}>{CAT_ORDER.map((c) => <option key={c} value={c}>{CATEGORY[c].label}</option>)}</select>
          </div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>الأولوية</label>
            <select style={styles.input} value={f.priority} onChange={(e) => set("priority", e.target.value)} disabled={saving}>{PRI_ORDER.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}</select>
          </div></div>
        </div>
        <div style={styles.field}><label style={styles.label}>المسؤول (فريق الدعم)</label><input style={styles.input} value={f.assignedTo} onChange={(e) => set("assignedTo", e.target.value)} disabled={saving} /></div>
        <div style={styles.field}><label style={styles.label}>الوصف</label><textarea style={styles.textarea} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} rows={3} /></div>
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الإنشاء..." : "إنشاء"}</button>
        </div>
      </div>
    </div>
  );
}

function TicketDetailModal({ ticket, onClose, onChanged, onCloseAfter }) {
  const [t, setT] = useState(ticket);
  const [reply, setReply] = useState("");
  const [resolution, setResolution] = useState(ticket.resolution || "");
  const [busy, setBusy] = useState(false);
  const cat = CATEGORY[t.category] || CATEGORY.other;
  const pri = PRIORITY[t.priority] || PRIORITY.medium;

  async function patch(fields) {
    setBusy(true);
    try {
      await httpsCallable(functions, "updateTicket")({ ticketId: t.id, ...fields });
      setT((prev) => ({ ...prev, ...fields }));
      onChanged();
    } catch (e) { alert(e.message || "تعذّر التحديث."); }
    finally { setBusy(false); }
  }

  async function sendReply() {
    if (reply.trim().length < 1) return;
    setBusy(true);
    try {
      await httpsCallable(functions, "addTicketReply")({ ticketId: t.id, text: reply.trim() });
      setT((prev) => ({ ...prev, replies: [...(prev.replies || []), { text: reply.trim(), byName: "أنت", at: Date.now() }], repliesCount: (prev.repliesCount || 0) + 1 }));
      setReply("");
      onChanged();
    } catch (e) { alert(e.message || "تعذّر إضافة الرد."); }
    finally { setBusy(false); }
  }

  async function del() {
    if (!window.confirm(`حذف تذكرة #${num4(t.ticketNumber)}؟`)) return;
    setBusy(true);
    try { await httpsCallable(functions, "deleteTicket")({ ticketId: t.id }); onCloseAfter(); }
    catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalWide} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>#{num4(t.ticketNumber)} · {t.subject}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        {/* معلومات */}
        <div style={styles.detailMeta}>
          {t.customerName ? <span style={styles.tkChip}>🏢 {t.customerName}</span> : null}
          {t.contactPerson ? <span style={styles.tkChip}>👤 {t.contactPerson}</span> : null}
          {t.contactPhone ? <span style={styles.tkChip} dir="ltr">📱 {t.contactPhone}</span> : null}
          <span style={{ ...styles.tkChip, color: cat.color }}>{cat.label}</span>
          <span style={styles.tkChip}>📅 {fmtDateTime(t.createdAt)}</span>
        </div>
        {t.description ? <div style={styles.detailDesc}>{t.description}</div> : null}

        {/* تحكّم سريع */}
        <div style={styles.controlGrid}>
          <div style={styles.ctrl}><label style={styles.ctrlLabel}>الحالة</label>
            <select style={styles.input} value={t.status} onChange={(e) => patch({ status: e.target.value })} disabled={busy}>{STATUS_ORDER.map((st) => <option key={st} value={st}>{STATUS[st].label}</option>)}</select>
          </div>
          <div style={styles.ctrl}><label style={styles.ctrlLabel}>الأولوية</label>
            <select style={{ ...styles.input, color: pri.color }} value={t.priority} onChange={(e) => patch({ priority: e.target.value })} disabled={busy}>{PRI_ORDER.map((p) => <option key={p} value={p}>{PRIORITY[p].label}</option>)}</select>
          </div>
          <div style={styles.ctrl}><label style={styles.ctrlLabel}>المسؤول</label>
            <input style={styles.input} defaultValue={t.assignedTo || ""} onBlur={(e) => { if (e.target.value.trim() !== (t.assignedTo || "")) patch({ assignedTo: e.target.value.trim() }); }} disabled={busy} placeholder="اسم الموظف" />
          </div>
        </div>

        {/* الردود (timeline) */}
        <div style={styles.repliesSection}>
          <h3 style={styles.repliesTitle}>الردود والتحديثات ({(t.replies || []).length})</h3>
          {(t.replies || []).length === 0 ? <p style={styles.muted}>لا توجد ردود بعد.</p> : (
            <div style={styles.replyList}>
              {(t.replies || []).map((r, i) => (
                <div key={i} style={styles.replyItem}>
                  <div style={styles.replyHead}>
                    <span style={styles.replyBy}>👤 {r.byName || "موظف"}</span>
                    <span style={styles.replyAt}>{fmtDateTime(r.at)}</span>
                  </div>
                  <div style={styles.replyText}>{r.text}</div>
                </div>
              ))}
            </div>
          )}
          <div style={styles.replyBox}>
            <textarea style={styles.replyInput} value={reply} onChange={(e) => setReply(e.target.value)} disabled={busy} rows={2} placeholder="اكتب ردًا أو تحديثًا..." />
            <button style={styles.replyBtn} onClick={sendReply} disabled={busy || reply.trim().length < 1}>إرسال</button>
          </div>
        </div>

        {/* الحل + الرضا */}
        <div style={styles.resolveSection}>
          <label style={styles.label}>الحل / الإجراء المتّخذ</label>
          <textarea style={styles.textarea} value={resolution} onChange={(e) => setResolution(e.target.value)} disabled={busy} rows={2} placeholder="ما تم لحل المشكلة..." />
          <button style={styles.saveResolution} onClick={() => patch({ resolution: resolution.trim() })} disabled={busy}>حفظ الحل</button>

          <div style={styles.satRow}>
            <label style={styles.label}>تقييم رضا العميل:</label>
            <div style={styles.stars}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} style={{ ...styles.star, color: (t.satisfaction || 0) >= n ? "#fbbf24" : "#e2e8f0" }} onClick={() => patch({ satisfaction: n })} disabled={busy}>★</button>
              ))}
              {t.satisfaction ? <button style={styles.clearSat} onClick={() => patch({ satisfaction: null })} disabled={busy}>مسح</button> : null}
            </div>
          </div>
        </div>

        <div style={styles.modalActions}>
          <button style={styles.delBtnWide} onClick={del} disabled={busy}>🗑 حذف التذكرة</button>
          <button style={styles.saveBtn} onClick={onClose} disabled={busy}>إغلاق</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== تبويب التفاعلات ===================== */
function InteractionsTab({ data, onReload }) {
  const [modal, setModal] = useState(false);
  const interactions = data.interactions;
  return (
    <>
      <div style={styles.toolbar}>
        <span style={styles.crmHint}>📇 سجل كل تواصل مع عملائك — مكالمات، اجتماعات، زيارات.</span>
        <button style={styles.addBtn} onClick={() => setModal(true)}>+ تسجيل تفاعل</button>
      </div>
      {interactions.length === 0 ? (
        <div style={styles.warnBox}>لا توجد تفاعلات مسجّلة. سجّل أول تواصل مع عميل.</div>
      ) : (
        <div style={styles.list}>
          {interactions.map((it) => {
            const info = INTERACTION[it.type] || INTERACTION.call;
            return (
              <div key={it.id} style={styles.interCard}>
                <div style={styles.interIcon}>{info.icon}</div>
                <div style={styles.interBody}>
                  <div style={styles.interTop}>
                    <span style={styles.interCustomer}>{it.customerName || "—"}</span>
                    <span style={styles.interType}>{info.label}</span>
                    {it.date ? <span style={styles.interDate} dir="ltr">{it.date}</span> : null}
                  </div>
                  {it.subject ? <div style={styles.interSubject}>{it.subject}</div> : null}
                  {it.summary ? <div style={styles.interSummary}>{it.summary}</div> : null}
                  {it.outcome ? <div style={styles.interOutcome}>✓ {it.outcome}</div> : null}
                </div>
                <DeleteInteraction id={it.id} onDone={onReload} />
              </div>
            );
          })}
        </div>
      )}
      {modal ? <InteractionModal onClose={() => setModal(false)} onSaved={() => { setModal(false); onReload(); }} /> : null}
    </>
  );
}

function DeleteInteraction({ id, onDone }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm("حذف هذا التفاعل؟")) return;
    setBusy(true);
    try { await httpsCallable(functions, "deleteInteraction")({ interactionId: id }); onDone(); }
    catch (e) { alert(e.message || "تعذّر الحذف."); setBusy(false); }
  }
  return <button style={styles.interDel} onClick={del} disabled={busy}>{busy ? "..." : "🗑"}</button>;
}

function InteractionModal({ onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState({ type: "call", customerName: "", contactPerson: "", subject: "", summary: "", outcome: "", date: today });
  const [err, setErr] = useState(""); const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  async function save() {
    setErr("");
    if (f.customerName.trim().length < 2) { setErr("اسم العميل مطلوب."); return; }
    setSaving(true);
    try {
      await httpsCallable(functions, "createInteraction")({
        type: f.type, customerName: f.customerName.trim(), contactPerson: f.contactPerson.trim(),
        subject: f.subject.trim(), summary: f.summary.trim(), outcome: f.outcome.trim(), date: f.date,
      });
      onSaved();
    } catch (e) { setErr(e.message || "تعذّر الحفظ."); setSaving(false); }
  }
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>تسجيل تفاعل</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <div style={styles.row}>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>النوع</label>
            <select style={styles.input} value={f.type} onChange={(e) => set("type", e.target.value)} disabled={saving}>{INTER_ORDER.map((it) => <option key={it} value={it}>{INTERACTION[it].icon} {INTERACTION[it].label}</option>)}</select>
          </div></div>
          <div style={{ flex: 1 }}><div style={styles.field}><label style={styles.label}>التاريخ</label><input style={styles.input} type="date" value={f.date} onChange={(e) => set("date", e.target.value)} disabled={saving} dir="ltr" /></div></div>
        </div>
        <div style={styles.field}><label style={styles.label}>العميل *</label><input style={styles.input} value={f.customerName} onChange={(e) => set("customerName", e.target.value)} disabled={saving} /></div>
        <div style={styles.field}><label style={styles.label}>الشخص</label><input style={styles.input} value={f.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} disabled={saving} /></div>
        <div style={styles.field}><label style={styles.label}>الموضوع</label><input style={styles.input} value={f.subject} onChange={(e) => set("subject", e.target.value)} disabled={saving} placeholder="مناقشة عقد جديد" /></div>
        <div style={styles.field}><label style={styles.label}>الملخّص</label><textarea style={styles.textarea} value={f.summary} onChange={(e) => set("summary", e.target.value)} disabled={saving} rows={2} /></div>
        <div style={styles.field}><label style={styles.label}>النتيجة</label><input style={styles.input} value={f.outcome} onChange={(e) => set("outcome", e.target.value)} disabled={saving} placeholder="اتفقنا على اجتماع الأسبوع القادم" /></div>
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "تسجيل"}</button>
        </div>
      </div>
    </div>
  );
}

/* ===================== تبويب النظرة العامة ===================== */
function OverviewTab({ data }) {
  const s = data.summary;
  const byCategory = data.byCategory;
  const team = data.team;
  const maxCat = Math.max(1, ...byCategory.map((c) => c.count));
  const maxTeam = Math.max(1, ...team.map((t) => t.resolved));
  return (
    <>
      <div style={styles.kpiGrid}>
        <div style={styles.kpiCard}><span style={styles.kpiLabel}>تذاكر مفتوحة</span><span style={{ ...styles.kpiValue, color: "#db2777" }}>{s.openCount}</span></div>
        <div style={styles.kpiCard}><span style={styles.kpiLabel}>محلولة</span><span style={{ ...styles.kpiValue, color: "#16a34a" }}>{s.resolvedCount}</span></div>
        <div style={styles.kpiCard}><span style={styles.kpiLabel}>معدل الحل</span><span style={{ ...styles.kpiValue, color: "#2563eb" }} dir="ltr">{s.resolutionRate}%</span></div>
        <div style={styles.kpiCard}><span style={styles.kpiLabel}>رضا العملاء</span><span style={{ ...styles.kpiValue, color: "#7c3aed" }}>{s.avgSatisfaction != null ? `${s.avgSatisfaction}/5` : "—"}</span></div>
      </div>

      <div style={styles.twoCol}>
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>تصنيف التذاكر</h3>
          {byCategory.length === 0 ? <p style={styles.muted}>لا توجد بيانات.</p> : (
            <div style={styles.catList}>
              {byCategory.map((c) => {
                const info = CATEGORY[c.category] || CATEGORY.other;
                return (
                  <div key={c.category} style={styles.catItem}>
                    <div style={styles.catTop}>
                      <span style={{ ...styles.catName, color: info.color }}>{info.label}</span>
                      <span style={styles.catCount}>{c.count} ({c.pct}%)</span>
                    </div>
                    <div style={styles.catBar}><div style={{ ...styles.catFill, width: `${(c.count / maxCat) * 100}%`, background: info.color }} /></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>أداء فريق الدعم</h3>
          {team.length === 0 ? <p style={styles.muted}>لا توجد بيانات. عيّن مسؤولين للتذاكر.</p> : (
            <div style={styles.teamList}>
              {team.map((m, i) => (
                <div key={i} style={styles.teamItem}>
                  <div style={styles.teamTop}>
                    <span style={styles.teamName}>{m.name}</span>
                    <span style={styles.teamResolved}>{m.resolved} محلولة</span>
                  </div>
                  <div style={styles.teamBar}><div style={{ ...styles.teamFill, width: `${(m.resolved / maxTeam) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { marginBottom: 18 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#db2777", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },

  tabs: { display: "flex", gap: 8, marginBottom: 20, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#64748b", background: "none", border: "none", borderBottom: "2px solid transparent", marginBottom: -2, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 },
  tabActive: { padding: "10px 18px", fontSize: 14, fontWeight: 700, color: "#db2777", background: "none", border: "none", borderBottom: "2px solid #db2777", marginBottom: -2, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 },
  tabBadge: { background: "#db2777", color: "#fff", fontSize: 11, fontWeight: 800, borderRadius: 10, padding: "1px 8px" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  kpiGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 },
  kpiCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 8 },
  kpiLabel: { fontSize: 13, color: "#64748b", fontWeight: 600 },
  kpiValue: { fontSize: 24, fontWeight: 800, color: "#0f172a", fontFamily: "monospace" },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 },
  filterTabs: { display: "flex", gap: 8 },
  filterOn: { padding: "7px 16px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer" },
  filterOff: { padding: "7px 16px", fontSize: 13, fontWeight: 600, color: "#64748b", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer" },
  addBtn: { padding: "9px 18px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },
  crmHint: { fontSize: 13, color: "#64748b" },

  list: { display: "flex", flexDirection: "column", gap: 12 },
  ticketCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px", cursor: "pointer" },
  tkTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 },
  tkLeft: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 },
  tkNum: { fontSize: 13, fontWeight: 800, color: "#94a3b8", fontFamily: "monospace" },
  tkSubject: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px", whiteSpace: "nowrap" },
  tkMeta: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  tkChip: { fontSize: 12, color: "#475569", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "3px 10px" },
  priBadge: { fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "3px 10px" },

  detailMeta: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 },
  detailDesc: { fontSize: 14, color: "#334155", background: "#f8fafc", borderRadius: 8, padding: "12px 14px", marginBottom: 16, lineHeight: 1.6 },
  controlGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 18 },
  ctrl: { display: "flex", flexDirection: "column", gap: 6 },
  ctrlLabel: { fontSize: 12, fontWeight: 700, color: "#64748b" },

  repliesSection: { background: "#f8fafc", borderRadius: 10, padding: "16px", marginBottom: 16 },
  repliesTitle: { fontSize: 14, fontWeight: 800, color: "#0f172a", margin: "0 0 12px" },
  replyList: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 },
  replyItem: { background: "#fff", borderRadius: 8, padding: "10px 14px", borderRight: "3px solid #db2777" },
  replyHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  replyBy: { fontSize: 13, fontWeight: 700, color: "#334155" },
  replyAt: { fontSize: 11, color: "#94a3b8", fontFamily: "monospace" },
  replyText: { fontSize: 14, color: "#475569", lineHeight: 1.5 },
  replyBox: { display: "flex", gap: 8, alignItems: "flex-end" },
  replyInput: { flex: 1, padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" },
  replyBtn: { padding: "10px 18px", fontSize: 13, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  resolveSection: { marginBottom: 16 },
  saveResolution: { marginTop: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#16a34a", background: "#f0fdf4", border: "none", borderRadius: 8, cursor: "pointer" },
  satRow: { marginTop: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  stars: { display: "flex", alignItems: "center", gap: 4 },
  star: { fontSize: 26, background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 },
  clearSat: { fontSize: 12, color: "#94a3b8", background: "#f1f5f9", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer", marginRight: 8 },

  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, alignItems: "start" },
  section: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: 800, color: "#0f172a", margin: "0 0 16px" },

  catList: { display: "flex", flexDirection: "column", gap: 14 },
  catItem: {},
  catTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  catName: { fontSize: 14, fontWeight: 700 },
  catCount: { fontSize: 13, color: "#64748b", fontWeight: 600, fontFamily: "monospace" },
  catBar: { height: 8, background: "#f1f5f9", borderRadius: 999, overflow: "hidden" },
  catFill: { height: "100%", borderRadius: 999 },

  teamList: { display: "flex", flexDirection: "column", gap: 14 },
  teamItem: {},
  teamTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 },
  teamName: { fontSize: 14, fontWeight: 600, color: "#334155" },
  teamResolved: { fontSize: 13, fontWeight: 700, color: "#16a34a" },
  teamBar: { height: 8, background: "#fce7f3", borderRadius: 999, overflow: "hidden" },
  teamFill: { height: "100%", background: "linear-gradient(90deg, #db2777, #f472b6)", borderRadius: 999 },

  interCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", display: "flex", gap: 14, alignItems: "flex-start" },
  interIcon: { fontSize: 28, flexShrink: 0 },
  interBody: { flex: 1, minWidth: 0 },
  interTop: { display: "flex", alignItems: "center", gap: 10, marginBottom: 5, flexWrap: "wrap" },
  interCustomer: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  interType: { fontSize: 12, color: "#db2777", background: "#fce7f3", borderRadius: 6, padding: "2px 10px", fontWeight: 600 },
  interDate: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  interSubject: { fontSize: 14, fontWeight: 600, color: "#334155", marginBottom: 4 },
  interSummary: { fontSize: 13, color: "#64748b", lineHeight: 1.5, marginBottom: 4 },
  interOutcome: { fontSize: 13, color: "#16a34a", fontWeight: 600 },
  interDel: { padding: "6px 10px", fontSize: 12, background: "#fef2f2", border: "none", borderRadius: 7, cursor: "pointer", flexShrink: 0 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalWide: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },
  modalActions: { display: "flex", gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#db2777", border: "none", borderRadius: 8, cursor: "pointer" },
  delBtnWide: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 700, color: "#dc2626", background: "#fef2f2", border: "none", borderRadius: 8, cursor: "pointer" },
};
