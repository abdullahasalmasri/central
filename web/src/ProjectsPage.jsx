import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import { exportToExcel, exportToPDF, datedFileName } from "./exportUtils";

const STATUS_LABELS = {
  planned: "مخطّط",
  active: "نشط",
  on_hold: "متوقّف",
  under_review: "قيد المراجعة",
  completed: "مكتمل",
  cancelled: "ملغى",
};
const STATUS_COLORS = {
  planned: { bg: "#dbeafe", fg: "#1e40af" },
  active: { bg: "#dcfce7", fg: "#166534" },
  on_hold: { bg: "#fef3c7", fg: "#92400e" },
  under_review: { bg: "#ffedd5", fg: "#9a3412" },
  completed: { bg: "#e0e7ff", fg: "#3730a3" },
  cancelled: { bg: "#fee2e2", fg: "#b91c1c" },
};

const REQ_STATUS_LABELS = {
  pending: "بانتظار العمليات",
  in_progress: "قيد التنفيذ",
  fulfilled: "مكتمل",
  cancelled: "ملغى",
};
const REQ_STATUS_COLORS = {
  pending: { bg: "#fef3c7", fg: "#92400e" },
  in_progress: { bg: "#dbeafe", fg: "#1e40af" },
  fulfilled: { bg: "#dcfce7", fg: "#166534" },
  cancelled: { bg: "#fee2e2", fg: "#b91c1c" },
};

export default function ProjectsPage({ tenantId, companyName }) {
  const [tab, setTab] = useState("projects");

  return (
    <div>
      <div style={styles.pageHead}>
        <h1 style={styles.pageTitle}>إدارة المشاريع</h1>
      </div>

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "projects" ? styles.tabActive : {}) }} onClick={() => setTab("projects")}>
          📋 المشاريع
        </button>
        <button style={{ ...styles.tab, ...(tab === "requests" ? styles.tabActive : {}) }} onClick={() => setTab("requests")}>
          📨 طلبات الموارد
        </button>
        <button style={{ ...styles.tab, ...(tab === "profitability" ? styles.tabActive : {}) }} onClick={() => setTab("profitability")}>
          📊 الربحية
        </button>
        <button style={{ ...styles.tab, ...(tab === "types" ? styles.tabActive : {}) }} onClick={() => setTab("types")}>
          🏷️ أنواع المشاريع
        </button>
      </div>

      {tab === "projects" ? (
        <ProjectsTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "requests" ? (
        <RequestsTab tenantId={tenantId} companyName={companyName} />
      ) : tab === "profitability" ? (
        <ProfitabilityTab tenantId={tenantId} companyName={companyName} />
      ) : (
        <TypesTab tenantId={tenantId} />
      )}
    </div>
  );
}

// ═══ تبويب المشاريع ═══
function ProjectsTab({ tenantId, companyName }) {
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editProject, setEditProject] = useState(null);
  const [viewProject, setViewProject] = useState(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [projSnap, custSnap, typeSnap] = await Promise.all([
        getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "customers"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "projectTypes"), where("tenantId", "==", tenantId))),
      ]);
      const projList = projSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      projList.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
      setProjects(projList);
      setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTypes(typeSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.isActive !== false));
    } catch (err) {
      setError("تعذّر تحميل المشاريع.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  const company = companyName || "الشركة";

  function buildRows() {
    return projects.map((p) => ({
      number: `PRJ-${p.projectNumber}`,
      name: p.name,
      customer: p.customerName || "",
      city: p.city || "",
      status: STATUS_LABELS[p.status] || p.status,
      start: p.startDate || "",
      end: p.endDate || "مفتوح",
    }));
  }
  const exportColumns = [
    { key: "number", header: "رقم المشروع" },
    { key: "name", header: "اسم المشروع" },
    { key: "customer", header: "العميل" },
    { key: "city", header: "المدينة" },
    { key: "status", header: "الحالة" },
    { key: "start", header: "البداية" },
    { key: "end", header: "النهاية" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("المشاريع"), sheetName: "المشاريع" });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("المشاريع"), header: { companyName: company, title: "سجل المشاريع", subtitle: "إدارة المشاريع" } });

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  return (
    <div>
      <div style={styles.toolbar}>
        <span style={styles.count}>{projects.length} مشروع</span>
        <div style={styles.toolBtns}>
          {projects.length > 0 ? (
            <>
              <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
              <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
            </>
          ) : null}
          <button style={styles.addBtn} onClick={() => { setEditProject(null); setShowForm(true); }}>+ مشروع جديد</button>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {customers.length === 0 ? (
        <div style={styles.notice}>أضف عميلًا أولًا (من قسم المالية ← العملاء) قبل إنشاء مشروع.</div>
      ) : types.length === 0 ? (
        <div style={styles.notice}>أنشئ أنواع المشاريع أولًا (من تبويب «أنواع المشاريع»).</div>
      ) : null}

      {projects.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📋</div>
          <p style={styles.muted}>لا توجد مشاريع بعد.</p>
        </div>
      ) : (
        <div style={styles.projGrid}>
          {projects.map((p) => {
            const sc = STATUS_COLORS[p.status] || STATUS_COLORS.planned;
            return (
              <div key={p.id} style={styles.projCard}>
                <div style={styles.projTop}>
                  <span style={styles.projNum} dir="ltr">PRJ-{p.projectNumber}</span>
                  <span style={{ ...styles.statusTag, background: sc.bg, color: sc.fg }}>{STATUS_LABELS[p.status]}</span>
                </div>
                <h3 style={styles.projName}>{p.name}</h3>
                <div style={styles.projMeta}>
                  <span>🏢 {p.customerName || "—"}</span>
                  {p.city ? <span>📍 {p.city}</span> : null}
                </div>
                <div style={styles.projTypes}>
                  {(p.typeNames || []).map((tn, i) => <span key={i} style={styles.typeChip}>{tn}</span>)}
                </div>
                <div style={styles.projDates}>
                  <span dir="ltr">{p.startDate || "—"}</span>
                  <span style={styles.dateArrow}>←</span>
                  <span dir="ltr">{p.endDate || "مفتوح"}</span>
                </div>
                <div style={styles.projActions}>
                  <button style={styles.viewBtn} onClick={() => setViewProject(p)}>عرض</button>
                  <button style={styles.editBtn} onClick={() => { setEditProject(p); setShowForm(true); }}>تعديل</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm ? (
        <ProjectForm
          project={editProject}
          customers={customers}
          types={types}
          onClose={() => { setShowForm(false); setEditProject(null); }}
          onSaved={() => { setShowForm(false); setEditProject(null); loadData(); }}
        />
      ) : null}

      {viewProject ? (
        <ProjectDetail project={viewProject} onClose={() => setViewProject(null)} />
      ) : null}
    </div>
  );
}

// ═══ نموذج إنشاء/تعديل مشروع ═══
function ProjectForm({ project, customers, types, onClose, onSaved }) {
  const isEdit = !!project;
  const [f, setF] = useState({
    name: project ? project.name || "" : "",
    customerId: project ? project.customerId || "" : "",
    typeIds: project ? (project.typeIds || []) : [],
    contractNumber: project ? project.contractNumber || "" : "",
    city: project ? project.city || "" : "",
    location: project ? project.location || "" : "",
    startDate: project ? project.startDate || "" : "",
    endDate: project ? project.endDate || "" : "",
    status: project ? project.status || "planned" : "planned",
    description: project ? project.description || "" : "",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  function toggleType(typeId) {
    setF((p) => {
      const has = p.typeIds.includes(typeId);
      return { ...p, typeIds: has ? p.typeIds.filter((t) => t !== typeId) : [...p.typeIds, typeId] };
    });
  }

  async function save() {
    setErr("");
    if (f.name.trim().length < 2) { setErr("اسم المشروع مطلوب."); return; }
    if (!f.customerId) { setErr("اختر العميل."); return; }
    if (f.typeIds.length === 0) { setErr("اختر نوع مشروع واحدًا على الأقل."); return; }
    if (f.startDate && f.endDate && f.endDate < f.startDate) { setErr("تاريخ النهاية يجب أن يكون بعد البداية."); return; }

    setSaving(true);
    try {
      if (isEdit) {
        const fn = httpsCallable(functions, "updateProject");
        await fn({ projectId: project.id, ...f, name: f.name.trim() });
      } else {
        const fn = httpsCallable(functions, "createProject");
        await fn({ ...f, name: f.name.trim() });
      }
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{isEdit ? `تعديل: ${project.name}` : "مشروع جديد"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <label style={styles.label}>اسم المشروع *</label>
        <input style={styles.input} value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="مثال: استقدام عمالة لشركة سعيد" disabled={saving} />

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>العميل *</label>
            <select style={styles.input} value={f.customerId} onChange={(e) => set("customerId", e.target.value)} disabled={saving || isEdit}>
              <option value="">— اختر العميل —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {isEdit ? <span style={styles.hint}>لا يمكن تغيير العميل بعد الإنشاء</span> : null}
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>رقم العقد</label>
            <input style={styles.input} value={f.contractNumber} onChange={(e) => set("contractNumber", e.target.value)} disabled={saving} dir="ltr" />
          </div>
        </div>

        <label style={styles.label}>أنواع المشروع * (يمكن اختيار أكثر من نوع)</label>
        <div style={styles.typesGrid}>
          {types.map((t) => {
            const selected = f.typeIds.includes(t.id);
            return (
              <button key={t.id} type="button" onClick={() => toggleType(t.id)} disabled={saving}
                style={{ ...styles.typeOption, ...(selected ? styles.typeOptionActive : {}) }}>
                {selected ? "✓ " : ""}{t.name}
              </button>
            );
          })}
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>المدينة</label>
            <input style={styles.input} value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="مثال: الرياض" disabled={saving} />
          </div>
          <div style={{ flex: 2 }}>
            <label style={styles.label}>الموقع التفصيلي</label>
            <input style={styles.input} value={f.location} onChange={(e) => set("location", e.target.value)} disabled={saving} />
          </div>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>تاريخ البداية</label>
            <input style={styles.input} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>تاريخ النهاية</label>
            <input style={styles.input} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={saving} dir="ltr" />
            <span style={styles.hint}>اتركه فارغًا للمشاريع المفتوحة</span>
          </div>
        </div>

        {isEdit ? (
          <>
            <label style={styles.label}>حالة المشروع</label>
            <select style={styles.input} value={f.status} onChange={(e) => set("status", e.target.value)} disabled={saving}>
              <option value="planned">مخطّط</option>
              <option value="active">نشط</option>
              <option value="on_hold">متوقّف مؤقتًا</option>
              <option value="completed">مكتمل</option>
              <option value="cancelled">ملغى</option>
            </select>
          </>
        ) : null}

        <label style={styles.label}>وصف / ملاحظات</label>
        <textarea style={styles.textarea} value={f.description} onChange={(e) => set("description", e.target.value)} rows={2} disabled={saving} />

        {err ? <div style={styles.error}>{err}</div> : null}
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : (isEdit ? "حفظ التعديلات" : "إنشاء المشروع")}</button>
      </div>
    </div>
  );
}

// ═══ تفاصيل مشروع ═══
function ProjectDetail({ project, onClose }) {
  const sc = STATUS_COLORS[project.status] || STATUS_COLORS.planned;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>PRJ-{project.projectNumber}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.detailHead}>
          <h3 style={styles.detailName}>{project.name}</h3>
          <span style={{ ...styles.statusTag, background: sc.bg, color: sc.fg }}>{STATUS_LABELS[project.status]}</span>
        </div>

        <div style={styles.detailGrid}>
          <DetailRow label="العميل" value={project.customerName || "—"} />
          <DetailRow label="رقم العقد" value={project.contractNumber || "—"} />
          <DetailRow label="المدينة" value={project.city || "—"} />
          <DetailRow label="الموقع" value={project.location || "—"} />
          <DetailRow label="البداية" value={project.startDate || "—"} ltr />
          <DetailRow label="النهاية" value={project.endDate || "مفتوح"} ltr />
        </div>

        <div style={styles.detailTypes}>
          <span style={styles.detailLabel}>الأنواع:</span>
          <div style={styles.typesRow}>
            {(project.typeNames || []).map((tn, i) => <span key={i} style={styles.typeChip}>{tn}</span>)}
          </div>
        </div>

        {project.description ? (
          <div style={styles.descBox}>
            <span style={styles.detailLabel}>الوصف:</span>
            <p style={styles.descText}>{project.description}</p>
          </div>
        ) : null}

        <div style={styles.futureNote}>
          💡 لمتابعة ربحية هذا المشروع، انتقل إلى تبويب «الربحية».
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, ltr }) {
  return (
    <div style={styles.dRow}>
      <span style={styles.dLabel}>{label}</span>
      <span style={styles.dValue} dir={ltr ? "ltr" : "rtl"}>{value}</span>
    </div>
  );
}

// ═══ تبويب طلبات الموارد ═══
function RequestsTab({ tenantId, companyName }) {
  const [requests, setRequests] = useState([]);
  const [projects, setProjects] = useState([]);
  const [jobTitles, setJobTitles] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editRequest, setEditRequest] = useState(null);
  const [busyId, setBusyId] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [reqSnap, projSnap, jtSnap, shiftSnap] = await Promise.all([
        getDocs(query(collection(db, "resourceRequests"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "jobTitles"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "shifts"), where("tenantId", "==", tenantId))),
      ]);
      const reqList = reqSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      reqList.sort((a, b) => (b.requestNumber || 0) - (a.requestNumber || 0));
      setRequests(reqList);
      const projList = projSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
        .filter((p) => p.status !== "completed" && p.status !== "cancelled");
      setProjects(projList);
      setJobTitles(jtSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((t) => t.isActive !== false));
      setShifts(shiftSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل الطلبات.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  async function cancelRequest(req) {
    if (!confirm(`إلغاء الطلب REQ-${req.requestNumber}؟`)) return;
    setBusyId(req.id);
    setError("");
    try {
      const fn = httpsCallable(functions, "setRequestStatus");
      await fn({ requestId: req.id, status: "cancelled" });
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر الإلغاء.");
    } finally {
      setBusyId("");
    }
  }

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  return (
    <div>
      <div style={styles.infoBar}>
        📨 إدارة المشاريع تطلب الموارد، وإدارة العمليات تنفّذ. كل طلب يُوجَّه لقسم العمليات الذي يتولّى الإسناد والمتابعة.
      </div>

      <div style={styles.toolbar}>
        <span style={styles.count}>{requests.length} طلب</span>
        <button style={styles.addBtn} onClick={() => { setEditRequest(null); setShowForm(true); }} disabled={projects.length === 0}>
          + طلب جديد
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {projects.length === 0 ? (
        <div style={styles.notice}>أنشئ مشروعًا نشطًا أولًا قبل إنشاء طلب موارد.</div>
      ) : null}

      {requests.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📨</div>
          <p style={styles.muted}>لا توجد طلبات بعد.</p>
        </div>
      ) : (
        <div style={styles.reqList}>
          {requests.map((r) => {
            const sc = REQ_STATUS_COLORS[r.status] || REQ_STATUS_COLORS.pending;
            const canEdit = r.status === "pending" || r.status === "in_progress";
            const canCancel = r.status === "pending" || r.status === "in_progress";
            return (
              <div key={r.id} style={styles.reqCard}>
                <div style={styles.reqTop}>
                  <div style={styles.reqTitleRow}>
                    <span style={styles.reqNum} dir="ltr">REQ-{r.requestNumber}</span>
                    {r.priority === "urgent" ? <span style={styles.urgentTag}>عاجل</span> : null}
                    <span style={{ ...styles.statusTag, background: sc.bg, color: sc.fg }}>{REQ_STATUS_LABELS[r.status]}</span>
                  </div>
                  <span style={styles.reqProject}>{r.projectName} (PRJ-{r.projectNumber})</span>
                </div>

                <div style={styles.reqBody}>
                  <div style={styles.reqField}>
                    <span style={styles.reqLabel}>المطلوب</span>
                    <span style={styles.reqValue}>{r.quantity} × {r.jobTitleName || (r.resourceType === "equipment" ? "معدات" : "عمالة")}</span>
                  </div>
                  {r.shiftName ? (
                    <div style={styles.reqField}>
                      <span style={styles.reqLabel}>الفترة</span>
                      <span style={styles.reqValue}>{r.shiftName}</span>
                    </div>
                  ) : null}
                  {r.city ? (
                    <div style={styles.reqField}>
                      <span style={styles.reqLabel}>المدينة</span>
                      <span style={styles.reqValue}>{r.city}</span>
                    </div>
                  ) : null}
                  <div style={styles.reqField}>
                    <span style={styles.reqLabel}>المدة</span>
                    <span style={styles.reqValue} dir="ltr">{r.startDate || "—"} ← {r.endDate || "مفتوح"}</span>
                  </div>
                  <div style={styles.reqField}>
                    <span style={styles.reqLabel}>تم توفيره</span>
                    <span style={styles.reqValue}>{r.fulfilledQuantity || 0} / {r.quantity}</span>
                  </div>
                </div>

                {r.specifications ? (
                  <div style={styles.reqSpecs}>
                    <span style={styles.reqLabel}>المواصفات: </span>{r.specifications}
                  </div>
                ) : null}

                {(canEdit || canCancel) ? (
                  <div style={styles.reqActions}>
                    {canEdit ? (
                      <button style={styles.editBtn} onClick={() => { setEditRequest(r); setShowForm(true); }}>تعديل</button>
                    ) : null}
                    {canCancel ? (
                      <button style={styles.cancelReqBtn} onClick={() => cancelRequest(r)} disabled={busyId === r.id}>
                        {busyId === r.id ? "..." : "إلغاء"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {showForm ? (
        <RequestForm
          request={editRequest}
          projects={projects}
          jobTitles={jobTitles}
          shifts={shifts}
          onClose={() => { setShowForm(false); setEditRequest(null); }}
          onSaved={() => { setShowForm(false); setEditRequest(null); loadData(); }}
        />
      ) : null}
    </div>
  );
}

// ═══ نموذج إنشاء/تعديل طلب ═══
function RequestForm({ request, projects, jobTitles, shifts, onClose, onSaved }) {
  const isEdit = !!request;
  const [f, setF] = useState({
    projectId: request ? request.projectId || "" : "",
    jobTitleId: request ? request.jobTitleId || "" : "",
    quantity: request ? String(request.quantity || "") : "",
    shiftId: request ? request.shiftId || "" : "",
    city: request ? request.city || "" : "",
    specifications: request ? request.specifications || "" : "",
    startDate: request ? request.startDate || "" : "",
    endDate: request ? request.endDate || "" : "",
    priority: request ? request.priority || "normal" : "normal",
  });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setErr("");
    if (!isEdit && !f.projectId) { setErr("اختر المشروع."); return; }
    if (!f.jobTitleId) { setErr("اختر المهنة المطلوبة."); return; }
    const qty = Number(f.quantity);
    if (!Number.isFinite(qty) || qty <= 0) { setErr("الكمية المطلوبة غير صحيحة."); return; }
    if (f.startDate && f.endDate && f.endDate < f.startDate) { setErr("تاريخ النهاية يجب أن يكون بعد البداية."); return; }

    setSaving(true);
    try {
      if (isEdit) {
        const fn = httpsCallable(functions, "updateResourceRequest");
        await fn({
          requestId: request.id,
          quantity: qty,
          shiftId: f.shiftId,
          city: f.city,
          specifications: f.specifications,
          startDate: f.startDate,
          endDate: f.endDate,
          priority: f.priority,
        });
      } else {
        const fn = httpsCallable(functions, "createResourceRequest");
        await fn({
          projectId: f.projectId,
          resourceType: "labor",
          jobTitleId: f.jobTitleId,
          quantity: qty,
          shiftId: f.shiftId,
          city: f.city,
          specifications: f.specifications,
          startDate: f.startDate,
          endDate: f.endDate,
          priority: f.priority,
        });
      }
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{isEdit ? `تعديل الطلب REQ-${request.requestNumber}` : "طلب موارد جديد"}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.formNote}>نوع المورد: <strong>عمالة</strong> (المعدات قريبًا)</div>

        <label style={styles.label}>المشروع *</label>
        <select style={styles.input} value={f.projectId} onChange={(e) => set("projectId", e.target.value)} disabled={saving || isEdit}>
          <option value="">— اختر المشروع —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name} (PRJ-{p.projectNumber})</option>)}
        </select>
        {isEdit ? <span style={styles.hint}>لا يمكن تغيير المشروع بعد الإنشاء</span> : null}

        <div style={styles.row}>
          <div style={{ flex: 2 }}>
            <label style={styles.label}>المهنة المطلوبة *</label>
            <select style={styles.input} value={f.jobTitleId} onChange={(e) => set("jobTitleId", e.target.value)} disabled={saving || isEdit}>
              <option value="">— اختر المهنة —</option>
              {jobTitles.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {isEdit ? <span style={styles.hint}>لتغيير المهنة، أنشئ طلبًا جديدًا</span> : null}
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الكمية *</label>
            <input style={styles.input} type="number" min="1" value={f.quantity} onChange={(e) => set("quantity", e.target.value)} placeholder="500" disabled={saving} dir="ltr" />
          </div>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>الفترة (الشِفت)</label>
            <select style={styles.input} value={f.shiftId} onChange={(e) => set("shiftId", e.target.value)} disabled={saving}>
              <option value="">— بدون تحديد —</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.startTime})</option>)}
            </select>
            {shifts.length === 0 ? <span style={styles.hint}>عرّف الشِفتات من قسم العمليات</span> : null}
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>المدينة</label>
            <input style={styles.input} value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="ترث من المشروع" disabled={saving} />
          </div>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>تاريخ البداية</label>
            <input style={styles.input} type="date" value={f.startDate} onChange={(e) => set("startDate", e.target.value)} disabled={saving} dir="ltr" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>تاريخ النهاية</label>
            <input style={styles.input} type="date" value={f.endDate} onChange={(e) => set("endDate", e.target.value)} disabled={saving} dir="ltr" />
          </div>
        </div>

        <label style={styles.label}>الأولوية</label>
        <div style={styles.priorityRow}>
          <button type="button" onClick={() => set("priority", "normal")} disabled={saving}
            style={{ ...styles.priorityBtn, ...(f.priority === "normal" ? styles.priorityNormalActive : {}) }}>
            عادي
          </button>
          <button type="button" onClick={() => set("priority", "urgent")} disabled={saving}
            style={{ ...styles.priorityBtn, ...(f.priority === "urgent" ? styles.priorityUrgentActive : {}) }}>
            عاجل
          </button>
        </div>

        <label style={styles.label}>المواصفات الإضافية</label>
        <textarea style={styles.textarea} value={f.specifications} onChange={(e) => set("specifications", e.target.value)} rows={3}
          placeholder="مثال: خبرة لا تقل عن سنتين، يجيد التعامل مع المعدات الثقيلة، يفضّل من لديه رخصة قيادة..." disabled={saving} />

        {err ? <div style={styles.error}>{err}</div> : null}
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : (isEdit ? "حفظ التعديلات" : "إرسال الطلب للعمليات")}</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// ═══ تبويب الربحية ═══
// ═══════════════════════════════════════════════════════
function ProfitabilityTab({ tenantId, companyName }) {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState("");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [error, setError] = useState("");
  const [editLine, setEditLine] = useState(null);

  useEffect(() => {
    (async () => {
      setLoadingProjects(true);
      try {
        const snap = await getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId)));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.projectNumber || 0) - (a.projectNumber || 0));
        setProjects(list);
      } catch (e) {
        setError("تعذّر تحميل المشاريع.");
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, []);

  async function compute() {
    setError("");
    if (!projectId) { setError("اختر المشروع."); return; }
    if (!/^\d{4}-\d{2}$/.test(month)) { setError("اختر الشهر."); return; }
    setLoading(true);
    setResult(null);
    try {
      const fn = httpsCallable(functions, "getProjectProfitability");
      const res = await fn({ projectId, month });
      setResult(res.data);
    } catch (e) {
      setError(e.message || "تعذّر حساب الربحية.");
    } finally {
      setLoading(false);
    }
  }

  const r = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString();
  const profitColor = (v) => (Number(v) >= 0 ? "#16a34a" : "#dc2626");

  return (
    <div>
      <div style={styles.infoBar}>
        📊 ربحية المشروع = إجمالي إيرادات تأجير العمّال − تكلفتهم الشاملة، بعد احتساب الغياب. خصم العميل وخصم العامل يُقرآن من الحضور تلقائيًا، ويمكن تعديلهما يدويًا لكل عامل.
      </div>

      <div style={styles.profControls}>
        <div style={{ flex: 2, minWidth: 200 }}>
          <label style={styles.label}>المشروع</label>
          <select style={styles.input} value={projectId} onChange={(e) => { setProjectId(e.target.value); setResult(null); }} disabled={loadingProjects}>
            <option value="">— اختر المشروع —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name} (PRJ-{p.projectNumber})</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label style={styles.label}>الشهر</label>
          <input style={styles.input} type="month" value={month} onChange={(e) => { setMonth(e.target.value); setResult(null); }} dir="ltr" />
        </div>
        <button style={styles.computeBtn} onClick={compute} disabled={loading || !projectId}>
          {loading ? "جارٍ الحساب..." : "احسب الربحية"}
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {result ? (
        <ProfitabilityResult result={result} onEditLine={setEditLine} rFn={r} profitColor={profitColor} />
      ) : !loading ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📊</div>
          <p style={styles.muted}>اختر مشروعًا وشهرًا ثم اضغط «احسب الربحية».</p>
        </div>
      ) : null}

      {editLine ? (
        <DeductionEditor
          line={editLine}
          month={result.month}
          onClose={() => setEditLine(null)}
          onSaved={() => { setEditLine(null); compute(); }}
        />
      ) : null}
    </div>
  );
}

// عرض نتيجة الربحية
function ProfitabilityResult({ result, onEditLine, rFn, profitColor }) {
  const r = rFn;
  const t = result.totals;
  const validLines = result.lines.filter((l) => !l.missingCost);
  const missingLines = result.lines.filter((l) => l.missingCost);

  return (
    <div>
      <div style={styles.profSummary}>
        <div style={styles.profSumHead}>
          <div>
            <h3 style={styles.profSumTitle}>{result.projectName}</h3>
            <span style={styles.profSumSub} dir="ltr">PRJ-{result.projectNumber} · {result.month}</span>
          </div>
          <div style={styles.profSumMargin}>
            <span style={{ ...styles.profMarginVal, color: profitColor(t.profit) }} dir="ltr">{r(t.margin)}%</span>
            <span style={styles.profMarginLbl}>هامش الربح</span>
          </div>
        </div>

        <div style={styles.profSumGrid}>
          <div style={styles.profSumItem}>
            <span style={styles.profSumLbl}>الإيراد الإجمالي</span>
            <span style={styles.profSumNum} dir="ltr">{r(t.revenue)} ﷼</span>
          </div>
          <div style={styles.profSumItem}>
            <span style={styles.profSumLbl}>صافي الإيراد (بعد خصم العميل)</span>
            <span style={styles.profSumNum} dir="ltr">{r(t.netRevenue)} ﷼</span>
          </div>
          <div style={styles.profSumItem}>
            <span style={styles.profSumLbl}>التكلفة الفعلية</span>
            <span style={styles.profSumNumRed} dir="ltr">{r(t.cost)} ﷼</span>
          </div>
          <div style={styles.profSumItem}>
            <span style={styles.profSumLbl}>صافي الربح</span>
            <span style={{ ...styles.profSumNumBig, color: profitColor(t.profit) }} dir="ltr">{r(t.profit)} ﷼</span>
          </div>
        </div>

        <div style={styles.profSumMeta}>
          <span>عدد العمّال المُحتسبين: {result.workersCount}</span>
          <span>نصيب الإدارة لكل عامل: {r(result.adminCostPerWorker)} ﷼</span>
        </div>
      </div>

      {missingLines.length > 0 ? (
        <div style={styles.notice}>
          ⚠️ {missingLines.length} عامل بلا تكلفة محددة (لم يُحتسبوا): {missingLines.map((l) => l.workerName).join("، ")}. حدّد تكلفتهم من الموارد البشرية.
        </div>
      ) : null}

      {validLines.length === 0 ? (
        <div style={styles.empty}>
          <p style={styles.muted}>لا يوجد عمّال مُسنَدون لهذا المشروع في هذا الشهر.</p>
        </div>
      ) : (
        <div style={styles.profTableWrap}>
          <table style={styles.profTable}>
            <thead>
              <tr>
                <th style={styles.pth}>العامل</th>
                <th style={styles.pth}>الإيراد</th>
                <th style={styles.pth}>غياب</th>
                <th style={styles.pth}>خصم العميل</th>
                <th style={styles.pth}>خصم العامل</th>
                <th style={styles.pth}>صافي الإيراد</th>
                <th style={styles.pth}>التكلفة</th>
                <th style={styles.pth}>الربح</th>
                <th style={styles.pth}>الهامش</th>
                <th style={styles.pth}></th>
              </tr>
            </thead>
            <tbody>
              {validLines.map((l) => (
                <tr key={l.assignmentId}>
                  <td style={styles.ptd}>
                    <div style={styles.pWorker}>{l.workerName}</div>
                    {l.workerJobTitle ? <div style={styles.pJob}>{l.workerJobTitle}</div> : null}
                  </td>
                  <td style={styles.ptd} dir="ltr">
                    {r(l.revenueProrated)}
                    {l.prorationRatio < 1 ? <span style={styles.proratedTag}>{l.overlapDays}/{l.daysInMonth} ي</span> : null}
                  </td>
                  <td style={styles.ptd}>
                    <span style={l.actualAbsenceDays > 0 ? styles.absTag : styles.absZero}>{l.actualAbsenceDays}</span>
                  </td>
                  <td style={styles.ptd} dir="ltr">{l.clientDeductionDays} ي</td>
                  <td style={styles.ptd} dir="ltr">{l.workerDeductionDays} ي</td>
                  <td style={styles.ptd} dir="ltr">{r(l.netRevenue)}</td>
                  <td style={styles.ptdRed} dir="ltr">{r(l.actualCost)}</td>
                  <td style={{ ...styles.ptd, color: profitColor(l.profit), fontWeight: 700 }} dir="ltr">{r(l.profit)}</td>
                  <td style={{ ...styles.ptd, color: profitColor(l.profit) }} dir="ltr">{r(l.margin)}%</td>
                  <td style={styles.ptd}>
                    <button style={styles.editDedBtn} onClick={() => onEditLine(l)}>تعديل</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={styles.profHint}>
        💡 «الإيراد» هو سعر التأجير الشهري. «التكلفة» تشمل الراتب والبدلات والتكاليف الحكومية والتأمينات ونصيب الإدارة. الغياب يُخصم من المتغيّر فقط (الثابت يبقى).
      </div>
    </div>
  );
}

// محرّر الخصومات
function DeductionEditor({ line, month, onClose, onSaved }) {
  const [clientDays, setClientDays] = useState(String(line.clientDeductionDays || 0));
  const [workerDays, setWorkerDays] = useState(String(line.workerDeductionDays || 0));
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const clientDailyRate = line.clientDailyRate || 0;
  const variableDailyCost = line.variableDailyCost || 0;
  const cDays = Number(clientDays) || 0;
  const wDays = Number(workerDays) || 0;
  const clientDeduction = cDays * clientDailyRate;
  const workerSaving = wDays * variableDailyCost;
  const netRevenue = line.revenueProrated - clientDeduction;
  const actualVariable = Math.max(0, line.variableProrated - workerSaving);
  const actualCost = line.fixedProrated + actualVariable;
  const profit = netRevenue - actualCost;
  const r = (n) => (Math.round((Number(n) || 0) * 100) / 100).toLocaleString();
  const profitColor = profit >= 0 ? "#16a34a" : "#dc2626";
  const isPartial = (line.prorationRatio || 1) < 1;

  async function save() {
    setErr("");
    if (cDays < 0 || cDays > 31) { setErr("أيام خصم العميل غير صحيحة (0-31)."); return; }
    if (wDays < 0 || wDays > 31) { setErr("أيام خصم العامل غير صحيحة (0-31)."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "saveMonthlyDeduction");
      await fn({
        assignmentId: line.assignmentId,
        month: month,
        clientDeductionDays: cDays,
        workerDeductionDays: wDays,
        notes: notes,
      });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalSmall} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>تعديل خصومات: {line.workerName}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.dedInfo}>
          {isPartial ? (
            <div style={styles.dedInfoRow}><span>أيام الإسناد في الشهر (تناسب)</span><strong dir="ltr">{line.overlapDays}/{line.daysInMonth} يوم</strong></div>
          ) : null}
          <div style={styles.dedInfoRow}><span>الغياب الفعلي من الحضور</span><strong dir="ltr">{line.actualAbsenceDays} يوم</strong></div>
          <div style={styles.dedInfoRow}><span>سعر اليوم للعميل</span><strong dir="ltr">{r(clientDailyRate)} ﷼</strong></div>
          <div style={styles.dedInfoRow}><span>تكلفة اليوم المتغيرة</span><strong dir="ltr">{r(variableDailyCost)} ﷼</strong></div>
        </div>

        <div style={styles.dedNote}>
          خصم العميل ينقص الإيراد. خصم العامل ينقص الراتب المتغيّر فقط (التكاليف الثابتة لا تتأثر بالغياب).
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>أيام خصم العميل</label>
            <input style={styles.input} type="number" min="0" max="31" value={clientDays} onChange={(e) => setClientDays(e.target.value)} disabled={saving} dir="ltr" />
            <span style={styles.hint}>يُخصم من فاتورة العميل</span>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>أيام خصم العامل</label>
            <input style={styles.input} type="number" min="0" max="31" value={workerDays} onChange={(e) => setWorkerDays(e.target.value)} disabled={saving} dir="ltr" />
            <span style={styles.hint}>يُخصم من راتب العامل</span>
          </div>
        </div>

        <label style={styles.label}>ملاحظات (اختياري)</label>
        <input style={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="سبب الخصم أو التحمّل..." disabled={saving} />

        <div style={styles.dedPreview}>
          <div style={styles.dedPrevRow}><span>خصم العميل</span><span dir="ltr">− {r(clientDeduction)} ﷼</span></div>
          <div style={styles.dedPrevRow}><span>صافي الإيراد</span><span dir="ltr">{r(netRevenue)} ﷼</span></div>
          <div style={styles.dedPrevRow}><span>توفير راتب الغياب</span><span dir="ltr">− {r(workerSaving)} ﷼</span></div>
          <div style={styles.dedPrevRow}><span>التكلفة الفعلية</span><span dir="ltr">{r(actualCost)} ﷼</span></div>
          <div style={styles.dedPrevTotal}>
            <span>الربح بعد التعديل</span>
            <span style={{ color: profitColor }} dir="ltr">{r(profit)} ﷼</span>
          </div>
        </div>

        {err ? <div style={styles.error}>{err}</div> : null}
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ الخصومات"}</button>
      </div>
    </div>
  );
}

// ═══ تبويب الأنواع ═══
function TypesTab({ tenantId }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [seeding, setSeeding] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "projectTypes"), where("tenantId", "==", tenantId)));
      setTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      setError("تعذّر تحميل الأنواع.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  async function handleSeed() {
    setSeeding(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "seedProjectTypes");
      await fn({});
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر إنشاء الأنواع الافتراضية.");
    } finally {
      setSeeding(false);
    }
  }

  async function addType() {
    setError("");
    if (name.trim().length < 2) { setError("اسم النوع مطلوب."); return; }
    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createProjectType");
      await fn({ name: name.trim(), description: description.trim() });
      setName(""); setDescription(""); setShowAdd(false);
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر الإضافة.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  if (types.length === 0) {
    return (
      <>
        {error ? <div style={styles.error}>{error}</div> : null}
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>🏷️</div>
          <h3 style={styles.emptyTitle}>لم تُنشأ أنواع المشاريع بعد</h3>
          <p style={styles.emptyDesc}>ابدأ بخمسة أنواع افتراضية (تأجير عمالة، نقل كفالة، تأجير معدات، بيع، صيانة)، ثم أضف حسب نشاطك.</p>
          <button style={styles.seedBtn} onClick={handleSeed} disabled={seeding}>
            {seeding ? "جارٍ الإنشاء..." : "🚀 إنشاء الأنواع الافتراضية"}
          </button>
        </div>
      </>
    );
  }

  return (
    <div>
      <div style={styles.toolbar}>
        <span style={styles.count}>{types.length} نوع</span>
        <button style={styles.addBtn} onClick={() => setShowAdd(!showAdd)}>+ إضافة نوع</button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {showAdd ? (
        <div style={styles.addBox}>
          <div style={styles.row}>
            <div style={{ flex: 1 }}>
              <label style={styles.label}>اسم النوع *</label>
              <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: تشغيل وصيانة" disabled={saving} />
            </div>
            <div style={{ flex: 2 }}>
              <label style={styles.label}>الوصف</label>
              <input style={styles.input} value={description} onChange={(e) => setDescription(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div style={styles.addActions}>
            <button style={styles.confirmBtn} onClick={addType} disabled={saving}>{saving ? "..." : "حفظ"}</button>
            <button style={styles.cancelBtn} onClick={() => { setShowAdd(false); setName(""); setDescription(""); }} disabled={saving}>إلغاء</button>
          </div>
        </div>
      ) : null}

      <div style={styles.typesList}>
        {types.map((t) => (
          <div key={t.id} style={styles.typeCard}>
            <div>
              <strong style={styles.typeName}>{t.name}</strong>
              {t.isSystem ? <span style={styles.sysTag}>أساسي</span> : null}
              {t.description ? <div style={styles.typeDesc}>{t.description}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const styles = {
  pageHead: { marginBottom: 20 },
  pageTitle: { margin: 0, fontSize: 24, color: "#7c3aed" },
  tabs: { display: "flex", gap: 8, marginBottom: 20, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "12px 20px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "transparent", border: "none", borderBottom: "3px solid transparent", cursor: "pointer", marginBottom: "-2px" },
  tabActive: { color: "#7c3aed", borderBottomColor: "#7c3aed" },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  count: { fontSize: 14, color: "#64748b", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },

  infoBar: { padding: "12px 16px", background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 8, fontSize: 13, color: "#6b21a8", marginBottom: 16, lineHeight: 1.6 },
  notice: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fcd97e", borderRadius: 8, fontSize: 14, color: "#92400e", marginBottom: 16 },
  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { margin: "0 0 10px", fontSize: 18, color: "#0f172a" },
  emptyDesc: { margin: "0 auto 22px", fontSize: 14, color: "#64748b", maxWidth: 440, lineHeight: 1.7 },
  seedBtn: { padding: "13px 26px", fontSize: 15, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 10, cursor: "pointer" },

  projGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 },
  projCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 },
  projTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  projNum: { fontSize: 12, fontWeight: 700, color: "#7c3aed", fontFamily: "monospace" },
  statusTag: { padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600 },
  projName: { margin: "0 0 10px", fontSize: 16, color: "#0f172a" },
  projMeta: { display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: "#64748b", marginBottom: 10 },
  projTypes: { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  typeChip: { fontSize: 11, color: "#7c3aed", background: "#f3e8ff", padding: "2px 9px", borderRadius: 10, fontWeight: 600 },
  projDates: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#94a3b8", marginBottom: 14, fontFamily: "monospace" },
  dateArrow: { color: "#cbd5e1" },
  projActions: { display: "flex", gap: 8 },
  viewBtn: { flex: 1, padding: "8px", fontSize: 13, fontWeight: 600, color: "#7c3aed", background: "#f3e8ff", border: "none", borderRadius: 7, cursor: "pointer" },
  editBtn: { flex: 1, padding: "8px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },

  reqList: { display: "flex", flexDirection: "column", gap: 14 },
  reqCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 },
  reqTop: { marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid #f1f5f9" },
  reqTitleRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
  reqNum: { fontSize: 13, fontWeight: 700, color: "#7c3aed", fontFamily: "monospace" },
  urgentTag: { fontSize: 10, color: "#b91c1c", background: "#fee2e2", padding: "2px 8px", borderRadius: 8, fontWeight: 700 },
  reqProject: { fontSize: 14, color: "#475569", fontWeight: 600 },
  reqBody: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 12 },
  reqField: { display: "flex", flexDirection: "column", gap: 3 },
  reqLabel: { fontSize: 11, color: "#94a3b8" },
  reqValue: { fontSize: 14, color: "#0f172a", fontWeight: 600 },
  reqSpecs: { padding: "10px 12px", background: "#f8fafc", borderRadius: 8, fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 12 },
  reqActions: { display: "flex", gap: 8 },
  cancelReqBtn: { padding: "8px 18px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 7, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 600, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "92vh", overflowY: "auto" },
  modalSmall: { width: "100%", maxWidth: 480, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "92vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  formNote: { padding: "8px 14px", background: "#f3e8ff", borderRadius: 8, fontSize: 13, color: "#6b21a8", marginBottom: 16 },
  label: { display: "block", margin: "12px 0 6px", fontSize: 13, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  textarea: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff", resize: "vertical", fontFamily: "inherit" },
  hint: { display: "block", fontSize: 11, color: "#94a3b8", marginTop: 4 },
  row: { display: "flex", gap: 12 },
  typesGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
  typeOption: { padding: "8px 14px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff", color: "#475569" },
  typeOptionActive: { background: "#7c3aed", color: "#fff", borderColor: "#7c3aed" },
  priorityRow: { display: "flex", gap: 8 },
  priorityBtn: { flex: 1, padding: "10px", fontSize: 14, fontWeight: 600, borderRadius: 8, cursor: "pointer", border: "1px solid #cbd5e1", background: "#fff", color: "#475569" },
  priorityNormalActive: { background: "#0f766e", color: "#fff", borderColor: "#0f766e" },
  priorityUrgentActive: { background: "#dc2626", color: "#fff", borderColor: "#dc2626" },
  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer" },

  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 },
  detailName: { margin: 0, fontSize: 18, color: "#0f172a" },
  detailGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 },
  dRow: { display: "flex", flexDirection: "column", gap: 3, padding: "10px 12px", background: "#f8fafc", borderRadius: 8 },
  dLabel: { fontSize: 11, color: "#94a3b8" },
  dValue: { fontSize: 14, color: "#0f172a", fontWeight: 600 },
  detailTypes: { marginBottom: 16 },
  detailLabel: { fontSize: 13, fontWeight: 600, color: "#475569" },
  typesRow: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
  descBox: { padding: 14, background: "#f8fafc", borderRadius: 8, marginBottom: 16 },
  descText: { margin: "6px 0 0", fontSize: 14, color: "#475569", lineHeight: 1.6 },
  futureNote: { padding: "10px 14px", background: "#faf5ff", borderRadius: 8, fontSize: 13, color: "#7c3aed", textAlign: "center", fontWeight: 600 },

  addBox: { padding: 16, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10, marginBottom: 16 },
  addActions: { display: "flex", gap: 8, marginTop: 12 },
  confirmBtn: { padding: "9px 20px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 7, cursor: "pointer" },
  cancelBtn: { padding: "9px 18px", fontSize: 14, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  typesList: { display: "flex", flexDirection: "column", gap: 10 },
  typeCard: { padding: "14px 18px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10 },
  typeName: { fontSize: 15, color: "#0f172a" },
  typeDesc: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  sysTag: { marginRight: 8, fontSize: 10, color: "#7c3aed", background: "#f3e8ff", padding: "1px 7px", borderRadius: 8, fontWeight: 600 },

  // ═══ الربحية ═══
  profControls: { display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 16, flexWrap: "wrap", padding: 16, background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 10 },
  computeBtn: { padding: "10px 24px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 8, cursor: "pointer", height: 42 },
  profSummary: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, marginBottom: 16 },
  profSumHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, paddingBottom: 16, borderBottom: "1px solid #f1f5f9", flexWrap: "wrap", gap: 12 },
  profSumTitle: { margin: 0, fontSize: 18, color: "#0f172a" },
  profSumSub: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  profSumMargin: { display: "flex", flexDirection: "column", alignItems: "center" },
  profMarginVal: { fontSize: 28, fontWeight: 700 },
  profMarginLbl: { fontSize: 11, color: "#94a3b8" },
  profSumGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 },
  profSumItem: { display: "flex", flexDirection: "column", gap: 5, padding: "12px 14px", background: "#f8fafc", borderRadius: 8 },
  profSumLbl: { fontSize: 12, color: "#64748b" },
  profSumNum: { fontSize: 18, fontWeight: 700, color: "#0f172a" },
  profSumNumRed: { fontSize: 18, fontWeight: 700, color: "#dc2626" },
  profSumNumBig: { fontSize: 22, fontWeight: 700 },
  profSumMeta: { display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, fontSize: 12, color: "#94a3b8", paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  profTableWrap: { overflowX: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 4, marginBottom: 12 },
  profTable: { width: "100%", borderCollapse: "collapse", minWidth: 780 },
  pth: { textAlign: "right", padding: "10px 10px", fontSize: 12, color: "#64748b", borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap" },
  ptd: { padding: "10px", fontSize: 13, color: "#0f172a", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" },
  ptdRed: { padding: "10px", fontSize: 13, color: "#dc2626", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" },
  pWorker: { fontWeight: 600, fontSize: 13 },
  pJob: { fontSize: 11, color: "#94a3b8" },
  absTag: { background: "#fee2e2", color: "#b91c1c", padding: "2px 8px", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  absZero: { color: "#cbd5e1", fontSize: 13 },
  proratedTag: { display: "inline-block", marginRight: 6, fontSize: 10, color: "#7c3aed", background: "#f3e8ff", padding: "1px 6px", borderRadius: 6, fontWeight: 600 },
  editDedBtn: { padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#7c3aed", background: "#f3e8ff", border: "none", borderRadius: 6, cursor: "pointer" },
  profHint: { padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 12, color: "#64748b", lineHeight: 1.6 },
  dedInfo: { display: "flex", flexDirection: "column", gap: 6, padding: 14, background: "#f8fafc", borderRadius: 8, marginBottom: 12 },
  dedInfoRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569" },
  dedNote: { padding: "10px 12px", background: "#faf5ff", borderRadius: 8, fontSize: 12, color: "#6b21a8", marginBottom: 14, lineHeight: 1.6 },
  dedPreview: { marginTop: 16, padding: 14, background: "#f8fafc", borderRadius: 10 },
  dedPrevRow: { display: "flex", justifyContent: "space-between", fontSize: 13, color: "#475569", padding: "5px 0" },
  dedPrevTotal: { display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#0f172a", padding: "10px 0 0", marginTop: 6, borderTop: "1px solid #e2e8f0" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16, marginTop: 8 },
  muted: { color: "#94a3b8", fontSize: 14 },
};
