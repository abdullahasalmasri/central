import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { AMIRI_REGULAR, AMIRI_BOLD } from "./amiriFont";

// ===== محرّك التصدير المشترك (يخدم كل الأقسام) =====

// ---------- Excel ----------
export function exportToExcel({ rows, columns, fileName, sheetName }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    alert("لا توجد بيانات للتصدير.");
    return;
  }
  const headerRow = columns.map((c) => c.header);
  const dataRows = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.key];
      if (val === null || val === undefined) return "";
      return val;
    })
  );
  const aoa = [headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = columns.map((c, i) => {
    let maxLen = String(c.header).length;
    for (const row of dataRows) {
      const len = String(row[i] || "").length;
      if (len > maxLen) maxLen = len;
    }
    return { wch: Math.min(maxLen + 4, 50) };
  });
  if (!ws["!views"]) ws["!views"] = [{}];
  ws["!views"][0].RTL = true;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || "بيانات");
  const finalName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(wb, finalName);
}

// ---------- PDF (عربي) ----------
function loadAmiri(doc) {
  doc.addFileToVFS("Amiri-Regular.ttf", AMIRI_REGULAR);
  doc.addFont("Amiri-Regular.ttf", "Amiri", "normal");
  doc.addFileToVFS("Amiri-Bold.ttf", AMIRI_BOLD);
  doc.addFont("Amiri-Bold.ttf", "Amiri", "bold");
}

export function exportToPDF({ rows, columns, fileName, header }) {
  if (!Array.isArray(rows) || rows.length === 0) {
    alert("لا توجد بيانات للتصدير.");
    return;
  }

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  loadAmiri(doc);

  const ar = (txt) => doc.processArabic(String(txt == null ? "" : txt));
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - 14;
  let y = 18;

  if (header && header.companyName) {
    doc.setFont("Amiri", "bold");
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text(ar(header.companyName), rightX, y, { align: "right" });
    y += 8;
  }
  if (header && header.title) {
    doc.setFont("Amiri", "bold");
    doc.setFontSize(14);
    doc.setTextColor(124, 58, 237);
    doc.text(ar(header.title), rightX, y, { align: "right" });
    y += 7;
  }
  doc.setFont("Amiri", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  if (header && header.subtitle) {
    doc.text(ar(header.subtitle), rightX, y, { align: "right" });
    y += 5;
  }
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  doc.text(ar("تاريخ الطباعة: " + dateStr), rightX, y, { align: "right" });
  y += 4;
  doc.text(ar("عدد السجلات: " + rows.length), rightX, y, { align: "right" });
  y += 6;

  const head = [columns.map((c) => ar(c.header))];
  const body = rows.map((row) =>
    columns.map((c) => {
      const val = row[c.key];
      if (val === null || val === undefined) return "";
      if (typeof val === "number") return String(val);
      const s = String(val);
      if (/^[0-9A-Za-z\s\-_.@+]*$/.test(s)) return s;
      return ar(s);
    })
  );

  autoTable(doc, {
    startY: y,
    head: head,
    body: body,
    styles: { font: "Amiri", fontStyle: "normal", halign: "right", fontSize: 10, cellPadding: 3 },
    headStyles: { font: "Amiri", fontStyle: "bold", fillColor: [124, 58, 237], textColor: [255, 255, 255], halign: "right" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { right: 14, left: 14 },
    tableWidth: "auto",
  });

  const finalName = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
  doc.save(finalName);
}

// ---------- طباعة فاتورة قياسية (عربية + QR) ----------
// invoice: مستند الفاتورة. company: اسم الشركة. sellerTaxNumber: الرقم الضريبي للبائع.
// qrDataUrl: صورة QR (Data URL) — تُولّد مسبقًا عبر zatcaQR.
export function printInvoicePDF({ invoice, company, sellerTaxNumber, qrDataUrl }) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  loadAmiri(doc);

  const ar = (txt) => doc.processArabic(String(txt == null ? "" : txt));
  const num = (n) => (n == null ? "0" : Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const pageWidth = doc.internal.pageSize.getWidth();
  const rightX = pageWidth - 16;
  const leftX = 16;
  let y = 20;

  const cust = invoice.customerSnapshot || {};
  const addr = cust.address || {};

  // ===== الترويسة =====
  doc.setFont("Amiri", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(ar(company || "الشركة"), rightX, y, { align: "right" });

  // عنوان "فاتورة ضريبية" يسار
  doc.setFontSize(13);
  doc.setTextColor(22, 163, 74);
  doc.text(ar("فاتورة ضريبية"), leftX, y, { align: "left" });
  doc.setFont("Amiri", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("Tax Invoice", leftX, y + 5, { align: "left" });

  y += 10;
  doc.setFont("Amiri", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  if (sellerTaxNumber) {
    doc.text(ar("الرقم الضريبي: " + sellerTaxNumber), rightX, y, { align: "right" });
    y += 5;
  }

  // خط فاصل
  y += 2;
  doc.setDrawColor(226, 232, 240);
  doc.line(leftX, y, rightX, y);
  y += 8;

  // ===== معلومات الفاتورة والعميل =====
  doc.setFont("Amiri", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(ar("رقم الفاتورة: INV-" + invoice.invoiceNumber), rightX, y, { align: "right" });
  doc.setFont("Amiri", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(ar("التاريخ: " + invoice.date), leftX, y, { align: "left" });
  y += 7;

  // بيانات العميل
  doc.setFont("Amiri", "bold");
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(ar("فاتورة إلى:"), rightX, y, { align: "right" });
  y += 5;
  doc.setFont("Amiri", "normal");
  doc.setTextColor(15, 23, 42);
  doc.text(ar(cust.name || "—"), rightX, y, { align: "right" });
  y += 5;
  if (cust.taxNumber) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(ar("الرقم الضريبي: " + cust.taxNumber), rightX, y, { align: "right" });
    y += 5;
  }
  const addrText = [addr.buildingNumber, addr.street, addr.district, addr.city, addr.postalCode].filter(Boolean).join("، ");
  if (addrText) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(ar(addrText), rightX, y, { align: "right" });
    y += 5;
  }
  y += 4;

  // ===== جدول البنود =====
  const head = [[ar("الإجمالي"), ar("الضريبة"), ar("الأساس"), ar("السعر"), ar("الكمية"), ar("الوصف")]];
  const body = (invoice.lines || []).map((ln) => {
    const taxLabel = [];
    if (ln.exciseApplicable) taxLabel.push(`انتقائية ${ln.exciseRate}%`);
    if (ln.vatApplicable) taxLabel.push(`مضافة ${ln.vatRate}%`);
    const taxText = taxLabel.length ? taxLabel.join(" + ") : "معفى";
    return [
      num(ln.lineTotal),
      ar(taxText),
      num(ln.base),
      num(ln.unitPrice),
      String(ln.quantity),
      ar(ln.description),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: head,
    body: body,
    styles: { font: "Amiri", fontStyle: "normal", halign: "right", fontSize: 9, cellPadding: 2.5 },
    headStyles: { font: "Amiri", fontStyle: "bold", fillColor: [22, 163, 74], textColor: [255, 255, 255], halign: "right" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { right: 16, left: 16 },
    columnStyles: {
      0: { halign: "left" }, 1: { halign: "center" }, 2: { halign: "left" },
      3: { halign: "left" }, 4: { halign: "center" },
    },
  });

  let afterTable = doc.lastAutoTable.finalY + 8;

  // ===== الإجماليات (يسار) =====
  const totalsX = leftX;
  const totalsValX = 80;
  const lineGap = 6;

  function totalLine(label, value, bold) {
    doc.setFont("Amiri", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(bold ? 22 : 71, bold ? 163 : 85, bold ? 74 : 105);
    doc.text(ar(label), totalsValX, afterTable, { align: "left" });
    doc.text(num(value) + " " + "SAR", totalsX, afterTable, { align: "left" });
    afterTable += lineGap;
  }

  totalLine("المجموع قبل الضرائب", invoice.subtotal, false);
  if (invoice.totalExcise > 0) totalLine("الضريبة الانتقائية", invoice.totalExcise, false);
  if (invoice.totalVat > 0) totalLine("ضريبة القيمة المضافة", invoice.totalVat, false);
  afterTable += 1;
  doc.setDrawColor(187, 247, 208);
  doc.line(totalsX, afterTable - 3, totalsValX + 10, afterTable - 3);
  totalLine("الإجمالي النهائي", invoice.total, true);

  // ===== QR code (يمين، بمحاذاة الإجماليات) =====
  if (qrDataUrl) {
    const qrSize = 35;
    const qrY = doc.lastAutoTable.finalY + 8;
    try {
      doc.addImage(qrDataUrl, "PNG", rightX - qrSize, qrY, qrSize, qrSize);
      doc.setFont("Amiri", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(ar("امسح للتحقق"), rightX - qrSize / 2, qrY + qrSize + 4, { align: "center" });
    } catch (e) {
      // تجاهل لو فشلت الصورة
    }
  }

  // ===== ملاحظات =====
  if (invoice.notes) {
    const notesY = Math.max(afterTable, doc.lastAutoTable.finalY + 50);
    doc.setFont("Amiri", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(ar("ملاحظات: " + invoice.notes), rightX, notesY, { align: "right" });
  }

  doc.save(`فاتورة-INV-${invoice.invoiceNumber}.pdf`);
}

// ---------- مساعدات ----------
export function fmtDate(ts) {
  if (!ts) return "";
  try {
    let d;
    if (ts.seconds) d = new Date(ts.seconds * 1000);
    else if (ts.toDate) d = ts.toDate();
    else d = new Date(ts);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ar-SA-u-ca-gregory", { year: "numeric", month: "2-digit", day: "2-digit" });
  } catch {
    return "";
  }
}

export function datedFileName(prefix) {
  const today = new Date().toISOString().slice(0, 10);
  return `${prefix}-${today}`;
}