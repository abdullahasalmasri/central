import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";
import AssignWorkerModal from "./AssignWorkerModal";
import SharedResourcesTab from "./SharedResourcesTab";

const REQ_STATUS_LABELS = {
  pending: "وارد جديد",
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

export default function OperationsPage({ tenantId, companyName }) {
  const [tab, setTab] = useState("requests");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [filter, setFilter] = useState("active");
  const [viewRequest, setViewRequest] = useState(null);
  const [assignRequest, setAssignRequest] = useState(null);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [reqSnap, projSnap] = await Promise.all([
        getDocs(query(collection(db, "resourceRequests"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "projects"), where("tenantId", "==", tenantId))),
      ]);
      // مشاريع قيد المراجعة المالية تُخفى طلباتها عن العمليات
      const underReview = new Set(
        projSnap.docs.filter((d) => d.data().status === "under_review").map((d) => d.id)
      );
      const list = reqSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((r) => !underReview.has(r.projectId));
      list.sort((a, b) => {
        if (a.priority === "urgent" && b.priority !== "urgent") return -1;
        if (b.priority === "urgent" && a.priority !== "urgent") return 1;
        return (b.requestNumber || 0) - (a.requestNumber || 0);
      });
      setRequests(list);
    } catch (err) {
      setError("تعذّر تحميل الطلبات.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  async function startWork(req) {
    setBusyId(req.id);
    setError("");
    try {
      const fn = httpsCallable(functions, "setRequestStatus");
      await fn({ requestId: req.id, status: "in_progress" });
      await loadData();
    } catch (err) {
      setError(err.message || "تعذّر بدء التنفيذ.");
    } finally {
      setBusyId("");
    }
  }

  const pending = requests.filter((r) => r.status === "pending");
  const inProgress = requests.filter((r) => r.status === "in_progress");
  const fulfilled = requests.filter((r) => r.status === "fulfilled");

  const visible = filter === "active"
    ? requests.filter((r) => r.status === "pending" || r.status === "in_progress")
    : requests;

  return (
    <div>
      <div style={styles.pageHead}>
        <h1 style={styles.pageTitle}>العمليات</h1>
      </div>

      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === "requests" ? styles.tabActive : {}) }} onClick={() => setTab("requests")}>
          📋 طلبات الموارد
        </button>
        <button style={{ ...styles.tab, ...(tab === "shared" ? styles.tabActive : {}) }} onClick={() => setTab("shared")}>
          🧩 الموارد المشتركة
        </button>
      </div>

      {tab === "shared" ? (
        <SharedResourcesTab tenantId={tenantId} companyName={companyName} mode="operations" />
      ) : loading ? (
        <p style={styles.muted}>جارٍ التحميل...</p>
      ) : (
      <>
      <div style={styles.infoBar}>
        🛠️ قسم العمليات يستلم طلبات الموارد من إدارة المشاريع، ويتولّى تنفيذها على أرض الواقع: تحديد العمالة، الإسناد، والمتابعة.
      </div>

      <div style={styles.statsRow}>
        <div style={{ ...styles.statCard, ...styles.statPending }}>
          <span style={styles.statNum}>{pending.length}</span>
          <span style={styles.statLbl}>واردة جديدة</span>
        </div>
        <div style={{ ...styles.statCard, ...styles.statProgress }}>
          <span style={styles.statNum}>{inProgress.length}</span>
          <span style={styles.statLbl}>قيد التنفيذ</span>
        </div>
        <div style={{ ...styles.statCard, ...styles.statDone }}>
          <span style={styles.statNum}>{fulfilled.length}</span>
          <span style={styles.statLbl}>مكتملة</span>
        </div>
      </div>

      <div style={styles.filterRow}>
        <button style={{ ...styles.filterBtn, ...(filter === "active" ? styles.filterActive : {}) }} onClick={() => setFilter("active")}>
          النشطة ({pending.length + inProgress.length})
        </button>
        <button style={{ ...styles.filterBtn, ...(filter === "all" ? styles.filterActive : {}) }} onClick={() => setFilter("all")}>
          الكل ({requests.length})
        </button>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}

      {visible.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>📭</div>
          <p style={styles.muted}>
            {filter === "active" ? "لا توجد طلبات نشطة حاليًا." : "لا توجد طلبات بعد."}
          </p>
        </div>
      ) : (
        <div style={styles.reqList}>
          {visible.map((r) => {
            const sc = REQ_STATUS_COLORS[r.status] || REQ_STATUS_COLORS.pending;
            const fulfilledQty = r.fulfilledQuantity || 0;
            const pct = r.quantity > 0 ? Math.min(100, (fulfilledQty / r.quantity) * 100) : 0;
            return (
              <div key={r.id} style={{ ...styles.reqCard, ...(r.priority === "urgent" && (r.status === "pending" || r.status === "in_progress") ? styles.urgentCard : {}) }}>
                <div style={styles.reqTop}>
                  <div style={styles.reqTitleRow}>
                    <span style={styles.reqNum} dir="ltr">REQ-{r.requestNumber}</span>
                    {r.priority === "urgent" ? <span style={styles.urgentTag}>⚡ عاجل</span> : null}
                    <span style={{ ...styles.statusTag, background: sc.bg, color: sc.fg }}>{REQ_STATUS_LABELS[r.status]}</span>
                  </div>
                  <span style={styles.reqProject}>{r.projectName} (PRJ-{r.projectNumber})</span>
                </div>

                <div style={styles.reqBody}>
                  <div style={styles.reqField}>
                    <span style={styles.reqLabel}>المطلوب</span>
                    <span style={styles.reqValueBig}>{r.quantity} × {r.jobTitleName || "عمالة"}</span>
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
                </div>

                {/* شريط التقدّم */}
                {(r.status === "in_progress" || r.status === "fulfilled") ? (
                  <div style={styles.progressWrap}>
                    <div style={styles.progressInfo}>
                      <span>تم الإسناد: {fulfilledQty} / {r.quantity}</span>
                      <span style={styles.pctText}>{Math.round(pct)}%</span>
                    </div>
                    <div style={styles.progressTrack}>
                      <div style={{ ...styles.progressFill, width: `${pct}%` }} />
                    </div>
                  </div>
                ) : null}

                <div style={styles.reqActions}>
                  <button style={styles.detailBtn} onClick={() => setViewRequest(r)}>التفاصيل</button>

                  {r.status === "pending" ? (
                    <button style={styles.startBtn} onClick={() => startWork(r)} disabled={busyId === r.id}>
                      {busyId === r.id ? "..." : "▶ بدء التنفيذ"}
                    </button>
                  ) : null}

                  {(r.status === "in_progress" || r.status === "fulfilled") ? (
                    <button style={styles.assignBtn} onClick={() => setAssignRequest(r)}>
                      👷 إدارة الإسناد
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewRequest ? (
        <RequestDetail request={viewRequest} onClose={() => setViewRequest(null)} />
      ) : null}

      {assignRequest ? (
        <AssignWorkerModal
          tenantId={tenantId}
          request={assignRequest}
          onClose={() => setAssignRequest(null)}
          onAssigned={loadData}
        />
      ) : null}
      </>
      )}
    </div>
  );
}

// ═══ تفاصيل الطلب ═══
function RequestDetail({ request, onClose }) {
  const sc = REQ_STATUS_COLORS[request.status] || REQ_STATUS_COLORS.pending;
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>REQ-{request.requestNumber}</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.detailHead}>
          <div>
            <h3 style={styles.detailProject}>{request.projectName}</h3>
            <span style={styles.detailProjectNum} dir="ltr">PRJ-{request.projectNumber}</span>
          </div>
          <div style={styles.detailTags}>
            {request.priority === "urgent" ? <span style={styles.urgentTag}>⚡ عاجل</span> : null}
            <span style={{ ...styles.statusTag, background: sc.bg, color: sc.fg }}>{REQ_STATUS_LABELS[request.status]}</span>
          </div>
        </div>

        <div style={styles.detailGrid}>
          <DetailRow label="المهنة المطلوبة" value={request.jobTitleName || "—"} />
          <DetailRow label="الكمية" value={String(request.quantity)} />
          <DetailRow label="الفترة" value={request.shiftName || "—"} />
          <DetailRow label="المدينة" value={request.city || "—"} />
          <DetailRow label="البداية" value={request.startDate || "—"} ltr />
          <DetailRow label="النهاية" value={request.endDate || "مفتوح"} ltr />
          <DetailRow label="تم توفيره" value={`${request.fulfilledQuantity || 0} / ${request.quantity}`} />
          <DetailRow label="النوع" value={request.resourceType === "equipment" ? "معدات" : "عمالة"} />
        </div>

        {request.specifications ? (
          <div style={styles.descBox}>
            <span style={styles.detailLabel}>المواصفات المطلوبة:</span>
            <p style={styles.descText}>{request.specifications}</p>
          </div>
        ) : null}
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

const styles = {
  pageHead: { marginBottom: 20 },
  pageTitle: { margin: 0, fontSize: 24, color: "#ea580c" },

  tabs: { display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid #e2e8f0", flexWrap: "wrap" },
  tab: { padding: "10px 20px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "none", border: "none", borderBottom: "3px solid transparent", marginBottom: -2, cursor: "pointer" },
  tabActive: { color: "#ea580c", borderBottomColor: "#ea580c" },

  infoBar: { padding: "12px 16px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, fontSize: 13, color: "#9a3412", marginBottom: 20, lineHeight: 1.6 },

  statsRow: { display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: 140, padding: 20, borderRadius: 12, display: "flex", flexDirection: "column", gap: 6, border: "1px solid" },
  statPending: { background: "#fffbeb", borderColor: "#fde68a" },
  statProgress: { background: "#eff6ff", borderColor: "#bfdbfe" },
  statDone: { background: "#f0fdf4", borderColor: "#bbf7d0" },
  statNum: { fontSize: 30, fontWeight: 700, color: "#0f172a" },
  statLbl: { fontSize: 13, color: "#64748b" },

  filterRow: { display: "flex", gap: 8, marginBottom: 16 },
  filterBtn: { padding: "8px 18px", fontSize: 14, fontWeight: 600, color: "#64748b", background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer" },
  filterActive: { color: "#fff", background: "#ea580c" },

  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },

  reqList: { display: "flex", flexDirection: "column", gap: 14 },
  reqCard: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 18 },
  urgentCard: { borderColor: "#fca5a5", borderWidth: 2 },
  reqTop: { marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid #f1f5f9" },
  reqTitleRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" },
  reqNum: { fontSize: 13, fontWeight: 700, color: "#ea580c", fontFamily: "monospace" },
  urgentTag: { fontSize: 10, color: "#b91c1c", background: "#fee2e2", padding: "2px 8px", borderRadius: 8, fontWeight: 700 },
  statusTag: { padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600 },
  reqProject: { fontSize: 14, color: "#475569", fontWeight: 600 },
  reqBody: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 14 },
  reqField: { display: "flex", flexDirection: "column", gap: 3 },
  reqLabel: { fontSize: 11, color: "#94a3b8" },
  reqValue: { fontSize: 14, color: "#0f172a", fontWeight: 600 },
  reqValueBig: { fontSize: 16, color: "#ea580c", fontWeight: 700 },

  progressWrap: { marginBottom: 14, padding: "10px 12px", background: "#f8fafc", borderRadius: 8 },
  progressInfo: { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", marginBottom: 6 },
  pctText: { fontWeight: 700, color: "#16a34a" },
  progressTrack: { height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", background: "#16a34a", borderRadius: 3, transition: "width 0.3s" },

  reqActions: { display: "flex", gap: 8, flexWrap: "wrap" },
  detailBtn: { padding: "9px 18px", fontSize: 13, fontWeight: 600, color: "#475569", background: "#f1f5f9", border: "none", borderRadius: 7, cursor: "pointer" },
  startBtn: { padding: "9px 20px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#ea580c", border: "none", borderRadius: 7, cursor: "pointer" },
  assignBtn: { padding: "9px 20px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#7c3aed", border: "none", borderRadius: 7, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 580, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "92vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20, color: "#ea580c" },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 },
  detailProject: { margin: "0 0 4px", fontSize: 18, color: "#0f172a" },
  detailProjectNum: { fontSize: 12, color: "#94a3b8", fontFamily: "monospace" },
  detailTags: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  detailGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 },
  dRow: { display: "flex", flexDirection: "column", gap: 3, padding: "10px 12px", background: "#f8fafc", borderRadius: 8 },
  dLabel: { fontSize: 11, color: "#94a3b8" },
  dValue: { fontSize: 14, color: "#0f172a", fontWeight: 600 },
  detailLabel: { fontSize: 13, fontWeight: 600, color: "#475569" },
  descBox: { padding: 14, background: "#f8fafc", borderRadius: 8, marginBottom: 16 },
  descText: { margin: "6px 0 0", fontSize: 14, color: "#475569", lineHeight: 1.7 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
};