import { useState, useEffect } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, auth, functions } from "../firebase";
import { exportToExcel, exportToPDF, printInvoicePDF, datedFileName } from "../exportUtils";
import { generateZatcaQR } from "../zatcaQR";
import ZatcaInvoiceModal from "../ZatcaInvoiceModal";

/* ============================================================
   الفوترة و ZATCA — قسم المالية
   منقولة من النظام القديم (InvoicesTab) إلى الـ Shell الجديد.
   تجلب tenantId واسم المنشأة بنفسها، ثم تقرأ الفواتير/العملاء/الحسابات.
   الإنشاء عبر createInvoice (يحسب الضرائب ويُنشئ القيد المحاسبي تلقائيًا).
   التوقيع الإلكتروني عبر ZatcaInvoiceModal (المرحلة الثانية).
   ============================================================ */

export default function InvoicesView() {
  const [tenantId, setTenantId] = useState("");
  const [companyName, setCompanyName] = useState("الشركة");
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [revenueAccounts, setRevenueAccounts] = useState([]);
  const [items, setItems] = useState([]);
  const [sellerTaxNumber, setSellerTaxNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [viewInvoice, setViewInvoice] = useState(null);
  const [zatcaInvoice, setZatcaInvoice] = useState(null);

  // 1) جلب هوية المستخدم (tenantId + اسم المنشأة + الرقم الضريبي) عند فتح الواجهة
  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser && auth.currentUser.uid;
        if (!uid) { setError("لم يتم تسجيل الدخول."); setLoading(false); return; }
        const userSnap = await getDoc(doc(db, "users", uid));
        const tid = userSnap.exists() ? userSnap.data().tenantId : null;
        if (!tid) { setError("تعذّر تحديد المنشأة لهذا المستخدم."); setLoading(false); return; }
        try {
          const tSnap = await getDoc(doc(db, "tenants", tid));
          if (tSnap.exists()) {
            const t = tSnap.data();
            if (t.name) setCompanyName(t.name);
            setSellerTaxNumber(t.taxNumber || "");
          }
        } catch (e) { /* بيانات المنشأة اختيارية */ }
        setTenantId(tid);
      } catch (e) {
        setError("تعذّر تحميل بيانات المستخدم.");
        setLoading(false);
      }
    })();
  }, []);

  // 2) عند توفّر tenantId، حمّل البيانات
  useEffect(() => {
    if (tenantId) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [invSnap, custSnap, accSnap, itemSnap] = await Promise.all([
        getDocs(query(collection(db, "invoices"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "customers"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "accounts"), where("tenantId", "==", tenantId))),
        getDocs(query(collection(db, "items"), where("tenantId", "==", tenantId))),
      ]);
      const invList = invSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      invList.sort((a, b) => (b.invoiceNumber || 0) - (a.invoiceNumber || 0));
      setInvoices(invList);

      setCustomers(custSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const accs = accSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRevenueAccounts(accs.filter((a) => a.type === "revenue" && a.isActive !== false));

      const allItems = itemSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setItems(allItems.filter((it) => it.costStatus === "approved"));
    } catch (err) {
      setError("تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  }

  const company = companyName;

  function buildRows() {
    return invoices.map((inv) => ({
      number: `INV-${inv.invoiceNumber}`,
      date: inv.date,
      customer: inv.customerSnapshot ? inv.customerSnapshot.name : "",
      subtotal: inv.subtotal,
      vat: inv.totalVat,
      excise: inv.totalExcise,
      total: inv.total,
    }));
  }
  const exportColumns = [
    { key: "number", header: "رقم الفاتورة" },
    { key: "date", header: "التاريخ" },
    { key: "customer", header: "العميل" },
    { key: "subtotal", header: "قبل الضريبة" },
    { key: "vat", header: "ق.مضافة" },
    { key: "excise", header: "انتقائية" },
    { key: "total", header: "الإجمالي" },
  ];
  const exportExcel = () => exportToExcel({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("الفواتير"), sheetName: "الفواتير" });
  const exportPDF = () => exportToPDF({ rows: buildRows(), columns: exportColumns, fileName: datedFileName("الفواتير"), header: { companyName: company, title: "سجل الفواتير", subtitle: "فواتير قياسية" } });

  return (
    <div style={styles.page}>
      <div style={styles.pageHead}>
        <h1 style={styles.pageTitle}>الفوترة و ZATCA</h1>
        <p style={styles.pageSub}>إصدار الفواتير الضريبية وتوقيعها إلكترونيًا · المالية</p>
      </div>

      {loading ? (
        <p style={styles.muted}>جارٍ التحميل...</p>
      ) : (
        <>
          <div style={styles.toolbar}>
            <span style={styles.count}>{invoices.length} فاتورة</span>
            <div style={styles.toolBtns}>
              {invoices.length > 0 ? (
                <>
                  <button style={styles.pdfBtn} onClick={exportPDF}>⬇ PDF</button>
                  <button style={styles.exportBtn} onClick={exportExcel}>⬇ Excel</button>
                </>
              ) : null}
              <button style={styles.addBtn} onClick={() => setShowForm(true)}>+ فاتورة جديدة</button>
            </div>
          </div>

          {error ? <div style={styles.error}>{error}</div> : null}

          {customers.length === 0 ? (
            <div style={styles.notice}>أضف عميلًا أولًا (من «العملاء») قبل إنشاء فاتورة.</div>
          ) : revenueAccounts.length === 0 ? (
            <div style={styles.notice}>أنشئ دليل الحسابات أولًا (يحتوي حسابات الإيراد) قبل إنشاء فاتورة.</div>
          ) : null}

          {invoices.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>🧾</div>
              <p style={styles.muted}>لا توجد فواتير بعد.</p>
            </div>
          ) : (
            <table style={styles.table}>
              <thead><tr>
                <th style={styles.th}>الفاتورة</th><th style={styles.th}>التاريخ</th>
                <th style={styles.th}>العميل</th><th style={styles.thAmount}>الإجمالي</th>
                <th style={styles.th}></th>
              </tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td style={styles.tdNum} dir="ltr">INV-{inv.invoiceNumber}</td>
                    <td style={styles.td} dir="ltr">{inv.date}</td>
                    <td style={styles.td}>{inv.customerSnapshot ? inv.customerSnapshot.name : "—"}</td>
                    <td style={styles.tdAmount} dir="ltr">{(inv.total || 0).toLocaleString()} ﷼</td>
                    <td style={styles.tdActions}>
                      <button style={styles.viewBtn} onClick={() => setViewInvoice(inv)}>عرض</button>
                      <button
                        style={inv.zatcaSigned ? styles.zatcaBtnSigned : styles.zatcaBtn}
                        onClick={() => setZatcaInvoice(inv)}
                        title={inv.zatcaSigned ? "فاتورة موقّعة إلكترونيًا (ZATCA المرحلة الثانية)" : "توقيع الفاتورة إلكترونيًا (ZATCA المرحلة الثانية)"}
                      >
                        {inv.zatcaSigned ? "✓ ZATCA" : "⚡ ZATCA"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {showForm ? (
        <InvoiceForm
          customers={customers}
          revenueAccounts={revenueAccounts}
          items={items}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); loadData(); }}
        />
      ) : null}

      {viewInvoice ? (
        <InvoiceDetail invoice={viewInvoice} company={company} sellerTaxNumber={sellerTaxNumber} onClose={() => setViewInvoice(null)} />
      ) : null}

      {zatcaInvoice ? (
        <ZatcaInvoiceModal
          invoice={zatcaInvoice}
          onClose={() => setZatcaInvoice(null)}
          onSigned={loadData}
        />
      ) : null}
    </div>
  );
}

// ═══ نموذج إنشاء فاتورة ═══
function InvoiceForm({ customers, revenueAccounts, items, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [customerId, setCustomerId] = useState("");
  const [revenueAccountId, setRevenueAccountId] = useState(revenueAccounts.length === 1 ? revenueAccounts[0].id : "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  function emptyLine() {
    return {
      description: "", quantity: "1", unitPrice: "",
      vatApplicable: false, vatRate: "15",
      exciseApplicable: false, exciseRate: "",
    };
  }

  function updateLine(idx, field, value) {
    setLines((prev) => prev.map((ln, i) => (i === idx ? { ...ln, [field]: value } : ln)));
  }
  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }
  function removeLine(idx) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function fillFromItem(idx, itemId) {
    const item = items.find((it) => it.id === itemId);
    if (!item) return;
    const tax = item.taxConfig || {};
    setLines((prev) => prev.map((ln, i) => {
      if (i !== idx) return ln;
      return {
        ...ln,
        description: item.name,
        unitPrice: item.approvedCost != null ? String(item.approvedCost) : ln.unitPrice,
        vatApplicable: tax.vatApplicable === true,
        vatRate: tax.vatApplicable ? String(tax.vatRate) : "15",
        exciseApplicable: tax.exciseApplicable === true,
        exciseRate: tax.exciseApplicable ? String(tax.exciseRate) : "",
        itemId: item.id,
      };
    }));
  }

  function calcLine(ln) {
    const qty = Number(ln.quantity) || 0;
    const price = Number(ln.unitPrice) || 0;
    const base = qty * price;
    const exciseRate = ln.exciseApplicable ? (Number(ln.exciseRate) || 0) : 0;
    const exciseAmount = base * (exciseRate / 100);
    const vatRate = ln.vatApplicable ? (Number(ln.vatRate) || 0) : 0;
    const vatAmount = (base + exciseAmount) * (vatRate / 100);
    return { base, exciseAmount, vatAmount, total: base + exciseAmount + vatAmount };
  }

  let subtotal = 0, totalExcise = 0, totalVat = 0;
  for (const ln of lines) {
    const c = calcLine(ln);
    subtotal += c.base; totalExcise += c.exciseAmount; totalVat += c.vatAmount;
  }
  const grandTotal = subtotal + totalExcise + totalVat;
  const r = (n) => Math.round(n * 100) / 100;

  async function save() {
    setErr("");
    if (!customerId) { setErr("اختر العميل."); return; }
    if (!revenueAccountId) { setErr("اختر حساب الإيراد."); return; }

    const cleanLines = lines
      .filter((ln) => ln.description.trim() && Number(ln.quantity) > 0 && Number(ln.unitPrice) >= 0)
      .map((ln) => ({
        description: ln.description.trim(),
        quantity: Number(ln.quantity),
        unitPrice: Number(ln.unitPrice),
        vatApplicable: ln.vatApplicable,
        vatRate: ln.vatApplicable ? Number(ln.vatRate) : 0,
        exciseApplicable: ln.exciseApplicable,
        exciseRate: ln.exciseApplicable ? Number(ln.exciseRate) : 0,
        itemId: ln.itemId || null,
      }));

    if (cleanLines.length === 0) { setErr("أضف بندًا واحدًا على الأقل (وصف + كمية + سعر)."); return; }

    setSaving(true);
    try {
      const fn = httpsCallable(functions, "createInvoice");
      await fn({ date, customerId, revenueAccountId, lines: cleanLines, notes });
      onSaved();
    } catch (e) {
      setErr(e.message || "تعذّر إنشاء الفاتورة.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalLarge} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>فاتورة قياسية جديدة</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.row}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>العميل *</label>
            <select style={styles.input} value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={saving}>
              <option value="">— اختر العميل —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.taxNumber ? ` (${c.taxNumber})` : ""}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>التاريخ *</label>
            <input style={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={saving} dir="ltr" />
          </div>
        </div>

        <label style={styles.label}>حساب الإيراد *</label>
        <select style={styles.input} value={revenueAccountId} onChange={(e) => setRevenueAccountId(e.target.value)} disabled={saving}>
          <option value="">— اختر حساب الإيراد —</option>
          {revenueAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
        </select>

        <div style={styles.linesTitle}>بنود الفاتورة</div>
        {lines.map((ln, idx) => {
          const c = calcLine(ln);
          return (
            <div key={idx} style={styles.lineCard}>
              <div style={styles.lineHeader}>
                <span style={styles.lineNum}>بند {idx + 1}</span>
                {items.length > 0 ? (
                  <select style={styles.itemSelect} value={ln.itemId || ""} onChange={(e) => fillFromItem(idx, e.target.value)} disabled={saving}>
                    <option value="">— أو اختر من الكتالوج —</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                ) : null}
                {lines.length > 1 ? (
                  <button style={styles.delLine} onClick={() => removeLine(idx)} disabled={saving}>✕</button>
                ) : null}
              </div>

              <input style={styles.lineDesc} value={ln.description} onChange={(e) => updateLine(idx, "description", e.target.value)} placeholder="وصف البند" disabled={saving} />

              <div style={styles.lineRow}>
                <div style={styles.lineField}>
                  <label style={styles.miniLabel}>الكمية</label>
                  <input style={styles.miniInput} type="number" min="0" value={ln.quantity} onChange={(e) => updateLine(idx, "quantity", e.target.value)} disabled={saving} dir="ltr" />
                </div>
                <div style={styles.lineField}>
                  <label style={styles.miniLabel}>سعر الوحدة</label>
                  <input style={styles.miniInput} type="number" min="0" value={ln.unitPrice} onChange={(e) => updateLine(idx, "unitPrice", e.target.value)} placeholder="0" disabled={saving} dir="ltr" />
                </div>
                <div style={styles.lineField}>
                  <label style={styles.miniLabel}>الأساس</label>
                  <div style={styles.computed} dir="ltr">{r(c.base).toLocaleString()}</div>
                </div>
              </div>

              <div style={styles.lineTaxes}>
                <label style={styles.taxCheck}>
                  <input type="checkbox" checked={ln.exciseApplicable} onChange={(e) => updateLine(idx, "exciseApplicable", e.target.checked)} disabled={saving} />
                  <span>انتقائية</span>
                  {ln.exciseApplicable ? (
                    <input style={styles.rateInput} type="number" min="0" value={ln.exciseRate} onChange={(e) => updateLine(idx, "exciseRate", e.target.value)} placeholder="%" disabled={saving} dir="ltr" />
                  ) : null}
                  {ln.exciseApplicable ? <span style={styles.taxAmt} dir="ltr">{r(c.exciseAmount).toLocaleString()}</span> : null}
                </label>

                <label style={styles.taxCheck}>
                  <input type="checkbox" checked={ln.vatApplicable} onChange={(e) => updateLine(idx, "vatApplicable", e.target.checked)} disabled={saving} />
                  <span>ق.مضافة</span>
                  {ln.vatApplicable ? (
                    <input style={styles.rateInput} type="number" min="0" max="100" value={ln.vatRate} onChange={(e) => updateLine(idx, "vatRate", e.target.value)} placeholder="%" disabled={saving} dir="ltr" />
                  ) : null}
                  {ln.vatApplicable ? <span style={styles.taxAmt} dir="ltr">{r(c.vatAmount).toLocaleString()}</span> : null}
                </label>

                <span style={styles.lineTotal} dir="ltr">{r(c.total).toLocaleString()} ﷼</span>
              </div>
            </div>
          );
        })}

        <button style={styles.addLineBtn} onClick={addLine} disabled={saving}>+ إضافة بند</button>

        <div style={styles.totalsBox}>
          <div style={styles.totalRow}><span>المجموع قبل الضرائب</span><span dir="ltr">{r(subtotal).toLocaleString()} ﷼</span></div>
          {totalExcise > 0 ? <div style={styles.totalRow}><span>إجمالي الضريبة الانتقائية</span><span dir="ltr">{r(totalExcise).toLocaleString()} ﷼</span></div> : null}
          {totalVat > 0 ? <div style={styles.totalRow}><span>إجمالي ضريبة القيمة المضافة</span><span dir="ltr">{r(totalVat).toLocaleString()} ﷼</span></div> : null}
          <div style={styles.grandRow}><span>الإجمالي النهائي</span><span dir="ltr">{r(grandTotal).toLocaleString()} ﷼</span></div>
        </div>

        <label style={styles.label}>ملاحظات</label>
        <input style={styles.input} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري" disabled={saving} />

        {err ? <div style={styles.error}>{err}</div> : null}
        <button style={styles.save} onClick={save} disabled={saving}>{saving ? "جارٍ الإصدار..." : "إصدار الفاتورة"}</button>
      </div>
    </div>
  );
}

// ═══ تفاصيل فاتورة ═══
function InvoiceDetail({ invoice, company, sellerTaxNumber, onClose }) {
  const [printing, setPrinting] = useState(false);
  const cust = invoice.customerSnapshot || {};
  const addr = cust.address || {};
  const addrText = [addr.buildingNumber, addr.street, addr.district, addr.city, addr.postalCode].filter(Boolean).join("، ");

  async function handlePrint() {
    setPrinting(true);
    try {
      const timestamp = invoice.date + "T12:00:00Z";
      const totalTax = (invoice.totalVat || 0) + (invoice.totalExcise || 0);
      const qrDataUrl = await generateZatcaQR({
        sellerName: company,
        vatNumber: sellerTaxNumber || "",
        timestamp: timestamp,
        total: String(invoice.total || 0),
        vatTotal: String(totalTax),
      });
      printInvoicePDF({ invoice, company, sellerTaxNumber, qrDataUrl });
    } catch (e) {
      alert("تعذّر توليد الطباعة: " + (e.message || ""));
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modalLarge} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHead}>
          <h2 style={styles.modalTitle}>فاتورة INV-{invoice.invoiceNumber}</h2>
          <div style={styles.headActions}>
            <button style={styles.printBtn} onClick={handlePrint} disabled={printing}>
              {printing ? "جارٍ التوليد..." : "🖨 طباعة PDF"}
            </button>
            <button style={styles.close} onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={styles.detailHead}>
          <div>
            <div style={styles.detailCompany}>{company}</div>
            <div style={styles.detailMeta}>📅 {invoice.date}</div>
            {sellerTaxNumber ? <div style={styles.detailMeta}>الرقم الضريبي: <span dir="ltr">{sellerTaxNumber}</span></div> : null}
          </div>
          <span style={styles.standardBadge}>فاتورة ضريبية</span>
        </div>

        <div style={styles.custBox}>
          <div style={styles.custName}>{cust.name}</div>
          {cust.taxNumber ? <div style={styles.custLine}>الرقم الضريبي: <span dir="ltr">{cust.taxNumber}</span></div> : null}
          {addrText ? <div style={styles.custLine}>{addrText}</div> : null}
        </div>

        <table style={styles.detailTable}>
          <thead><tr>
            <th style={styles.dth}>البند</th>
            <th style={styles.dthC}>كمية</th>
            <th style={styles.dthC}>سعر</th>
            <th style={styles.dthC}>الأساس</th>
            <th style={styles.dthC}>الضرائب</th>
            <th style={styles.dthC}>الإجمالي</th>
          </tr></thead>
          <tbody>
            {(invoice.lines || []).map((ln, i) => (
              <tr key={i}>
                <td style={styles.dtd}>{ln.description}</td>
                <td style={styles.dtdC} dir="ltr">{ln.quantity}</td>
                <td style={styles.dtdC} dir="ltr">{(ln.unitPrice || 0).toLocaleString()}</td>
                <td style={styles.dtdC} dir="ltr">{(ln.base || 0).toLocaleString()}</td>
                <td style={styles.dtdC} dir="ltr">
                  {ln.exciseApplicable ? <div style={styles.miniTax}>انتقائية {ln.exciseRate}%</div> : null}
                  {ln.vatApplicable ? <div style={styles.miniTax}>مضافة {ln.vatRate}%</div> : null}
                  {!ln.exciseApplicable && !ln.vatApplicable ? "—" : null}
                </td>
                <td style={styles.dtdC} dir="ltr">{(ln.lineTotal || 0).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={styles.detailTotals}>
          <div style={styles.dtotalRow}><span>المجموع قبل الضرائب</span><span dir="ltr">{(invoice.subtotal || 0).toLocaleString()} ﷼</span></div>
          {invoice.totalExcise > 0 ? <div style={styles.dtotalRow}><span>الضريبة الانتقائية</span><span dir="ltr">{(invoice.totalExcise || 0).toLocaleString()} ﷼</span></div> : null}
          {invoice.totalVat > 0 ? <div style={styles.dtotalRow}><span>ضريبة القيمة المضافة</span><span dir="ltr">{(invoice.totalVat || 0).toLocaleString()} ﷼</span></div> : null}
          <div style={styles.dgrandRow}><span>الإجمالي</span><span dir="ltr">{(invoice.total || 0).toLocaleString()} ﷼</span></div>
        </div>

        {invoice.notes ? <div style={styles.notesBox}>ملاحظات: {invoice.notes}</div> : null}

        <div style={styles.linkedNote}>
          ✓ تم توليد القيد المحاسبي تلقائيًا لهذه الفاتورة
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: { padding: "26px 30px 40px", minHeight: "100%", background: "#f4f6f9", fontFamily: "'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif", direction: "rtl" },
  pageHead: { marginBottom: 20 },
  pageTitle: { margin: 0, fontSize: 23, fontWeight: 700, color: "#059669", letterSpacing: "-.4px" },
  pageSub: { margin: "4px 0 0", fontSize: 13, color: "#5a6580" },

  toolbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 },
  count: { fontSize: 14, color: "#64748b", fontWeight: 600 },
  toolBtns: { display: "flex", gap: 8 },
  pdfBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#b91c1c", background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer" },
  exportBtn: { padding: "9px 14px", fontSize: 13, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },
  addBtn: { padding: "9px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },

  notice: { padding: "12px 16px", background: "#fffbeb", border: "1px solid #fcd97e", borderRadius: 8, fontSize: 14, color: "#92400e", marginBottom: 16 },
  empty: { padding: 40, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, textAlign: "center" },
  emptyIcon: { fontSize: 48, marginBottom: 12 },

  table: { width: "100%", borderCollapse: "collapse", background: "#fff", borderRadius: 8 },
  th: { textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0" },
  thAmount: { textAlign: "left", padding: "10px 12px", fontSize: 13, color: "#64748b", borderBottom: "2px solid #e2e8f0" },
  td: { padding: "11px 12px", fontSize: 14, borderBottom: "1px solid #f1f5f9" },
  tdNum: { padding: "11px 12px", fontSize: 13, fontWeight: 700, color: "#16a34a", fontFamily: "monospace", borderBottom: "1px solid #f1f5f9" },
  tdAmount: { padding: "11px 12px", fontSize: 14, textAlign: "left", borderBottom: "1px solid #f1f5f9", fontWeight: 700 },
  tdActions: { padding: "11px 12px", fontSize: 14, borderBottom: "1px solid #f1f5f9", display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-start" },
  viewBtn: { padding: "5px 14px", fontSize: 12, fontWeight: 600, color: "#16a34a", background: "#dcfce7", border: "none", borderRadius: 6, cursor: "pointer" },
  zatcaBtn: { padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#7c3aed", background: "#ede9fe", border: "none", borderRadius: 6, cursor: "pointer" },
  zatcaBtnSigned: { padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#15803d", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 6, cursor: "pointer" },

  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modalLarge: { width: "100%", maxWidth: 760, background: "#fff", borderRadius: 12, padding: 28, direction: "rtl", textAlign: "right", maxHeight: "92vh", overflowY: "auto" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { margin: 0, fontSize: 20 },
  headActions: { display: "flex", alignItems: "center", gap: 10 },
  printBtn: { padding: "8px 16px", fontSize: 13, fontWeight: 600, color: "#fff", background: "#0f766e", border: "none", borderRadius: 7, cursor: "pointer" },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },
  label: { display: "block", margin: "14px 0 6px", fontSize: 14, fontWeight: 600 },
  input: { width: "100%", padding: "10px 12px", fontSize: 15, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", background: "#fff" },
  row: { display: "flex", gap: 12 },

  linesTitle: { marginTop: 20, marginBottom: 10, fontSize: 15, fontWeight: 700, color: "#16a34a", borderTop: "1px solid #e2e8f0", paddingTop: 16 },
  lineCard: { padding: 14, background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", marginBottom: 10 },
  lineHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 },
  lineNum: { fontSize: 13, fontWeight: 700, color: "#475569" },
  itemSelect: { flex: 1, padding: "6px 10px", fontSize: 12, border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", color: "#16a34a", minWidth: 0 },
  delLine: { width: 28, height: 28, fontSize: 13, color: "#dc2626", background: "#fee2e2", border: "none", borderRadius: 6, cursor: "pointer", flexShrink: 0 },
  lineDesc: { width: "100%", padding: "9px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 8, boxSizing: "border-box", marginBottom: 8 },
  lineRow: { display: "flex", gap: 8, marginBottom: 8 },
  lineField: { flex: 1 },
  miniLabel: { display: "block", fontSize: 11, color: "#94a3b8", marginBottom: 3 },
  miniInput: { width: "100%", padding: "7px 10px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" },
  computed: { padding: "7px 10px", fontSize: 14, background: "#e2e8f0", borderRadius: 6, fontWeight: 600, color: "#475569" },
  lineTaxes: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", paddingTop: 8, borderTop: "1px dashed #cbd5e1" },
  taxCheck: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" },
  rateInput: { width: 55, padding: "5px 6px", fontSize: 13, border: "1px solid #ccc", borderRadius: 5, textAlign: "center" },
  taxAmt: { fontSize: 12, color: "#64748b", fontFamily: "monospace", minWidth: 50 },
  lineTotal: { marginRight: "auto", fontSize: 14, fontWeight: 700, color: "#16a34a", fontFamily: "monospace" },
  addLineBtn: { padding: "9px 18px", fontSize: 13, fontWeight: 600, color: "#16a34a", background: "#dcfce7", border: "none", borderRadius: 8, cursor: "pointer" },

  totalsBox: { marginTop: 16, padding: 16, background: "#f0fdf4", borderRadius: 10 },
  totalRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", marginBottom: 8 },
  grandRow: { display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 700, color: "#16a34a", borderTop: "2px solid #bbf7d0", paddingTop: 10, marginTop: 4 },

  save: { width: "100%", marginTop: 20, padding: "13px", fontSize: 16, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },

  detailHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 16, borderBottom: "2px solid #e2e8f0" },
  detailCompany: { fontSize: 18, fontWeight: 700, color: "#0f172a" },
  detailMeta: { fontSize: 13, color: "#64748b", marginTop: 4 },
  standardBadge: { padding: "4px 12px", background: "#dbeafe", color: "#1e40af", borderRadius: 8, fontSize: 12, fontWeight: 600 },
  custBox: { padding: 14, background: "#f8fafc", borderRadius: 10, marginBottom: 16 },
  custName: { fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  custLine: { fontSize: 13, color: "#64748b", marginTop: 2 },
  detailTable: { width: "100%", borderCollapse: "collapse", marginBottom: 16 },
  dth: { textAlign: "right", padding: "8px 10px", fontSize: 12, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  dthC: { textAlign: "center", padding: "8px 10px", fontSize: 12, color: "#64748b", borderBottom: "2px solid #e2e8f0", background: "#f8fafc" },
  dtd: { padding: "10px", fontSize: 13, borderBottom: "1px solid #f1f5f9" },
  dtdC: { padding: "10px", fontSize: 13, textAlign: "center", borderBottom: "1px solid #f1f5f9", fontFamily: "monospace" },
  miniTax: { fontSize: 11, color: "#7c3aed" },
  detailTotals: { padding: 16, background: "#f0fdf4", borderRadius: 10, marginBottom: 12 },
  dtotalRow: { display: "flex", justifyContent: "space-between", fontSize: 14, color: "#475569", marginBottom: 8 },
  dgrandRow: { display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 700, color: "#16a34a", borderTop: "2px solid #bbf7d0", paddingTop: 10 },
  notesBox: { padding: "10px 14px", background: "#f8fafc", borderRadius: 8, fontSize: 13, color: "#64748b", marginBottom: 12 },
  linkedNote: { padding: "10px 14px", background: "#eff6ff", borderRadius: 8, fontSize: 13, color: "#1e40af", textAlign: "center", fontWeight: 600 },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14, marginTop: 16 },
  muted: { color: "#94a3b8", fontSize: 14 },
};
