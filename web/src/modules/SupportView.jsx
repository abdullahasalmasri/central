import { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   SupportView — بوابة الدعم (تواصل العميل مع مالك المنصة)
   العميل ينشئ تذكرة ويتابع ردود الدعم.
   createSupportTicket / getMyTickets / addTicketMessage.
   ============================================================ */

const STATUS_INFO = {
  open: { label: "مفتوحة", color: "#ea580c", bg: "#ffedd5" },
  in_progress: { label: "قيد المعالجة", color: "#2563eb", bg: "#dbeafe" },
  closed: { label: "مغلقة", color: "#16a34a", bg: "#dcfce7" },
};
const CATEGORIES = [
  { id: "complaint", name: "شكوى" },
  { id: "feature", name: "طلب ميزة" },
  { id: "billing", name: "اشتراك / فوترة" },
  { id: "technical", name: "مشكلة تقنية" },
  { id: "other", name: "أخرى" },
];
const CAT_LABEL = CATEGORIES.reduce((a, c) => { a[c.id] = c.name; return a; }, {});

function fmtDateTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  return d.toLocaleDateString("en-GB") + " " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default function SupportView() {
  const [tenantId, setTenantId] = useState("");
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newModal, setNewModal] = useState(false);
  const [openTicket, setOpenTicket] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة."); setLoading(false); return; }
        setTenantId(tid);
      } catch (e) { setError("تعذّر تحميل البيانات."); setLoading(false); }
    })();
  }, []);

  useEffect(() => { if (tenantId) load(); /* eslint-disable-next-line */ }, [tenantId]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await httpsCallable(functions, "getMyTickets")({});
      setTickets(res.data.tickets || []);
    } catch (e) {
      setError(e.message || "تعذّر تحميل التذاكر.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>الدعم</h1>
          <p style={styles.pageSub}>تواصل مع فريق الدعم — أرسل شكوى أو طلبًا وتابع الرد.</p>
        </div>
        <button style={styles.addBtn} onClick={() => setNewModal(true)}>+ تذكرة جديدة</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : tickets.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🎫</div>
          <p style={styles.emptyText}>لا توجد تذاكر. أنشئ تذكرة للتواصل مع الدعم.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {tickets.map((t) => {
            const st = STATUS_INFO[t.status] || STATUS_INFO.open;
            return (
              <div key={t.id} style={{ ...styles.card, ...(t.clientUnread ? styles.cardUnread : {}) }} onClick={() => setOpenTicket(t)}>
                <div style={styles.cLeft}>
                  <div style={styles.cTop}>
                    {t.clientUnread ? <span style={styles.unreadDot} /> : null}
                    <span style={styles.cSubject}>{t.subject}</span>
                    <span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span>
                    <span style={styles.cCat}>{CAT_LABEL[t.category] || t.category}</span>
                  </div>
                  <div style={styles.cMeta}>
                    <span>💬 {(t.messages || []).length} رسالة</span>
                    {t.lastMessageFrom === "owner" ? <span style={styles.cReplied}>✓ تم الرد</span> : null}
                    <span dir="ltr">{fmtDateTime(t.lastMessageAt)}</span>
                  </div>
                </div>
                <span style={styles.cArrow}>‹</span>
              </div>
            );
          })}
        </div>
      )}

      {newModal ? <NewTicketModal onClose={() => setNewModal(false)} onCreated={() => { setNewModal(false); load(); }} /> : null}
      {openTicket ? <ChatModal ticket={openTicket} onClose={() => { setOpenTicket(null); load(); }} /> : null}
    </div>
  );
}

function NewTicketModal({ onClose, onCreated }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("complaint");
  const [message, setMessage] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setErr("");
    if (!subject.trim()) { setErr("أدخل عنوان التذكرة."); return; }
    if (!message.trim()) { setErr("أدخل تفاصيل المشكلة."); return; }
    setSaving(true);
    try {
      await httpsCallable(functions, "createSupportTicket")({ subject: subject.trim(), category, message: message.trim() });
      onCreated();
    } catch (e) { setErr(e.message || "تعذّر الإنشاء."); setSaving(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}><h2 style={styles.modalTitle}>تذكرة دعم جديدة</h2><button style={styles.close} onClick={onClose}>✕</button></div>
        {err ? <div style={styles.error}>{err}</div> : null}
        <div style={styles.field}><label style={styles.label}>العنوان</label><input style={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="موضوع التذكرة" disabled={saving} /></div>
        <div style={styles.field}><label style={styles.label}>النوع</label>
          <select style={styles.input} value={category} onChange={(e) => setCategory(e.target.value)} disabled={saving}>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div style={styles.field}><label style={styles.label}>التفاصيل</label><textarea style={{ ...styles.input, resize: "vertical", minHeight: 100 }} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="اشرح مشكلتك أو طلبك..." rows={4} disabled={saving} /></div>
        <div style={styles.modalActions}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
          <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الإرسال..." : "إرسال"}</button>
        </div>
      </div>
    </div>
  );
}

function ChatModal({ ticket, onClose }) {
  const [messages, setMessages] = useState(ticket.messages || []);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const st = STATUS_INFO[ticket.status] || STATUS_INFO.open;

  async function send() {
    setErr("");
    if (!reply.trim()) return;
    setSending(true);
    try {
      await httpsCallable(functions, "addTicketMessage")({ ticketId: ticket.id, message: reply.trim() });
      setMessages((m) => [...m, { from: "client", text: reply.trim(), authorName: "أنت", at: Date.now() }]);
      setReply("");
    } catch (e) { setErr(e.message || "تعذّر الإرسال."); } finally { setSending(false); }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.chatModal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.cmHead}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={styles.cmSubject}>{ticket.subject}</h2>
            <div style={styles.cmMeta}><span style={{ ...styles.chip, color: st.color, background: st.bg }}>{st.label}</span> <span style={styles.cmCat}>{CAT_LABEL[ticket.category] || ticket.category}</span></div>
          </div>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.cmMessages}>
          {messages.map((m, i) => (
            <div key={i} style={{ ...styles.msgRow, justifyContent: m.from === "client" ? "flex-end" : "flex-start" }}>
              <div style={m.from === "client" ? styles.msgClient : styles.msgOwner}>
                <div style={styles.msgAuthor}>{m.from === "client" ? (m.authorName || "أنت") : "الدعم"}</div>
                <div style={styles.msgText}>{m.text}</div>
                <div style={styles.msgTime} dir="ltr">{typeof m.at === "number" ? fmtDateTime(m.at) : ""}</div>
              </div>
            </div>
          ))}
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}

        {ticket.status === "closed" ? (
          <div style={styles.closedNote}>هذه التذكرة مغلقة.</div>
        ) : (
          <div style={styles.replyBar}>
            <textarea style={styles.replyInput} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="اكتب رسالتك..." rows={2} disabled={sending} />
            <button style={styles.sendBtn} onClick={send} disabled={sending || !reply.trim()}>{sending ? "..." : "إرسال"}</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#2563eb", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#2563eb", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },
  empty: { textAlign: "center", padding: "60px 20px" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: "#94a3b8", fontSize: 15 },

  list: { display: "flex", flexDirection: "column", gap: 10 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "15px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, cursor: "pointer" },
  cardUnread: { borderColor: "#bfdbfe", background: "#f8fbff" },
  cLeft: { flex: 1, minWidth: 0 },
  cTop: { display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 7 },
  unreadDot: { width: 8, height: 8, borderRadius: "50%", background: "#2563eb", flexShrink: 0 },
  cSubject: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  chip: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: "3px 12px", whiteSpace: "nowrap" },
  cCat: { fontSize: 12, color: "#64748b", background: "#f1f5f9", borderRadius: 5, padding: "2px 10px" },
  cMeta: { display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, color: "#64748b" },
  cReplied: { color: "#16a34a", fontWeight: 600 },
  cArrow: { fontSize: 24, color: "#cbd5e1", flexShrink: 0 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 14 },
  label: { fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 6 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  modalActions: { display: "flex", gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#2563eb", border: "none", borderRadius: 8, cursor: "pointer" },

  chatModal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  cmHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, padding: "20px 24px 14px", borderBottom: "1px solid #e2e8f0" },
  cmSubject: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: "0 0 7px" },
  cmMeta: { display: "flex", alignItems: "center", gap: 8 },
  cmCat: { fontSize: 12, color: "#64748b" },
  cmMessages: { flex: 1, overflowY: "auto", padding: "18px 24px", display: "flex", flexDirection: "column", gap: 12, minHeight: 200, maxHeight: 400, background: "#f8fafc" },
  msgRow: { display: "flex" },
  msgClient: { maxWidth: "78%", background: "#dbeafe", border: "1px solid #bfdbfe", borderRadius: "12px 12px 3px 12px", padding: "10px 14px" },
  msgOwner: { maxWidth: "78%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: "12px 12px 12px 3px", padding: "10px 14px" },
  msgAuthor: { fontSize: 12, fontWeight: 700, color: "#2563eb", marginBottom: 4 },
  msgText: { fontSize: 14, color: "#0f172a", lineHeight: 1.6, whiteSpace: "pre-wrap" },
  msgTime: { fontSize: 11, color: "#94a3b8", marginTop: 5 },
  replyBar: { display: "flex", gap: 10, padding: "14px 24px", borderTop: "1px solid #e2e8f0", alignItems: "flex-end" },
  replyInput: { flex: 1, padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, resize: "none", fontFamily: "inherit", boxSizing: "border-box" },
  sendBtn: { padding: "11px 22px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#2563eb", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },
  closedNote: { padding: "16px 24px", textAlign: "center", fontSize: 14, color: "#94a3b8", borderTop: "1px solid #e2e8f0" },
};
