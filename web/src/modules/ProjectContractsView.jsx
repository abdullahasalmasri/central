import { useState, useEffect, useMemo } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../firebase";

/* ============================================================
   عقود المشاريع — المرحلة ٦ (الأخيرة) من دورة العقود
   إصدار عقد من مشروع معتمد نهائيًا، بمحتوى تلقائي:
   بيانات الشركة + العميل + التمهيد + جدول العمالة. مع عرض وطباعة.
   ============================================================ */

const fmt = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const genderLabel = (g) => (g === "male" ? "ذكر" : g === "female" ? "أنثى" : "—");

export default function ProjectContractsView() {
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [contractSearch, setContractSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const [issueFor, setIssueFor] = useState(null); // مشروع يُصدر له عقد
  const [cName, setCName] = useState("");
  const [cStart, setCStart] = useState("");
  const [cEnd, setCEnd] = useState("");
  const [viewContract, setViewContract] = useState(null); // عقد معروض
  const [templates, setTemplates] = useState([]);
  const [cTemplate, setCTemplate] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try {
      const [pr, cr] = await Promise.all([
        httpsCallable(functions, "getProjectsForContract")({}),
        httpsCallable(functions, "getContracts")({}),
      ]);
      setProjects((pr.data && pr.data.projects) || []);
      const all = (cr.data && cr.data.contracts) || [];
      setContracts(all.filter((c) => c.projectId)); // عقود المشاريع فقط
      // القوالب (اختياري — قد لا تكون للمستخدم صلاحية)
      try {
        const tr = await httpsCallable(functions, "getContractTemplates")({});
        setTemplates((tr.data && tr.data.templates) || []);
      } catch (_) { setTemplates([]); }
    } catch (e) {
      setError(e.message || "تعذّر التحميل.");
    } finally { setLoading(false); }
  }

  async function issueContract() {
    if (!issueFor) return;
    setBusy(issueFor.id); setError(""); setMsg("");
    try {
      const res = await httpsCallable(functions, "createContractFromProject")({
        projectId: issueFor.id, name: cName.trim(), startDate: cStart, endDate: cEnd,
        templateId: cTemplate || undefined,
      });
      setMsg(`صدر العقد رقم ${res.data.contractNumber}.`);
      setIssueFor(null); setCName(""); setCStart(""); setCEnd("");
      await load();
      // افتح العرض مباشرة
      openContract(res.data.id);
    } catch (e) {
      setError(e.message || "تعذّر إصدار العقد.");
    } finally { setBusy(""); }
  }

  async function openContract(contractId) {
    setError("");
    try {
      const res = await httpsCallable(functions, "getContractDetail")({ contractId });
      setViewContract(res.data.contract);
    } catch (e) {
      setError(e.message || "تعذّر فتح العقد.");
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={styles.pageTitle}>عقود المشاريع</h1>
          <p style={styles.pageSub}>إصدار عقود توريد العمالة من المشاريع المعتمدة نهائيًا، بمحتوى تلقائي.</p>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {msg ? <div style={styles.success}>{msg}</div> : null}

      {/* مشاريع جاهزة للعقد */}
      <div style={styles.sectionTitle}>🟢 مشاريع جاهزة لإصدار عقد</div>
      {loading ? <p style={styles.muted}>جارٍ التحميل...</p> : projects.length === 0 ? (
        <div style={styles.emptyBox}>لا توجد مشاريع معتمدة بانتظار عقد.</div>
      ) : (
        <div style={styles.list}>
          {projects.map((p) => (
            <div key={p.id} style={styles.card}>
              <div style={styles.cardMain}>
                <div style={styles.cardHead}>
                  <span style={styles.projNum}>#{p.projectNumber}</span>
                  <span style={styles.projName}>{p.name}</span>
                  {p.finalApprovalNumber ? <span style={styles.aprBadge}>{p.finalApprovalNumber}</span> : null}
                </div>
                <div style={styles.cardMeta}>العميل: {p.customerName || "—"}{p.poNumber ? ` · أمر شراء: ${p.poNumber}` : ""}</div>
              </div>
              <button style={styles.issueBtn} onClick={() => { setIssueFor(p); setCName(`عقد توريد عمالة — ${p.name}`); setCStart(p.startDate || ""); setCEnd(p.endDate || ""); setCTemplate(""); }} disabled={busy === p.id}>
                📄 إصدار عقد
              </button>
            </div>
          ))}
        </div>
      )}

      {/* عقود صادرة */}
      {contracts.length > 0 ? (
        <>
          <div style={{ ...styles.sectionTitle, marginTop: 28 }}>📁 عقود صادرة</div>
          <input style={styles.contractSearchInput} value={contractSearch} onChange={(e) => setContractSearch(e.target.value)} placeholder="🔍 بحث برقم العقد أو اسمه أو الطرف الثاني..." />
          <div style={styles.list}>
            {contracts.filter((c) => {
              if (!contractSearch.trim()) return true;
              const s = contractSearch.trim().toLowerCase();
              return String(c.contractNumber || "").includes(s) || (c.name || "").toLowerCase().includes(s) || (c.party || "").toLowerCase().includes(s);
            }).map((c) => (
              <div key={c.id} style={styles.card}>
                <div style={styles.cardMain}>
                  <div style={styles.cardHead}>
                    <span style={styles.contractNum}>عقد #{c.contractNumber}</span>
                    <span style={styles.projName}>{c.name}</span>
                  </div>
                  <div style={styles.cardMeta}>الطرف الثاني: {c.party || "—"} · القيمة: {fmt(c.value)} ر.س</div>
                </div>
                <button style={styles.viewBtn} onClick={() => openContract(c.id)}>👁️ عرض / طباعة</button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* نموذج إصدار العقد */}
      {issueFor ? (
        <div style={styles.overlay} onClick={() => setIssueFor(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHead}>
              <h2 style={styles.modalTitle}>إصدار عقد — مشروع #{issueFor.projectNumber}</h2>
              <button style={styles.closeBtn} onClick={() => setIssueFor(null)}>✕</button>
            </div>
            <div style={styles.formBody}>
              <label style={styles.fieldLabel}>اسم العقد</label>
              <input style={styles.input} value={cName} onChange={(e) => setCName(e.target.value)} disabled={busy} />
              <div style={styles.dateRow}>
                <div style={styles.dateCol}>
                  <label style={styles.fieldLabel}>تاريخ البداية</label>
                  <input style={styles.input} type="date" value={cStart} onChange={(e) => setCStart(e.target.value)} disabled={busy} dir="ltr" />
                </div>
                <div style={styles.dateCol}>
                  <label style={styles.fieldLabel}>تاريخ النهاية</label>
                  <input style={styles.input} type="date" value={cEnd} onChange={(e) => setCEnd(e.target.value)} disabled={busy} dir="ltr" />
                </div>
              </div>
              <p style={styles.autoNote}>سيُعبّأ العقد تلقائيًا ببيانات الشركة والعميل وجدول العمالة من العرض.</p>
              <label style={styles.fieldLabel}>قالب البنود (اختياري)</label>
              <select style={styles.input} value={cTemplate} onChange={(e) => setCTemplate(e.target.value)} disabled={busy}>
                <option value="">بدون قالب</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div style={styles.modalFoot}>
              <button style={styles.cancelBtn} onClick={() => setIssueFor(null)} disabled={busy}>إلغاء</button>
              <button style={styles.issueBtn} onClick={issueContract} disabled={busy === issueFor.id}>{busy === issueFor.id ? "جارٍ الإصدار..." : "إصدار العقد"}</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* عرض العقد (للطباعة) */}
      {viewContract ? <ContractView contract={viewContract} onClose={() => setViewContract(null)} /> : null}
    </div>
  );
}

/* ===== عرض العقد الكامل (قابل للطباعة) ===== */
function ContractView({ contract, onClose }) {
  const c = contract;
  const company = c.companySnapshot || {};
  const client = c.clientSnapshot || {};

  function printContract() {
    const w = window.open("", "_blank");
    if (!w) return;
    const rows = (c.laborSummary || []).map((it) =>
      `<tr><td>${genderLabel(it.gender)}</td><td>${it.nationality || "—"}</td><td>${it.jobTitle || "—"}</td><td>${it.count}</td><td>${fmt(it.unitPrice)}</td></tr>`
    ).join("");
    w.document.write(`
      <html dir="rtl"><head><meta charset="utf-8"><title>عقد رقم ${c.contractNumber}</title>
      <style>body{font-family:Arial,sans-serif;padding:40px 40px 60px;line-height:1.8;color:#1a1a1a}
      h1{text-align:center;font-size:22px}h2{font-size:16px;border-bottom:2px solid #333;padding-bottom:6px;margin-top:24px}
      table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #999;padding:8px;text-align:right;font-size:13px}
      th{background:#f0f0f0}.parties{display:flex;gap:40px}.party{flex:1}.pv{color:#555;font-size:12px;line-height:1.7}
      .doc-head{border-bottom:3px solid #7c2d12;padding-bottom:14px;margin-bottom:10px}
      .dh-name{font-size:20px;font-weight:800;color:#7c2d12}
      .dh-grid{display:flex;flex-wrap:wrap;gap:3px 16px;font-size:11px;color:#555;margin-top:6px}
      .pg-footer{position:fixed;bottom:14px;left:40px;right:40px;text-align:center;font-size:10px;color:#666;border-top:1px solid #ccc;padding-top:6px}</style></head><body>
      <div class="doc-head">
        <div class="dh-name">${company.name || "اسم الشركة"}</div>
        <div class="dh-grid">
          ${company.crNumber ? `<span>السجل التجاري: ${company.crNumber}</span>` : ""}
          ${company.licenseNumber ? `<span>رقم الترخيص: ${company.licenseNumber}</span>` : ""}
          ${company.taxNumber ? `<span>الرقم الضريبي: ${company.taxNumber}</span>` : ""}
          ${company.addressText ? `<span>العنوان: ${company.addressText}</span>` : ""}
          ${company.authorizedPerson ? `<span>المخوّل: ${company.authorizedPerson}</span>` : ""}
          ${company.companyPhone ? `<span>هاتف: ${company.companyPhone}</span>` : ""}
        </div>
      </div>
      <h1>عقد توريد عمالة رقم ${c.contractNumber}</h1>
      <h2>الأطراف</h2>
      <div class="parties">
        <div class="party"><b>الطرف الأول (المورّد):</b><br/>${company.name || "—"}<br/>
          <span class="pv">السجل التجاري: ${company.crNumber || "—"}${company.licenseNumber ? " | الترخيص: " + company.licenseNumber : ""}<br/>الرقم الضريبي: ${company.taxNumber || "—"}${company.authorizedPerson ? "<br/>المخوّل: " + company.authorizedPerson : ""}</span></div>
        <div class="party"><b>الطرف الثاني (العميل):</b><br/>${client.name || c.party || "—"}<br/>
          <span class="pv">الرقم الضريبي: ${client.taxNumber || "—"} | السجل: ${client.crNumber || "—"}</span></div>
      </div>
      <h2>التمهيد</h2><p>${c.preamble || "—"}</p>
      ${c.bodyText ? `<h2>بنود العقد</h2><p style="white-space:pre-wrap">${c.bodyText}</p>` : ""}
      <h2>العمالة المتعاقد عليها</h2>
      <table><thead><tr><th>الجنس</th><th>الجنسية</th><th>المهنة</th><th>العدد</th><th>سعر الوحدة (ر.س)</th></tr></thead><tbody>${rows}</tbody></table>
      <h2>القيمة والمدة</h2>
      <p>القيمة الإجمالية: <b>${fmt(c.value)} ر.س</b><br/>
      المدة: من ${c.startDate || "—"} إلى ${c.endDate || "—"}</p>
      <br/><br/>
      <div class="parties"><div class="party">توقيع الطرف الأول:<br/><br/>________________</div>
      <div class="party">توقيع الطرف الثاني:<br/><br/>________________</div></div>
      <div class="pg-footer">${[company.name || "الشركة", company.crNumber && ("س.ت " + company.crNumber), company.licenseNumber && ("ترخيص " + company.licenseNumber), company.addressText].filter(Boolean).join("  -  ")}</div>
      </body></html>`);
    w.document.close();
    w.print();
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={{ ...styles.modal, maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>عقد رقم {c.contractNumber}</h2>
          <button style={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={styles.contractBody}>
          <h3 style={styles.contractH}>الأطراف</h3>
          <div style={styles.partiesRow}>
            <div style={styles.partyBox}>
              <div style={styles.partyLabel}>الطرف الأول (المورّد)</div>
              <div style={styles.partyName}>{company.name || "—"}</div>
              <div style={styles.partyMeta}>السجل التجاري: {company.crNumber || "—"}</div>
              {company.licenseNumber ? <div style={styles.partyMeta}>الترخيص: {company.licenseNumber}</div> : null}
              <div style={styles.partyMeta}>الرقم الضريبي: {company.taxNumber || "—"}</div>
            </div>
            <div style={styles.partyBox}>
              <div style={styles.partyLabel}>الطرف الثاني (العميل)</div>
              <div style={styles.partyName}>{client.name || c.party || "—"}</div>
              <div style={styles.partyMeta}>الرقم الضريبي: {client.taxNumber || "—"}</div>
              <div style={styles.partyMeta}>السجل التجاري: {client.crNumber || "—"}</div>
            </div>
          </div>

          <h3 style={styles.contractH}>التمهيد</h3>
          <p style={styles.preambleText}>{c.preamble || "—"}</p>

          {c.bodyText ? (
            <>
              <h3 style={styles.contractH}>بنود العقد</h3>
              <p style={styles.preambleText}>{c.bodyText}</p>
            </>
          ) : null}

          <h3 style={styles.contractH}>العمالة المتعاقد عليها</h3>
          <div style={styles.tableWrap}>
            <div style={styles.tHead}>
              <span>الجنس</span><span>الجنسية</span><span>المهنة</span><span>العدد</span><span>سعر الوحدة</span>
            </div>
            {(c.laborSummary || []).map((it, i) => (
              <div key={i} style={styles.tRow}>
                <span>{genderLabel(it.gender)}</span>
                <span>{it.nationality || "—"}</span>
                <span>{it.jobTitle || "—"}</span>
                <span>{it.count}</span>
                <span dir="ltr">{fmt(it.unitPrice)}</span>
              </div>
            ))}
          </div>

          <h3 style={styles.contractH}>القيمة والمدة</h3>
          <div style={styles.valueRow}>
            <span>القيمة الإجمالية: <b>{fmt(c.value)} ر.س</b></span>
            <span>المدة: {c.startDate || "—"} ← {c.endDate || "—"}</span>
          </div>
        </div>
        <div style={styles.modalFoot}>
          <button style={styles.cancelBtn} onClick={onClose}>إغلاق</button>
          <button style={styles.printBtn} onClick={printContract}>🖨️ طباعة</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic', system-ui, sans-serif", direction: "rtl" },
  topRow: { marginBottom: 18 },
  pageTitle: { fontSize: 24, fontWeight: 800, color: "#7c2d12", margin: "0 0 4px" },
  pageSub: { fontSize: 14, color: "#64748b", margin: 0 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  success: { padding: "10px 12px", background: "#dcfce7", color: "#15803d", borderRadius: 8, fontSize: 14, marginBottom: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
  emptyBox: { padding: "30px 20px", textAlign: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, color: "#94a3b8", fontSize: 15 },

  sectionTitle: { fontSize: 15, fontWeight: 800, color: "#334155", marginBottom: 12 },
  contractSearchInput: { width: "100%", padding: "10px 14px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box", marginBottom: 12 },
  list: { display: "flex", flexDirection: "column", gap: 12 },
  card: { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px", gap: 16, flexWrap: "wrap" },
  cardMain: { flex: 1, minWidth: 220 },
  cardHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" },
  projNum: { fontSize: 16, fontWeight: 800, color: "#16a34a", fontFamily: "monospace" },
  contractNum: { fontSize: 16, fontWeight: 800, color: "#7c2d12", fontFamily: "monospace" },
  projName: { fontSize: 15, fontWeight: 700, color: "#0f172a" },
  aprBadge: { fontSize: 11, fontWeight: 700, color: "#0891b2", background: "#cffafe", padding: "3px 8px", borderRadius: 6 },
  cardMeta: { fontSize: 13, color: "#64748b" },

  issueBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#7c2d12", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  viewBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#7c2d12", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 },
  modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid #e2e8f0" },
  modalTitle: { fontSize: 17, fontWeight: 800, color: "#0f172a", margin: 0 },
  closeBtn: { width: 32, height: 32, border: "none", background: "#f1f5f9", borderRadius: 8, fontSize: 16, cursor: "pointer", color: "#64748b" },
  formBody: { padding: "20px 22px", overflowY: "auto" },
  fieldLabel: { display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6, marginTop: 12 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #cbd5e1", borderRadius: 8, fontFamily: "inherit", boxSizing: "border-box" },
  dateRow: { display: "flex", gap: 12 },
  dateCol: { flex: 1 },
  autoNote: { fontSize: 12, color: "#78716c", background: "#fafaf9", padding: "10px 12px", borderRadius: 8, marginTop: 16 },
  modalFoot: { display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: "1px solid #e2e8f0" },
  cancelBtn: { padding: "10px 18px", fontSize: 14, color: "#64748b", background: "#fff", border: "1px solid #cbd5e1", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  printBtn: { padding: "10px 20px", fontSize: 14, fontWeight: 700, color: "#fff", background: "#7c2d12", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },

  contractBody: { padding: "20px 24px", overflowY: "auto" },
  contractH: { fontSize: 15, fontWeight: 800, color: "#0f172a", borderBottom: "2px solid #e2e8f0", paddingBottom: 6, marginTop: 20, marginBottom: 10 },
  partiesRow: { display: "flex", gap: 16, flexWrap: "wrap" },
  partyBox: { flex: 1, minWidth: 200, padding: 14, background: "#f8fafc", borderRadius: 10 },
  partyLabel: { fontSize: 12, fontWeight: 700, color: "#7c2d12", marginBottom: 6 },
  partyName: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 6 },
  partyMeta: { fontSize: 12, color: "#64748b" },
  preambleText: { fontSize: 14, color: "#334155", lineHeight: 1.9, margin: 0 },

  tableWrap: { border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" },
  tHead: { display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr 0.7fr 1fr", background: "#f1f5f9", padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#475569" },
  tRow: { display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr 0.7fr 1fr", padding: "10px 12px", fontSize: 13, color: "#334155", borderTop: "1px solid #f1f5f9" },
  valueRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#334155", flexWrap: "wrap", gap: 8 },
};
