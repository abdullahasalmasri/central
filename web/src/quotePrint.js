/* ============================================================
   طباعة عرض السعر (PDF عبر نافذة الطباعة)
   نسختان:
   - internal: تفصيلية (التكلفة المرجعية + الربح) — للمبيعات والمالية
   - client: مبسّطة + مختومة (بعد موافقة المالية) — للإرسال للعميل
   الختم الإلكتروني (المبيعات + المالية) يظهر في نسخة العميل.
   مدة العرض تُحسب من تاريخ موافقة المالية.
   ============================================================ */

const fmt = (n) => (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const genderLabel = (g) => (g === "male" ? "ذكر" : g === "female" ? "أنثى" : "—");

function toDate(ts) {
  if (!ts) return null;
  if (typeof ts === "object" && ts.seconds !== undefined) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(ts) {
  const d = toDate(ts);
  return d ? d.toISOString().slice(0, 10) : "—";
}

// ختم إلكتروني مرسوم (دائري) — باسم القسم فقط
function stampHTML(company, dept, dateStr) {
  return `<div class="stamp">
    <div class="stamp-inner">
      <div class="stamp-dept">${dept}</div>
      <div class="stamp-line"></div>
      <div class="stamp-seal">اعتماد</div>
      <div class="stamp-date">${dateStr}</div>
    </div>
  </div>`;
}

export function printQuote(quote, mode, company) {
  const q = quote || {};
  const isClient = mode === "client";
  const labor = q.laborItems || [];
  const equip = q.equipmentItems || [];
  const co = company || {};

  const approvedDate = fmtDate(q.financeReviewedAt);
  const hasFinanceApproval = !!q.financeRefNumber;
  const validity = Number(q.validityDays) > 0 ? Number(q.validityDays) : 14;

  // ملاحظات السكن والمواصلات (مجمّعة)
  const housingList = labor.filter((it) => it.includesHousing).map((it) => `${genderLabel(it.gender)} ${it.nationality || ""} ${it.jobTitleName || it.jobTitle || ""} (${it.count})`);
  const transportList = labor.filter((it) => it.includesTransport).map((it) => `${genderLabel(it.gender)} ${it.nationality || ""} ${it.jobTitleName || it.jobTitle || ""} (${it.count})`);

  // جدول العمالة
  let laborRows = "";
  if (isClient) {
    laborRows = labor.map((it) => `<tr>
      <td>${it.jobTitleName || it.jobTitle || "—"}</td>
      <td>${genderLabel(it.gender)}</td>
      <td>${it.nationality || "—"}</td>
      <td>${fmt(it.unitPrice)}</td>
      <td>${it.count}</td>
      <td>${fmt(it.lineTotal)}</td>
    </tr>`).join("");
  } else {
    laborRows = labor.map((it) => {
      const refTotal = (Number(it.refCost) || 0) + (it.includesHousing ? Number(it.refHousing) || 0 : 0) + (it.includesTransport ? Number(it.refTransport) || 0 : 0);
      const margin = (Number(it.unitPrice) || 0) - refTotal;
      return `<tr>
        <td>${it.jobTitleName || it.jobTitle || "—"}</td>
        <td>${genderLabel(it.gender)}</td>
        <td>${it.nationality || "—"}</td>
        <td>${fmt(refTotal)}</td>
        <td>${fmt(it.unitPrice)}</td>
        <td class="${margin < 0 ? "neg" : "pos"}">${fmt(margin)}</td>
        <td>${it.count}</td>
        <td>${fmt(it.lineTotal)}</td>
      </tr>`;
    }).join("");
  }

  const laborHead = isClient
    ? `<tr><th>المهنة</th><th>الجنس</th><th>الجنسية</th><th>سعر الوحدة</th><th>العدد</th><th>الإجمالي</th></tr>`
    : `<tr><th>المهنة</th><th>الجنس</th><th>الجنسية</th><th>التكلفة المرجعية</th><th>السعر المعروض</th><th>هامش الربح</th><th>العدد</th><th>الإجمالي</th></tr>`;

  // جدول المعدات
  let equipSection = "";
  if (equip.length > 0) {
    const equipRows = equip.map((it) => `<tr>
      <td>${it.type || "—"}</td><td>${it.model || "—"}</td><td>${it.manufacturer || "—"}</td>
      <td>${fmt(it.unitPrice)}</td><td>${it.count}</td><td>${fmt(it.lineTotal)}</td>
    </tr>`).join("");
    equipSection = `<h3>المعدات</h3>
      <table><thead><tr><th>النوع</th><th>الموديل</th><th>الشركة</th><th>سعر الوحدة</th><th>العدد</th><th>الإجمالي</th></tr></thead>
      <tbody>${equipRows}</tbody></table>`;
  }

  // الملاحظات
  let notesSection = "";
  if (housingList.length || transportList.length) {
    notesSection = `<div class="notes"><h3>ملاحظات</h3>`;
    if (housingList.length) notesSection += `<p>• يشمل العرض السكن لكل من: ${housingList.join("، ")}.</p>`;
    if (transportList.length) notesSection += `<p>• يشمل العرض المواصلات لكل من: ${transportList.join("، ")}.</p>`;
    notesSection += `</div>`;
  }

  // مدة العرض (من تاريخ موافقة المالية)
  let validitySection = "";
  if (isClient) {
    validitySection = hasFinanceApproval
      ? `<div class="validity">هذا العرض ساري لمدة <b>${validity}</b> يوم عمل من تاريخ الإصدار (تاريخ الاعتماد: ${approvedDate}).</div>`
      : `<div class="validity">هذا العرض ساري لمدة <b>${validity}</b> يوم عمل من تاريخ اعتماد الإدارة المالية.</div>`;
  } else {
    validitySection = `<div class="validity">مدة صلاحية العرض: <b>${validity}</b> يوم عمل من تاريخ اعتماد الإدارة المالية.</div>`;
  }

  // الأختام (نسخة العميل فقط، بعد موافقة المالية)
  let stampsSection = "";
  if (isClient && hasFinanceApproval) {
    stampsSection = `<div class="stamps">
      ${stampHTML(co, "إدارة المبيعات", approvedDate)}
      ${stampHTML(co, "الإدارة المالية", approvedDate)}
    </div>`;
  }

  const title = isClient ? "عرض سعر" : "عرض سعر (نسخة داخلية)";
  const refLine = hasFinanceApproval ? `<span>المرجع: ${q.financeRefNumber}</span>` : "";

  const w = window.open("", "_blank");
  if (!w) { alert("فعّل النوافذ المنبثقة للطباعة."); return; }
  w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
  <title>عرض سعر ${q.quoteNumber || ""}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; padding: 36px; color: #1a1a1a; line-height: 1.7; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid ${isClient ? "#4f46e5" : "#64748b"}; padding-bottom: 16px; margin-bottom: 20px; gap: 20px; }
    .head-co { flex: 1; }
    .co-name { font-size: 22px; font-weight: 800; color: ${isClient ? "#4f46e5" : "#334155"}; margin-bottom: 8px; }
    .co-grid { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 11px; color: #555; }
    .co-grid span { white-space: nowrap; }
    .doc-title { text-align: left; min-width: 180px; }
    .doc-title h1 { font-size: 20px; margin: 0; }
    .doc-title .num { font-size: 13px; color: #666; margin-top: 6px; }
    .doc-title .num span { display: block; margin-bottom: 2px; }
    ${!isClient ? ".watermark { position: fixed; top: 45%; right: 20%; font-size: 60px; color: rgba(100,116,139,.08); transform: rotate(-30deg); font-weight: 800; }" : ""}
    .client-box { background: #f8fafc; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; }
    .client-box b { font-size: 15px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
    th { background: ${isClient ? "#eef2ff" : "#f1f5f9"}; font-weight: 700; }
    h3 { font-size: 15px; margin-top: 22px; border-right: 4px solid ${isClient ? "#4f46e5" : "#64748b"}; padding-right: 8px; }
    .pos { color: #16a34a; }
    .neg { color: #dc2626; font-weight: 700; }
    .totals { margin-top: 20px; margin-right: auto; width: 300px; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
    .totals .final { border-top: 2px solid #333; margin-top: 6px; padding-top: 10px; font-size: 17px; font-weight: 800; }
    .notes { margin-top: 20px; background: #fffbeb; padding: 12px 16px; border-radius: 8px; font-size: 13px; }
    .notes h3 { margin-top: 0; border: none; padding: 0; }
    .notes p { margin: 4px 0; }
    .validity { margin-top: 20px; padding: 12px 16px; background: ${isClient ? "#eff6ff" : "#f8fafc"}; border-radius: 8px; font-size: 13px; text-align: center; }
    .stamps { display: flex; gap: 60px; justify-content: center; margin-top: 40px; }
    .stamp { width: 140px; height: 140px; }
    .stamp-inner { width: 100%; height: 100%; border: 3px double #1e40af; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #1e40af; padding: 12px; transform: rotate(-8deg); }
    .stamp-dept { font-size: 14px; font-weight: 800; }
    .stamp-line { width: 60%; border-top: 1px solid #1e40af; margin: 8px 0; }
    .stamp-seal { font-size: 12px; font-weight: 800; letter-spacing: 3px; }
    .stamp-date { font-size: 10px; margin-top: 4px; }
    .page-footer { position: fixed; bottom: 12px; left: 0; right: 0; text-align: center; font-size: 10px; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; margin: 0 20px; }
    @media print { body { padding: 20px 20px 50px; } .watermark { display: block; } .page-footer { position: fixed; } }
  </style></head><body>
  ${!isClient ? '<div class="watermark">نسخة داخلية</div>' : ''}
  <div class="head">
    <div class="head-co">
      <div class="co-name">${co.name || "اسم الشركة"}</div>
      <div class="co-grid">
        ${co.crNumber ? `<span>السجل التجاري: ${co.crNumber}</span>` : ""}
        ${co.licenseNumber ? `<span>رقم الترخيص: ${co.licenseNumber}</span>` : ""}
        ${co.taxNumber ? `<span>الرقم الضريبي: ${co.taxNumber}</span>` : ""}
        ${co.addressText ? `<span>العنوان: ${co.addressText}</span>` : ""}
        ${co.authorizedPerson ? `<span>المخوّل: ${co.authorizedPerson}</span>` : ""}
        ${co.companyPhone ? `<span>هاتف الشركة: ${co.companyPhone}</span>` : ""}
        ${co.authorizedPhone ? `<span>هاتف المخوّل: ${co.authorizedPhone}</span>` : ""}
      </div>
    </div>
    <div class="doc-title">
      <h1>${title}</h1>
      <div class="num"><span>رقم: ${q.quoteNumber || "—"}</span>${refLine}<span>التاريخ: ${fmtDate(q.createdAt) !== "—" ? fmtDate(q.createdAt) : new Date().toISOString().slice(0,10)}</span></div>
    </div>
  </div>

  <div class="client-box">العميل: <b>${q.customerName || "—"}</b></div>

  <h3>العمالة</h3>
  <table><thead>${laborHead}</thead><tbody>${laborRows || '<tr><td colspan="8">لا يوجد</td></tr>'}</tbody></table>
  ${equipSection}

  <div class="totals">
    <div class="row"><span>الإجمالي قبل الضريبة</span><span>${fmt(q.subtotal)} ر.س</span></div>
    <div class="row"><span>ضريبة القيمة المضافة (${q.vatRate || 15}%)</span><span>${fmt(q.taxAmount)} ر.س</span></div>
    <div class="row final"><span>الإجمالي</span><span>${fmt(q.total)} ر.س</span></div>
  </div>

  ${notesSection}
  ${validitySection}
  ${stampsSection}

  <div class="page-footer">${[co.name || "الشركة", co.crNumber && ("س.ت " + co.crNumber), co.licenseNumber && ("ترخيص " + co.licenseNumber), co.addressText].filter(Boolean).join("  -  ")}</div>

  <script>window.onload = function() { window.print(); }</script>
  </body></html>`);
  w.document.close();
}
