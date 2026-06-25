import { useState, useEffect } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "./firebase";

// إعدادات الشركة: بيانات البائع الضريبية والعنوان + إعدادات حساب التكلفة.
export default function CompanyProfileTab({ tenantId, companyName }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [f, setF] = useState({
    taxNumber: "", crNumber: "",
    buildingNumber: "", street: "", district: "", city: "", postalCode: "", additionalNumber: "",
    workDaysPerMonth: "30", workHoursPerDay: "8",
  });

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "tenants"), where("__name__", "==", tenantId)));
      if (!snap.empty) {
        const t = snap.docs[0].data();
        const addr = t.address || {};
        setF({
          taxNumber: t.taxNumber || "",
          crNumber: t.crNumber || "",
          buildingNumber: addr.buildingNumber || "",
          street: addr.street || "",
          district: addr.district || "",
          city: addr.city || "",
          postalCode: addr.postalCode || "",
          additionalNumber: addr.additionalNumber || "",
          workDaysPerMonth: t.workDaysPerMonth != null ? String(t.workDaysPerMonth) : "30",
          workHoursPerDay: t.workHoursPerDay != null ? String(t.workHoursPerDay) : "8",
        });
      }
    } catch (err) {
      setError("تعذّر تحميل بيانات الشركة.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { loadData(); }, []);

  const set = (k, v) => { setF((p) => ({ ...p, [k]: v })); setSuccess(false); };

  async function save() {
    setError("");
    setSuccess(false);
    if (f.taxNumber.trim() && !/^3\d{13}3$/.test(f.taxNumber.trim())) {
      setError("الرقم الضريبي يجب أن يكون 15 رقمًا يبدأ وينتهي بالرقم 3.");
      return;
    }
    const wd = Number(f.workDaysPerMonth);
    if (!Number.isFinite(wd) || wd < 1 || wd > 31) { setError("أيام العمل الشهرية يجب أن تكون بين 1 و31."); return; }
    const wh = Number(f.workHoursPerDay);
    if (!Number.isFinite(wh) || wh < 1 || wh > 24) { setError("ساعات العمل اليومية يجب أن تكون بين 1 و24."); return; }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "updateCompanyProfile");
      await fn({ ...f, workDaysPerMonth: wd, workHoursPerDay: wh });
      setSuccess(true);
    } catch (e) {
      setError(e.message || "تعذّر الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={styles.muted}>جارٍ التحميل...</p>;

  const hasTax = f.taxNumber.trim().length > 0;

  return (
    <div style={styles.panel}>
      <div style={styles.head}>
        <div>
          <h3 style={styles.title}>بيانات الشركة الضريبية</h3>
          <p style={styles.sub}>تظهر هذه البيانات في الفواتير ورمز الاستجابة (QR) المتوافق مع هيئة الزكاة والضريبة.</p>
        </div>
        <span style={hasTax ? styles.statusOk : styles.statusWarn}>
          {hasTax ? "✓ مكتمل" : "⚠ الرقم الضريبي ناقص"}
        </span>
      </div>

      <div style={styles.companyBadge}>{companyName || "الشركة"}</div>

      {/* البيانات الرسمية */}
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الرقم الضريبي (VAT)</label>
          <input style={styles.input} value={f.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} placeholder="3XXXXXXXXXXXX3" disabled={saving} dir="ltr" />
          <span style={styles.hint}>15 رقمًا يبدأ وينتهي بالرقم 3</span>
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>السجل التجاري</label>
          <input style={styles.input} value={f.crNumber} onChange={(e) => set("crNumber", e.target.value)} disabled={saving} dir="ltr" />
        </div>
      </div>

      {/* العنوان الوطني */}
      <div style={styles.addressTitle}>العنوان الوطني (لمتطلبات الفاتورة القياسية)</div>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>رقم المبنى</label>
          <input style={styles.input} value={f.buildingNumber} onChange={(e) => set("buildingNumber", e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 2 }}>
          <label style={styles.label}>الشارع</label>
          <input style={styles.input} value={f.street} onChange={(e) => set("street", e.target.value)} disabled={saving} />
        </div>
      </div>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الحي</label>
          <input style={styles.input} value={f.district} onChange={(e) => set("district", e.target.value)} disabled={saving} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>المدينة</label>
          <input style={styles.input} value={f.city} onChange={(e) => set("city", e.target.value)} disabled={saving} />
        </div>
      </div>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الرمز البريدي</label>
          <input style={styles.input} value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} disabled={saving} dir="ltr" />
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>الرقم الإضافي</label>
          <input style={styles.input} value={f.additionalNumber} onChange={(e) => set("additionalNumber", e.target.value)} disabled={saving} dir="ltr" />
        </div>
      </div>

      {/* إعدادات حساب التكلفة */}
      <div style={styles.costTitle}>أساس حساب التكلفة</div>
      <p style={styles.costDesc}>تُستخدم لتوحيد بنود التكلفة المختلفة (شهري/يومي/بالساعة) إلى أساس مشترك عند حساب ربحية المشاريع.</p>
      <div style={styles.row}>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>أيام العمل في الشهر</label>
          <input style={styles.input} type="number" min="1" max="31" value={f.workDaysPerMonth} onChange={(e) => set("workDaysPerMonth", e.target.value)} disabled={saving} dir="ltr" />
          <span style={styles.hint}>لتحويل التكلفة الشهرية إلى يومية</span>
        </div>
        <div style={{ flex: 1 }}>
          <label style={styles.label}>ساعات العمل في اليوم</label>
          <input style={styles.input} type="number" min="1" max="24" value={f.workHoursPerDay} onChange={(e) => set("workHoursPerDay", e.target.value)} disabled={saving} dir="ltr" />
          <span style={styles.hint}>لتحويل التكلفة بالساعة إلى يومية</span>
        </div>
      </div>

      {error ? <div style={styles.error}>{error}</div> : null}
      {success ? <div style={styles.success}>✓ تم حفظ بيانات الشركة بنجاح.</div> : null}

      <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ البيانات"}</button>
    </div>
  );
}

const styles = {
  panel: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 28, maxWidth: 720 },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 },
  title: { margin: 0, fontSize: 18, color: "#0f172a" },
  sub: { margin: "6px 0 0", fontSize: 13, color: "#64748b", lineHeight: 1.6, maxWidth: 460 },
  statusOk: { padding: "5px 12px", background: "#dcfce7", color: "#166534", borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  statusWarn: { padding: "5px 12px", background: "#fef3c7", color: "#92400e", borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
  companyBadge: { display: "inline-block", padding: "8px 16px", background: "#f0fdf4", color: "#16a34a", borderRadius: 8, fontSize: 15, fontWeight: 700, marginBottom: 20 },
  label: { display: "block", margin: "12px 0 6px", fontSize: 13, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  hint: { display: "block", fontSize: 11, color: "#94a3b8", marginTop: 4 },
  row: { display: "flex", gap: 12 },
  addressTitle: { marginTop: 20, marginBottom: 4, fontSize: 14, fontWeight: 700, color: "#16a34a", borderTop: "1px solid #e2e8f0", paddingTop: 18 },
  costTitle: { marginTop: 24, marginBottom: 4, fontSize: 14, fontWeight: 700, color: "#7c3aed", borderTop: "1px solid #e2e8f0", paddingTop: 18 },
  costDesc: { margin: "0 0 8px", fontSize: 12, color: "#94a3b8", lineHeight: 1.6 },
  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginTop: 16 },
  success: { padding: "10px 12px", background: "#dcfce7", color: "#166534", borderRadius: 8, fontSize: 14, marginTop: 16 },
  save: { width: "100%", marginTop: 20, padding: "12px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },
  muted: { color: "#94a3b8", fontSize: 14 },
};