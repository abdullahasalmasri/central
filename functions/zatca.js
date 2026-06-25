// ═══════════════════════════════════════════════════════════════
// ZATCA — المرحلة الثانية (التكامل): UBL 2.1 XML + التجزئة + التوقيع + QR
// ───────────────────────────────────────────────────────────────
// ملاحظة: التوقيع هنا بمفتاح تطوير (ECDSA secp256k1) لإنتاج فاتورة موقّعة
// قابلة للاختبار محليًّا. الإنتاج الفعلي يستبدل المفتاح بشهادة CSID من
// هيئة الزكاة والضريبة (عبر onboarding) ويضيف نداء Clearance/Reporting.
// ═══════════════════════════════════════════════════════════════
const crypto = require("crypto");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const money = (n) => (Math.round((Number(n) || 0) * 100) / 100).toFixed(2);

// ───── توليد UBL 2.1 XML معياري ─────
function generateInvoiceXML({ invoice, seller, customer, pih }) {
  const issueTime = invoice.issueTime || "00:00:00";
  const taxExclusive = (Number(invoice.subtotal) || 0) + (Number(invoice.totalExcise) || 0);

  const linesXML = (invoice.lines || []).map((ln, i) => `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="PCE">${Number(ln.quantity) || 0}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SAR">${money(ln.base)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SAR">${money(ln.vatAmount)}</cbc:TaxAmount>
      <cbc:RoundingAmount currencyID="SAR">${money(ln.lineTotal)}</cbc:RoundingAmount>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${esc(ln.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${ln.vatApplicable ? "S" : "O"}</cbc:ID>
        <cbc:Percent>${Number(ln.vatRate) || 0}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="SAR">${money(ln.unitPrice)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${esc(invoice.invoiceNumber)}</cbc:ID>
  <cbc:UUID>${esc(invoice.uuid)}</cbc:UUID>
  <cbc:IssueDate>${esc(invoice.date)}</cbc:IssueDate>
  <cbc:IssueTime>${esc(issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(pih || "")}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification><cbc:ID schemeID="CRN">${esc(seller.crNumber || "")}</cbc:ID></cac:PartyIdentification>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(seller.address || "")}</cbc:StreetName>
        <cbc:BuildingNumber>${esc(seller.buildingNumber || "")}</cbc:BuildingNumber>
        <cbc:CitySubdivisionName>${esc(seller.district || "")}</cbc:CitySubdivisionName>
        <cbc:CityName>${esc(seller.city || "")}</cbc:CityName>
        <cbc:PostalZone>${esc(seller.postalCode || "")}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(seller.taxNumber || "")}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(seller.name || "")}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(customer.taxNumber || "")}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(customer.name || "")}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${money(invoice.totalVat)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SAR">${money(invoice.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SAR">${money(taxExclusive)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SAR">${money(invoice.total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SAR">${money(invoice.total)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${linesXML}
</Invoice>`;
}

// ───── تجزئة الفاتورة: SHA-256 → Base64 ─────
function computeInvoiceHash(xml) {
  return crypto.createHash("sha256").update(xml, "utf8").digest("base64");
}

// ───── توليد زوج مفاتيح ECDSA secp256k1 (تطوير) ─────
function generateKeyPair() {
  return crypto.generateKeyPairSync("ec", {
    namedCurve: "secp256k1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

// ───── التوقيع الإلكتروني ECDSA على التجزئة → Base64 ─────
function signHash(hashBase64, privateKeyPem) {
  const sign = crypto.createSign("SHA256");
  sign.update(hashBase64);
  sign.end();
  return sign.sign(privateKeyPem, "base64");
}

// ───── التحقّق من التوقيع (للاختبار) ─────
function verifySignature(hashBase64, signatureBase64, publicKeyPem) {
  const verify = crypto.createVerify("SHA256");
  verify.update(hashBase64);
  verify.end();
  return verify.verify(publicKeyPem, signatureBase64, "base64");
}

// ───── المفتاح العام DER → Base64 ─────
function publicKeyToBase64(publicKeyPem) {
  return crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" }).toString("base64");
}

// ───── ترميز TLV (tag + length + value) ─────
function tlv(tag, value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return Buffer.concat([Buffer.from([tag]), Buffer.from([buf.length]), buf]);
}

// ───── بناء QR Code (9 حقول TLV للمرحلة الثانية) → Base64 ─────
function buildQRCode({ sellerName, taxNumber, timestamp, total, vatTotal, invoiceHash, signatureBase64, publicKeyBase64, stampBase64 }) {
  const parts = [
    tlv(1, sellerName || ""),
    tlv(2, taxNumber || ""),
    tlv(3, timestamp || ""),
    tlv(4, money(total)),
    tlv(5, money(vatTotal)),
    tlv(6, invoiceHash || ""),
    tlv(7, signatureBase64 || ""),
    tlv(8, Buffer.from(publicKeyBase64 || "", "base64")),
  ];
  if (stampBase64) parts.push(tlv(9, Buffer.from(stampBase64, "base64")));
  return Buffer.concat(parts).toString("base64");
}

module.exports = {
  generateInvoiceXML,
  computeInvoiceHash,
  generateKeyPair,
  signHash,
  verifySignature,
  publicKeyToBase64,
  buildQRCode,
};
