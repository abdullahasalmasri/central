import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./firebase";
import { fetchEmployees, fetchUserDoc } from "./employees";
import AddEmployeeModal from "./AddEmployeeModal";
import ShiftsModal from "./ShiftsModal";
import ScheduleModal from "./ScheduleModal";
import SupervisorAttendance from "./SupervisorAttendance";
import OrgModal from "./OrgModal";
import EscalationsPanel from "./EscalationsPanel";
import ProcurementPage from "./ProcurementPage";
import FinancePage from "./FinancePage";
import ProjectsPage from "./ProjectsPage";
import JobTitlesModal from "./JobTitlesModal";
import OperationsPage from "./OperationsPage";
import AssetsPage from "./AssetsPage";
import WorkerCostModal from "./WorkerCostModal";
import AddWorkerModal from "./AddWorkerModal";

const T = {
  appName: "Central",
  dashboard: "لوحة الموظف",
  logout: "خروج",
  navHome: "الرئيسية",
  groupHR: "الموارد البشرية",
  navEmployees: "الموظفون",
  navWorkers: "العمّال",
  navJobTitles: "المهن",
  navOrg: "الهيكل التنظيمي",
  groupOps: "العمليات الميدانية",
  navAttendance: "حضور الشِفت",
  navShifts: "الشِفتات",
  navSchedules: "الجداول",
  groupOperations: "العمليات",
  navOperations: "تنفيذ الطلبات",
  groupProjects: "المشاريع",
  navProjects: "إدارة المشاريع",
  groupProcurement: "المشتريات",
  navProcurement: "الموردون والأصناف",
  groupFinance: "المالية",
  navFinance: "المحاسبة والتكاليف",
  groupAssets: "الأصول",
  navAssets: "إدارة الأصول",
  navEscalations: "الاعتراضات المعلّقة",
  myPermissions: "صلاحياتي",
  noPermissions: "لا توجد صلاحيات مسندة.",
  staffCount: "الموظفون الإداريون",
  workersCount: "العمّال",
  pendingAlerts: "بحاجة لانتباهك",
  selectSection: "اختر قسمًا من القائمة الجانبية للبدء.",
  adminCostTitle: "التكلفة الإدارية",
  adminCostTotal: "إجمالي التكلفة الإدارية الشهرية",
  adminCostPerWorker: "نصيب العامل الواحد",
  adminWorkersCount: "العمّال النشطون",
  adminStaffCount: "الإداريون",
  recompute: "↻ إعادة حساب",
  recomputing: "جارٍ الحساب...",
  adminCostNote: "التكلفة الإدارية = مجموع تكاليف الموظفين الإداريين والمالك، تُوزّع على العمّال النشطين. تتحدّث تلقائيًا عند أي تغيير في الرواتب أو الأعداد.",
};

export default function StaffDashboard({ user, claims }) {
  const [myPermissions, setMyPermissions] = useState(null);
  const [myName, setMyName] = useState("");
  const [members, setMembers] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [companyName, setCompanyName] = useState("");
  const [adminCost, setAdminCost] = useState(null);
  const [escalationCount, setEscalationCount] = useState(0);
  const [pendingCostCount, setPendingCostCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [recomputing, setRecomputing] = useState(false);

  const [active, setActive] = useState("home");
  const [modal, setModal] = useState(null);

  const tenantId = claims.tenantId;

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const myDoc = await fetchUserDoc(user.uid);
      const perms = myDoc && myDoc.permissions ? myDoc.permissions : [];
      setMyName(myDoc && myDoc.name ? myDoc.name : "");
      setMyPermissions(perms);

      const [list, shiftSnap, escSnap, tenantSnap] = await Promise.all([
        fetchEmployees(tenantId),
        getDocs(query(collection(db, "shifts"), where("tenantId", "==", tenantId))),
        getDocs(query(
          collection(db, "attendanceExceptions"),
          where("currentHandlerUid", "==", user.uid),
          where("status", "==", "objected")
        )),
        getDocs(query(collection(db, "tenants"), where("__name__", "==", tenantId))),
      ]);
      setMembers(list);
      setShifts(shiftSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setEscalationCount(escSnap.size);
      if (!tenantSnap.empty) {
        const td = tenantSnap.docs[0].data();
        setCompanyName(td.name || "");
        setAdminCost({
          adminCostTotal: td.adminCostTotal || 0,
          adminCostPerWorker: td.adminCostPerWorker || 0,
          workersCount: td.workersCount || 0,
          adminStaffCount: td.adminStaffCount || 0,
        });
      }

      if (perms.includes("finance")) {
        const costSnap = await getDocs(query(
          collection(db, "items"),
          where("tenantId", "==", tenantId),
          where("costStatus", "==", "pending_finance")
        ));
        setPendingCostCount(costSnap.size);
      } else {
        setPendingCostCount(0);
      }
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function recomputeAdmin() {
    setRecomputing(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "recomputeAdminCostManual");
      await fn({});
      await loadData();
    } catch (e) {
      setError("تعذّر إعادة حساب التكلفة الإدارية.");
    } finally {
      setRecomputing(false);
    }
  }

  const has = (m) => myPermissions && myPermissions.includes(m);
  const canCreateEmployee = myPermissions && myPermissions.length > 0;
  const canManageShifts = has("attendance");
  const canManageOrg = has("hr");
  const canJobTitles = has("hr");
  const canWorkerCost = has("hr");
  const canProcurement = has("procurement");
  const canFinance = has("finance");
  const canProjects = has("projects");
  const canOperations = has("operations");
  const canAssets = has("assets");

  const staff = members.filter((m) => m.role === "owner" || m.role === "staff");
  const workers = members.filter((m) => m.role === "worker");
  const owner = members.find((m) => m.role === "owner");
  const possibleManagers = staff;

  function closeModal() {
    setModal(null);
    loadData();
  }

  const navGroups = [];

  const hrItems = [];
  if (canCreateEmployee) hrItems.push({ id: "employees", icon: "👥", label: T.navEmployees, kind: "modal" });
  hrItems.push({ id: "workers", icon: "👷", label: T.navWorkers, kind: "modal" });
  if (canJobTitles) hrItems.push({ id: "jobtitles", icon: "🧰", label: T.navJobTitles, kind: "modal" });
  if (canManageOrg) hrItems.push({ id: "org", icon: "🏢", label: T.navOrg, kind: "modal" });
  if (hrItems.length) navGroups.push({ title: T.groupHR, items: hrItems });

  const opsItems = [];
  if (canManageShifts) {
    opsItems.push({ id: "attendance", icon: "✅", label: T.navAttendance, kind: "modal" });
    opsItems.push({ id: "shifts", icon: "⚙️", label: T.navShifts, kind: "modal" });
    opsItems.push({ id: "schedules", icon: "📅", label: T.navSchedules, kind: "modal" });
  }
  if (opsItems.length) navGroups.push({ title: T.groupOps, items: opsItems });

  const operationsItems = [];
  if (canOperations) {
    operationsItems.push({ id: "operations", icon: "🛠️", label: T.navOperations, kind: "page" });
  }
  if (operationsItems.length) navGroups.push({ title: T.groupOperations, items: operationsItems });

  const projItems = [];
  if (canProjects) {
    projItems.push({ id: "projects", icon: "📋", label: T.navProjects, kind: "page" });
  }
  if (projItems.length) navGroups.push({ title: T.groupProjects, items: projItems });

  const procItems = [];
  if (canProcurement) {
    procItems.push({ id: "procurement", icon: "📦", label: T.navProcurement, kind: "page" });
  }
  if (procItems.length) navGroups.push({ title: T.groupProcurement, items: procItems });

  const finItems = [];
  if (canFinance) {
    finItems.push({ id: "finance", icon: "🧮", label: T.navFinance, kind: "page", badge: pendingCostCount });
  }
  if (finItems.length) navGroups.push({ title: T.groupFinance, items: finItems });

  const assetItems = [];
  if (canAssets) {
    assetItems.push({ id: "assets", icon: "🏘️", label: T.navAssets, kind: "page" });
  }
  if (assetItems.length) navGroups.push({ title: T.groupAssets, items: assetItems });

  function handleNav(item) {
    if (item.kind === "page") {
      setActive(item.id);
      setModal(null);
    } else {
      setModal(item.id);
    }
  }

  return (
    <div style={styles.shell}>
      {/* ===== Sidebar ===== */}
      <aside style={styles.sidebar}>
        <div style={styles.brand}>{T.appName}</div>

        <nav style={styles.nav}>
          <button
            style={{ ...styles.navItem, ...(active === "home" ? styles.navItemActive : {}) }}
            onClick={() => { setActive("home"); setModal(null); }}
          >
            <span style={styles.navIcon}>🏠</span>
            <span style={styles.navLabel}>{T.navHome}</span>
          </button>

          {escalationCount > 0 ? (
            <button style={styles.navAlert} onClick={() => setModal("escalations")}>
              <span style={styles.navIcon}>⚠</span>
              <span style={styles.navLabel}>{T.navEscalations}</span>
              <span style={styles.navBadge}>{escalationCount}</span>
            </button>
          ) : null}

          {navGroups.map((group) => (
            <div key={group.title} style={styles.navGroup}>
              <div style={styles.navGroupTitle}>{group.title}</div>
              {group.items.map((item) => {
                const isActive = item.kind === "page" && active === item.id;
                return (
                  <button
                    key={item.id}
                    style={{ ...styles.navItem, ...(isActive ? styles.navItemActive : {}) }}
                    onClick={() => handleNav(item)}
                  >
                    <span style={styles.navIcon}>{item.icon}</span>
                    <span style={styles.navLabel}>{item.label}</span>
                    {item.badge > 0 ? <span style={styles.navBadge}>{item.badge}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <button style={styles.logoutBtn} onClick={() => signOut(auth)}>{T.logout}</button>
      </aside>

      {/* ===== المحتوى الرئيسي ===== */}
      <main style={styles.main}>
        <header style={styles.topbar}>
          <h1 style={styles.topTitle}>{companyName || T.dashboard}</h1>
          <span style={styles.topUser}>{user.email}</span>
        </header>

        <div style={styles.content}>
          {active === "procurement" ? (
            <ProcurementPage tenantId={tenantId} companyName={companyName} />
          ) : active === "finance" ? (
            <FinancePage tenantId={tenantId} companyName={companyName} />
          ) : active === "projects" ? (
            <ProjectsPage tenantId={tenantId} companyName={companyName} />
          ) : active === "operations" ? (
            <OperationsPage tenantId={tenantId} companyName={companyName} />
          ) : active === "assets" ? (
            <AssetsPage tenantId={tenantId} companyName={companyName} />
          ) : (
            <>
              <section style={styles.card}>
                <h2 style={styles.cardTitle}>{T.myPermissions}</h2>
                {loading ? (
                  <p style={styles.muted}>جارٍ التحميل...</p>
                ) : (
                  <div style={styles.badges}>
                    {myPermissions && myPermissions.length > 0 ? (
                      myPermissions.map((p) => (
                        <span key={p} style={styles.badge}>{moduleLabel(p)}</span>
                      ))
                    ) : (
                      <span style={styles.muted}>{T.noPermissions}</span>
                    )}
                  </div>
                )}
              </section>

              {(escalationCount > 0 || (canFinance && pendingCostCount > 0)) ? (
                <section style={styles.card}>
                  <h2 style={styles.cardTitle}>{T.pendingAlerts}</h2>
                  <div style={styles.alertsRow}>
                    {escalationCount > 0 ? (
                      <button style={styles.alertCard} onClick={() => setModal("escalations")}>
                        <span style={styles.alertNum}>{escalationCount}</span>
                        <span style={styles.alertLbl}>اعتراضات معلّقة</span>
                      </button>
                    ) : null}
                    {canFinance && pendingCostCount > 0 ? (
                      <button style={{ ...styles.alertCard, ...styles.alertCardGreen }} onClick={() => { setActive("finance"); }}>
                        <span style={styles.alertNum}>{pendingCostCount}</span>
                        <span style={styles.alertLbl}>تكاليف بانتظارك</span>
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <section style={styles.statsRow}>
                <div style={styles.statCard}>
                  <span style={styles.statNum}>{staff.length}</span>
                  <span style={styles.statLbl}>{T.staffCount}</span>
                </div>
                <div style={styles.statCard}>
                  <span style={styles.statNum}>{workers.length}</span>
                  <span style={styles.statLbl}>{T.workersCount}</span>
                </div>
              </section>

              {canWorkerCost && adminCost ? (
                <section style={styles.card}>
                  <div style={styles.adminCostHead}>
                    <h2 style={styles.cardTitle}>{T.adminCostTitle}</h2>
                    <button style={styles.recomputeBtn} onClick={recomputeAdmin} disabled={recomputing}>
                      {recomputing ? T.recomputing : T.recompute}
                    </button>
                  </div>
                  <div style={styles.adminGrid}>
                    <div style={styles.adminItem}>
                      <span style={styles.adminNum} dir="ltr">{adminCost.adminCostTotal.toLocaleString()} ﷼</span>
                      <span style={styles.adminLbl}>{T.adminCostTotal}</span>
                    </div>
                    <div style={styles.adminItem}>
                      <span style={styles.adminNumOrange} dir="ltr">{adminCost.adminCostPerWorker.toLocaleString()} ﷼</span>
                      <span style={styles.adminLbl}>{T.adminCostPerWorker}</span>
                    </div>
                    <div style={styles.adminItem}>
                      <span style={styles.adminNumSmall} dir="ltr">{adminCost.workersCount}</span>
                      <span style={styles.adminLbl}>{T.adminWorkersCount}</span>
                    </div>
                    <div style={styles.adminItem}>
                      <span style={styles.adminNumSmall} dir="ltr">{adminCost.adminStaffCount}</span>
                      <span style={styles.adminLbl}>{T.adminStaffCount}</span>
                    </div>
                  </div>
                  <p style={styles.adminNote}>{T.adminCostNote}</p>
                </section>
              ) : null}

              {error ? <div style={styles.error}>{error}</div> : null}
              <p style={styles.hint}>{T.selectSection}</p>
            </>
          )}
        </div>
      </main>

      {/* ===== النوافذ المنبثقة ===== */}
      {modal === "employees" ? (
        <EmployeesView staff={staff} members={members} owner={owner} canCreate={canCreateEmployee} canWorkerCost={canWorkerCost} myPermissions={myPermissions} managers={possibleManagers} currentUid={user.uid} currentName={myName} onClose={closeModal} onReload={loadData} />
      ) : null}
      {modal === "workers" ? (
        <WorkersView workers={workers} members={members} tenantId={tenantId} canWorkerCost={canWorkerCost} currentUid={user.uid} currentName={myName} onClose={closeModal} onReload={loadData} />
      ) : null}
      {modal === "jobtitles" ? (
        <JobTitlesModal tenantId={tenantId} onClose={closeModal} />
      ) : null}
      {modal === "org" ? (
        <OrgModal staff={staff} workers={workers} ownerUid={owner ? owner.id : null} ownerName={owner ? owner.name : "المالك"} onClose={closeModal} onUpdated={loadData} />
      ) : null}
      {modal === "attendance" ? (
        <SupervisorAttendance user={user} tenantId={tenantId} shifts={shifts} onClose={closeModal} />
      ) : null}
      {modal === "shifts" ? (
        <ShiftsModal tenantId={tenantId} onClose={closeModal} />
      ) : null}
      {modal === "schedules" ? (
        <ScheduleModal tenantId={tenantId} workers={workers} onClose={closeModal} />
      ) : null}
      {modal === "escalations" ? (
        <EscalationsPanel user={user} onClose={closeModal} />
      ) : null}
    </div>
  );
}

function EmployeesView({ staff, members, owner, canCreate, canWorkerCost, myPermissions, managers, currentUid, currentName, onClose, onReload }) {
  const [showAdd, setShowAdd] = useState(false);
  const [costPerson, setCostPerson] = useState(null);
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{T.navEmployees} ({staff.length})</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        {canCreate ? (
          <button style={styles.addBtnBlue} onClick={() => setShowAdd(true)}>+ إضافة موظف</button>
        ) : null}
        {staff.length === 0 ? (
          <p style={styles.muted}>لا يوجد موظفون.</p>
        ) : (
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>الاسم</th><th style={styles.th}>البريد</th>
              <th style={styles.th}>الدور</th><th style={styles.th}>المدير</th>
              <th style={styles.th}>التكلفة</th>
              {canWorkerCost ? <th style={styles.th}></th> : null}
            </tr></thead>
            <tbody>
              {staff.map((emp) => {
                const hasCost = emp.costBase && emp.costBase.basicSalary > 0;
                return (
                  <tr key={emp.id}>
                    <td style={styles.td}>{emp.name}</td>
                    <td style={styles.td}>{emp.email}</td>
                    <td style={styles.td}>{roleLabel(emp.role)}</td>
                    <td style={styles.td}>{managerName(emp, members, owner)}</td>
                    <td style={styles.td}>
                      {hasCost ? (
                        <span style={styles.costSet}>{(emp.costBase.basicSalary).toLocaleString()} ﷼</span>
                      ) : (
                        <span style={styles.costUnset}>غير محددة</span>
                      )}
                    </td>
                    {canWorkerCost ? (
                      <td style={styles.td}>
                        <button style={styles.costBtn} onClick={() => setCostPerson(emp)}>💰 التكلفة</button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {showAdd ? (
          <AddEmployeeModal
            allowedModules={myPermissions} managers={managers}
            currentUid={currentUid} currentName={currentName} currentIsOwner={false}
            ownerLabel={owner ? `${owner.name} (الإدارة العليا)` : "المالك (الإدارة العليا)"}
            onClose={() => setShowAdd(false)}
            onCreated={() => { setShowAdd(false); onReload(); }}
          />
        ) : null}

        {costPerson ? (
          <WorkerCostModal
            worker={costPerson}
            onClose={() => setCostPerson(null)}
            onSaved={() => { setCostPerson(null); if (onReload) onReload(); }}
          />
        ) : null}
      </div>
    </div>
  );
}

function WorkersView({ workers, members, tenantId, canWorkerCost, currentUid, currentName, onClose, onReload }) {
  const [costWorker, setCostWorker] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>{T.workersCount} ({workers.length})</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>
        <button style={styles.addBtnWorker} onClick={() => setShowAdd(true)}>➕ إضافة عامل</button>
        {workers.length === 0 ? (
          <p style={styles.muted}>لا يوجد عمّال بعد.</p>
        ) : (
          <table style={styles.table}>
            <thead><tr>
              <th style={styles.th}>الاسم</th><th style={styles.th}>المهنة</th><th style={styles.th}>التكلفة</th><th style={styles.th}>الرقم الوظيفي</th>
              {canWorkerCost ? <th style={styles.th}></th> : null}
            </tr></thead>
            <tbody>
              {workers.map((w) => {
                const hasCost = w.costBase && w.costBase.basicSalary > 0;
                return (
                  <tr key={w.id}>
                    <td style={styles.td}>{w.name}</td>
                    <td style={styles.td}>{w.jobTitleName || "—"}</td>
                    <td style={styles.td}>
                      {hasCost ? (
                        <span style={styles.costSet}>{(w.costBase.basicSalary).toLocaleString()} ﷼</span>
                      ) : (
                        <span style={styles.costUnset}>غير محددة</span>
                      )}
                    </td>
                    <td style={styles.td}>{w.employeeNumber || "—"}</td>
                    {canWorkerCost ? (
                      <td style={styles.td}>
                        <button style={styles.costBtn} onClick={() => setCostWorker(w)}>💰 التكلفة</button>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {showAdd ? (
          <AddWorkerModal
            members={members}
            tenantId={tenantId}
            currentUid={currentUid} currentName={currentName} currentIsOwner={false}
            onClose={() => setShowAdd(false)}
            onCreated={() => { setShowAdd(false); if (onReload) onReload(); }}
          />
        ) : null}

        {costWorker ? (
          <WorkerCostModal
            worker={costWorker}
            onClose={() => setCostWorker(null)}
            onSaved={() => { setCostWorker(null); if (onReload) onReload(); }}
          />
        ) : null}
      </div>
    </div>
  );
}

function moduleLabel(m) {
  const map = { hr: "الموارد البشرية", finance: "المالية", attendance: "الحضور والانصراف", reviews: "التقييمات", procurement: "المشتريات", projects: "المشاريع", operations: "العمليات", assets: "الأصول" };
  return map[m] || m;
}
function roleLabel(role) {
  if (role === "owner") return "مالك";
  if (role === "staff") return "موظف";
  if (role === "worker") return "عامل";
  return role;
}
function managerName(emp, members, owner) {
  if (emp.role === "owner") return "—";
  if (!emp.managerUid) return owner ? owner.name : "المالك";
  const mgr = members.find((m) => m.id === emp.managerUid);
  return mgr ? mgr.name : "—";
}

const styles = {
  shell: { display: "flex", minHeight: "100vh", background: "#f1f5f9", fontFamily: "system-ui, sans-serif", direction: "rtl" },
  sidebar: { width: 260, background: "#0f172a", color: "#e2e8f0", display: "flex", flexDirection: "column", padding: "20px 0", position: "sticky", top: 0, height: "100vh", flexShrink: 0 },
  brand: { fontSize: 24, fontWeight: 700, color: "#fff", padding: "0 24px 20px", letterSpacing: "0.5px", borderBottom: "1px solid #1e293b", marginBottom: 12 },
  nav: { flex: 1, overflowY: "auto", padding: "0 12px" },
  navGroup: { marginTop: 18 },
  navGroupTitle: { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", padding: "0 12px 8px" },
  navItem: { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 12px", background: "transparent", border: "none", borderRadius: 8, color: "#cbd5e1", fontSize: 14, fontWeight: 500, cursor: "pointer", textAlign: "right", marginBottom: 2 },
  navItemActive: { background: "#1e293b", color: "#fff", fontWeight: 600 },
  navAlert: { display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "10px 12px", background: "#7f1d1d", border: "none", borderRadius: 8, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "right", marginTop: 8 },
  navIcon: { fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 },
  navLabel: { flex: 1 },
  navBadge: { background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, minWidth: 20, textAlign: "center" },
  logoutBtn: { margin: "12px 24px 0", padding: "10px", fontSize: 14, color: "#fca5a5", background: "transparent", border: "1px solid #334155", borderRadius: 8, cursor: "pointer" },
  main: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 32px", background: "#fff", borderBottom: "1px solid #e2e8f0" },
  topTitle: { margin: 0, fontSize: 19, color: "#0f172a" },
  topUser: { fontSize: 13, color: "#64748b" },
  content: { padding: 32, maxWidth: 1100 },
  card: { padding: 24, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 20 },
  cardTitle: { margin: 0, fontSize: 17, color: "#0f172a" },
  badges: { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 },
  badge: { padding: "6px 14px", fontSize: 13, fontWeight: 600, color: "#0f766e", background: "#ccfbf1", borderRadius: 20 },
  alertsRow: { display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 },
  alertCard: { display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "16px 24px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, cursor: "pointer", minWidth: 130 },
  alertCardGreen: { background: "#f0fdf4", border: "1px solid #bbf7d0" },
  alertNum: { fontSize: 26, fontWeight: 700, color: "#0f172a" },
  alertLbl: { fontSize: 13, color: "#64748b" },
  statsRow: { display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap" },
  statCard: { flex: 1, minWidth: 140, padding: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, display: "flex", flexDirection: "column", gap: 6 },
  statNum: { fontSize: 30, fontWeight: 700, color: "#0f766e" },
  statLbl: { fontSize: 13, color: "#64748b" },
  adminCostHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  recomputeBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#d97706", background: "#fef3c7", border: "none", borderRadius: 8, cursor: "pointer" },
  adminGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 12 },
  adminItem: { display: "flex", flexDirection: "column", gap: 6, padding: "16px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0" },
  adminNum: { fontSize: 23, fontWeight: 700, color: "#0f766e" },
  adminNumOrange: { fontSize: 23, fontWeight: 700, color: "#ea580c" },
  adminNumSmall: { fontSize: 23, fontWeight: 700, color: "#334155" },
  adminLbl: { fontSize: 12, color: "#64748b" },
  adminNote: { fontSize: 12, color: "#64748b", lineHeight: 1.7, margin: 0, padding: "10px 14px", background: "#f0fdfa", borderRadius: 8 },
  hint: { padding: "12px 16px", background: "#eff6ff", color: "#1e40af", borderRadius: 8, fontSize: 14 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 800, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "90vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20 },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  addBtnBlue: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#2563eb", border: "none", borderRadius: 8, cursor: "pointer", marginBottom: 16 },
  addBtnWorker: { padding: "10px 18px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#0f766e", border: "none", borderRadius: 8, cursor: "pointer", marginBottom: 16 },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "12px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  costSet: { color: "#16a34a", fontWeight: 600 },
  costUnset: { color: "#b45309", fontSize: 12, background: "#fef3c7", padding: "2px 8px", borderRadius: 6 },
  costBtn: { padding: "6px 14px", fontSize: 13, fontWeight: 600, color: "#0f766e", background: "#ccfbf1", border: "none", borderRadius: 7, cursor: "pointer" },
};
