import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";

/* ============================================================
   المشاريع — قسم العمليات
   مشاريع العملاء (تأجير عمالة، نقل كفالة، تأجير معدات، بيع، صيانة)
   + أنواع المشاريع + الحالات. الأساس الذي تُبنى عليه طلبات الموارد والإسناد.
   ============================================================ */

const STATUS_CFG = {
  planned: { label: "مخطّط", bg: "#f1f5f9", color: "#64748b" },
  active: { label: "نشط", bg: "#dcfce7", color: "#166534" },
  on_hold: { label: "متوقّف", bg: "#fef3c7", color: "#92400e" },
  under_review: { label: "قيد المراجعة", bg: "#e0e7ff", color: "#4338ca" },
  completed: { label: "مكتمل", bg: "#e0f2fe", color: "#0369a1" },
  cancelled: { label: "ملغى", bg: "#fee2e2", color: "#b91c1c" },
};
const STATUS_OPTIONS = [
  ["planned", "مخطّط"], ["active", "نشط"], ["on_hold", "متوقّف"],
  ["under_review", "قيد المراجعة"], ["completed", "مكتمل"], ["cancelled", "ملغى"],
];

export default function ProjectsView() {
  const [tenantId, setTenantId] = useState("");
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // "new" | {edit} | "types"

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
      const [pSnap, cSnap, tSnap] = await Promise.all([
        getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "customers"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "projectTypes"), where("tenantId", "==", tenantId))),
      ]);
      const pList = pSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      pList.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
      setProjects(pList);
      setCustomers(cSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTypes(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>المشاريع</h1>
          <p style={styles.pageSub}>مشاريع العملاء وعقودهم — الأساس لطلبات الموارد وإسناد العمالة.</p>
        </div>
        <div style={styles.topBtns}>
          <button style={styles.secBtn} onClick={() => setModal("types")}>⚙️ أنواع المشاريع</button>
          <button style={styles.addBtn} onClick={() => setModal("new")} disabled={customers.length === 0}>+ مشروع</button>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {customers.length === 0 && !loading ? (
        <div style={styles.warnBox}>⚠ لا يوجد عملاء. أضف عميلًا أولًا من <strong>المالية ← العملاء</strong> قبل إنشاء مشروع.</div>
      ) : null}

      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : projects.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🏗️</div>
          <p style={styles.emptyTitle}>لا توجد مشاريع بعد</p>
          <p style={styles.muted}>اضغط «+ مشروع» لإضافة أول مشروع لعميل.</p>
        </div>
      ) : (
        <div style={styles.projectGrid}>
          {projects.map((p) => {
            const cfg = STATUS_CFG[p.status] || STATUS_CFG.planned;
            return (
              <div key={p.id} style={styles.projectCard} onClick={() => setModal({ edit: p })}>
                <div style={styles.cardTop}>
                  <div>
                    <span style={styles.projNum}>#{p.projectNumber}</span>
                    <span style={styles.projName}>{p.name}</span>
                  </div>
                  <span style={{ ...styles.badge2, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                </div>
                <div style={styles.projCustomer}>🏢 {p.customerName || "—"}</div>
                {(p.typeNames || []).length > 0 ? (
                  <div style={styles.typeTags}>
                    {(p.typeNames || []).map((t, i) => <span key={i} style={styles.typeTag}>{t}</span>)}
                  </div>
                ) : null}
                <div style={styles.projMeta}>
                  {p.city ? <span>📍 {p.city}</span> : null}
                  {p.contractNumber ? <span>📄 {p.contractNumber}</span> : null}
                </div>
                {(p.startDate || p.endDate) ? (
                  <div style={styles.projDates} dir="ltr">{p.startDate || "—"} {p.endDate ? `← ${p.endDate}` : ""}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {modal === "new" ? (
        <ProjectModal customers={customers} types={types} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />
      ) : null}
      {modal && modal.edit ? (
        <ProjectModal project={modal.edit} customers={customers} types={types} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />
      ) : null}
      {modal === "types" ? (
        <TypesModal types={types} onClose={() => setModal(null)} onChanged={loadData} />
      ) : null}
    </div>
  );
}

// ═══════════ مودال المشروع (إنشاء/تعديل) ═══════════
function ProjectModal({ project, customers, types, onClose, onSaved }) {
  const isEdit = !!project;
  const p = project || {};
  const [f, setF] = useState({
    name: p.name || "", customerId: p.customerId || "", typeIds: p.typeIds || [],
    contractNumber: p.contractNumber || "", city: p.city || "", location: p.location || "",
    startDate: p.startDate || "", endDate: p.endDate || "", description: p.description || "",
    status: p.status || "planned",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const toggleType = (id) => setF((prev) => ({ ...prev, typeIds: prev.typeIds.includes(id) ? prev.typeIds.filter((x) => x !== id) : [...prev.typeIds, id] }));

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم المشروع مطلوب."); return; }
    if (!f.customerId) { setErr("اختر العميل."); return; }
    if (f.typeIds.length === 0) { setErr("اختر نوع مشروع واحدًا على الأقل."); return; }
    if (f.startDate && f.endDate && f.endDate < f.startDate) { setErr("تاريخ النهاية قبل البداية."); return; }
    setSaving(true);
    try {
      if (isEdit) {
        const fn = httpsCallable(functions, "updateProject");
        await fn({ projectId: project.id, ...f });
      } else {
        const fn = httpsCallable(functions, "createProject");
        const payload = { ...f };
        delete payload.status; // الإنشاء يبدأ "مخطّط" تلقائيًا
        await fn(payload);
      }
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? `تعديل المشروع #${project.projectNumber}` : "مشروع جديد"} onClose={onClose} wide>
      {err ? <div style={styles.error}>{err}</div> : null}

      <Field label="اسم المشروع *"><input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} disabled={saving} /></Field>
      <Field label="العميل *">
        <select style={styles.input} value={f.customerId} onChange={(e) => set("customerId", e.target.value)} disabled={saving}>
          <option value="">— اختر العميل —</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>

      <label style={styles.label}>نوع المشروع * (يمكن اختيار أكثر من نوع)</label>
      {types.length === 0 ? (
        <div style={styles.noTypes}>لا توجد أنواع. أغلق وافتح «⚙️ أنواع المشاريع» لإنشاء الأنواع الافتراضية.</div>
      ) : (
        <div style={styles.typeGrid}>
          {types.map((t) => (
            <button key={t.id} type="button" onClick={() => toggleType(t.id)} disabled={saving}
              style={{ ...styles.typeBtn, ...(f.typeIds.includes(t.id) ? styles.typeBtnActive : {}) }}>
              {f.typeIds.includes(t.id) ? "✓ " : ""}{t.name}
            </button>
          ))}
        </div>
      )}

      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="رقم العقد"><input style={styles.input} value={f.contractNumber} onChange={(e) => set("contractNumber", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        <div style={{ flex: 1 }}><Field label="المدينة"><input style={styles.input} value={f.city} onChange={(e) => set("city", e.target.value)} disabled={saving} /></Field></div>
      </div>
      <Field label="الموقع التفصيلي"><input style={styles.input} value={f.location} onChange={(e) => set("location", e.target.value)} disabled={saving} /></Field>
      <div style={styles.row}>
        <div style={{ flex: 1 }}><Field label="تاريخ البداية"><input style={styles.input} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
        <div style={{ flex: 1 }}><Field label="تاريخ النهاية"><input style={styles.input} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={saving} dir="ltr" /></Field></div>
      </div>

      {isEdit ? (
        <Field label="الحالة">
          <select style={styles.input} value={f.status} onChange={(e) => set("status", e.target.value)} disabled={saving}>
            {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="الوصف"><textarea style={styles.textarea} value={f.description} onChange={(e) => set("description", e.target.value)} disabled={saving} rows={2} /></Field>

      <div style={styles.modalActions}>
        <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>إلغاء</button>
        <button style={styles.saveBtn} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : isEdit ? "حفظ التعديلات" : "إنشاء المشروع"}</button>
      </div>
    </Modal>
  );
}

// ═══════════ مودال أنواع المشاريع ═══════════
function TypesModal({ types, onClose, onChanged }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  async function seedDefaults() {
    setBusy(true); setError("");
    try {
      const fn = httpsCallable(functions, "seedProjectTypes");
      await fn({});
      onChanged();
    } catch (e) {
      setError(e.message || "تعذّر الإنشاء.");
    } finally {
      setBusy(false);
    }
  }

  async function addType() {
    if (newName.trim().length < 2) { setError("اسم النوع مطلوب."); return; }
    setBusy(true); setError("");
    try {
      const fn = httpsCallable(functions, "createProjectType");
      await fn({ name: newName.trim(), description: newDesc.trim() });
      setNewName(""); setNewDesc("");
      onChanged();
    } catch (e) {
      setError(e.message || "تعذّر الإضافة.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="أنواع المشاريع" onClose={onClose}>
      {error ? <div style={styles.error}>{error}</div> : null}

      {types.length === 0 ? (
        <div style={styles.seedBox}>
          <p style={styles.seedText}>لا توجد أنواع بعد. أنشئ الأنواع الافتراضية الخمسة (تأجير عمالة، نقل كفالة، تأجير معدات، بيع مواد، عقد صيانة).</p>
          <button style={styles.seedBtn} onClick={seedDefaults} disabled={busy}>{busy ? "..." : "🌱 إنشاء الأنواع الافتراضية"}</button>
        </div>
      ) : (
        <div style={styles.typesList}>
          {types.map((t) => (
            <div key={t.id} style={styles.typeRow}>
              <div>
                <span style={styles.typeRowName}>{t.name}</span>
                {t.isSystem ? <span style={styles.sysTag}>افتراضي</span> : null}
                {t.description ? <div style={styles.typeRowDesc}>{t.description}</div> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={styles.addTypeBox}>
        <div style={styles.addTypeTitle}>+ إضافة نوع مخصّص</div>
        <input style={styles.input} placeholder="اسم النوع" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy} />
        <input style={{ ...styles.input, marginTop: 8 }} placeholder="وصف (اختياري)" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} disabled={busy} />
        <button style={{ ...styles.seedBtn, marginTop: 10 }} onClick={addType} disabled={busy}>{busy ? "..." : "إضافة النوع"}</button>
      </div>

      <button style={styles.closeBtnFull} onClick={onClose}>إغلاق</button>
    </Modal>
  );
}

// ═══════════ مكوّنات مشتركة ═══════════
function Modal({ title, children, onClose, wide }) {
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, ...(wide ? styles.modalWide : {}) }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{title}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) { return <div style={styles.field}><label style={styles.label}>{label}</label>{children}</div>; }

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22, flexWrap: "wrap", gap: 12 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#ea580c", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },
  topBtns: { display: "flex", gap: 10 },
  secBtn: { padding: "11px 18px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },
  addBtn: { padding: "11px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  warnBox: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 14, color: "#92400e", marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14, margin: 0 },

  empty: { padding: 48, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },

  projectGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: 16 },
  projectCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px", cursor: "pointer" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 },
  projNum: { display: "inline-block", fontSize: 12, fontWeight: 700, color: "#ea580c", fontFamily: "monospace", marginLeft: 8 },
  projName: { fontSize: 16, fontWeight: 700, color: "#0f172a" },
  badge2: { display: "inline-block", padding: "3px 10px", borderRadius: 14, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" },
  projCustomer: { fontSize: 13, color: "#475569", marginBottom: 10 },
  typeTags: { display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 },
  typeTag: { padding: "2px 10px", background: "#fff7ed", color: "#c2410c", borderRadius: 10, fontSize: 11, fontWeight: 600 },
  projMeta: { display: "flex", gap: 12, fontSize: 12, color: "#94a3b8", flexWrap: "wrap" },
  projDates: { marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", fontSize: 12, color: "#64748b", fontFamily: "monospace" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", padding: 24, direction: "rtl", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif" },
  modalWide: { maxWidth: 600 },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: 800, color: "#0f172a", margin: 0 },
  close: { fontSize: 20, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" },
  field: { display: "flex", flexDirection: "column", marginBottom: 12 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", margin: "0 0 6px" },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, boxSizing: "border-box", fontFamily: "inherit", resize: "vertical" },
  row: { display: "flex", gap: 12 },

  noTypes: { padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 13, color: "#92400e", marginBottom: 12 },
  typeGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 },
  typeBtn: { padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#fff", border: "2px solid #e2e8f0", borderRadius: 8, cursor: "pointer", textAlign: "right" },
  typeBtnActive: { borderColor: "#ea580c", background: "#fff7ed", color: "#c2410c" },

  modalActions: { display: "flex", gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, padding: "11px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  saveBtn: { flex: 2, padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },

  seedBox: { textAlign: "center", padding: "20px 16px", background: "#f8fafc", borderRadius: 10, marginBottom: 16 },
  seedText: { fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 14 },
  seedBtn: { width: "100%", padding: "11px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#ea580c", border: "none", borderRadius: 8, cursor: "pointer" },

  typesList: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 },
  typeRow: { padding: "12px 14px", background: "#f8fafc", borderRadius: 10, border: "1px solid #f1f5f9" },
  typeRowName: { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  sysTag: { display: "inline-block", marginRight: 8, padding: "1px 8px", background: "#eef2ff", color: "#4338ca", borderRadius: 6, fontSize: 11, fontWeight: 600 },
  typeRowDesc: { fontSize: 12, color: "#94a3b8", marginTop: 4 },

  addTypeBox: { background: "#f8fafc", borderRadius: 10, padding: 16, marginBottom: 14 },
  addTypeTitle: { fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 },
  closeBtnFull: { width: "100%", padding: "11px", fontSize: 14, fontWeight: 700, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
};
