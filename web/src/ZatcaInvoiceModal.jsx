import { useState, useEffect } from "react";
import QRCode from "qrcode";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// نافذة ZATCA المرحلة الثانية لفاتورة — تُفتح من قائمة الفواتير.
// تتوقّع: invoice = { id, invoiceNumber, total, totalVat, zatcaSigned, zatcaQR, zatcaXml, zatcaHash, zatcaPih, zatcaTimestamp }
export default function ZatcaInvoiceModal({ invoice, onClose, onSigned }) {
  const [inv, setInv] = useState(invoice);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [qrImg, setQrImg] = useState("");

  // توليد صورة QR من نص الـ TLV المُرمّز
  useEffect(() => {
    if (inv.zatcaQR) {
      QRCode.toDataURL(inv.zatcaQR, { errorCorrectionLevel: "M", margin: 1, width: 220 })
        .then(setQrImg)
        .catch(() => setQrImg(""));
    } else {
      setQrImg("");
    }
  }, [inv.zatcaQR]);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const fn = httpsCallable(functions, "generateZatcaInvoice");
      const r = await fn({ invoiceId: inv.id });
      const updated = { ...inv, zatcaSigned: true, zatcaQR: r.data.qr, zatcaHash: r.data.hash, zatcaPih: r.data.pih };
      // نحتاج XML أيضًا — نعيد جلبه عبر الاستدعاء (مخزّن)، لكن r.data لا يرجّعه؛ نطلب onSigned لإعادة التحميل
      setInv(updated);
      if (onSigned) onSigned();
    } catch (e) {
      setError(e.message || "تعذّر التوليد.");
    } finally {
      setBusy(false);
    }
  }

  function downloadXML() {
    if (!inv.zatcaXml) return;
    const blob = new Blob([inv.zatcaXml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.invoiceNumber || "invoice"}_zatca.xml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.head}>
          <h2 style={styles.title}>الفاتورة الضريبية ZATCA</h2>
          <button style={styles.close} onClick={onClose}>✕</button>
        </div>

        <div style={styles.invInfo}>
          <span style={styles.invNum} dir="ltr">{inv.invoiceNumber}</span>
          <span style={styles.invTotal} dir="ltr">{(Number(inv.total) || 0).toLocaleString()} ﷼</span>
        </div>

        {!inv.zatcaSigned ? (
          <div style={styles.unsigned}>
            <div style={styles.phaseTag}>المرحلة الثانية (التكامل)</div>
            <p style={styles.desc}>
              توليد فاتورة UBL 2.1 موقّعة إلكترونيًّا (ECDSA) مع رمز QR كامل بتسعة حقول وربطها بسلسلة الفواتير (PIH).
            </p>
            <div style={styles.devNote}>
              ℹ️ التوقيع بمفتاح تطوير محلي. الإنتاج الفعلي يتطلّب شهادة CSID من هيئة الزكاة والضريبة عبر التسجيل (onboarding) ونداء Clearance/Reporting.
            </div>
            {error ? <div style={styles.error}>{error}</div> : null}
            <button style={styles.genBtn} onClick={generate} disabled={busy}>{busy ? "جارٍ التوليد والتوقيع..." : "🔏 توليد وتوقيع الفاتورة"}</button>
          </div>
        ) : (
          <div style={styles.signed}>
            <div style={styles.signedBadge}>✓ موقّعة إلكترونيًّا</div>

            {qrImg ? (
              <div style={styles.qrBox}>
                <img src={qrImg} alt="ZATCA QR" style={styles.qrImg} />
                <span style={styles.qrLabel}>امسح للتحقّق (9 حقول)</span>
              </div>
            ) : null}

            <div style={styles.fields}>
              {inv.zatcaHash ? (
                <div style={styles.field}>
                  <span style={styles.fLabel}>تجزئة الفاتورة (SHA-256)</span>
                  <span style={styles.fValue} dir="ltr">{inv.zatcaHash}</span>
                </div>
              ) : null}
              {inv.zatcaPih ? (
                <div style={styles.field}>
                  <span style={styles.fLabel}>تجزئة الفاتورة السابقة (PIH)</span>
                  <span style={styles.fValue} dir="ltr">{inv.zatcaPih === "0" ? "0 (أول فاتورة في السلسلة)" : inv.zatcaPih}</span>
                </div>
              ) : null}
              {inv.zatcaTimestamp ? (
                <div style={styles.field}>
                  <span style={styles.fLabel}>الطابع الزمني</span>
                  <span style={styles.fValue} dir="ltr">{inv.zatcaTimestamp}</span>
                </div>
              ) : null}
            </div>

            {error ? <div style={styles.error}>{error}</div> : null}

            <div style={styles.actions}>
              {inv.zatcaXml ? <button style={styles.xmlBtn} onClick={downloadXML}>⬇️ تنزيل UBL XML</button> : null}
              <button style={styles.regenBtn} onClick={generate} disabled={busy}>{busy ? "..." : "إعادة التوليد"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 100 },
  modal: { width: "100%", maxWidth: 480, background: "#fff", borderRadius: 12, padding: 24, direction: "rtl", textAlign: "right", maxHeight: "92vh", overflowY: "auto" },
  head: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  title: { margin: 0, fontSize: 19, color: "#16a34a" },
  close: { background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#64748b" },

  invInfo: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#f8fafc", borderRadius: 10, marginBottom: 16 },
  invNum: { fontSize: 15, fontWeight: 700, color: "#0f172a", fontFamily: "monospace" },
  invTotal: { fontSize: 16, fontWeight: 700, color: "#16a34a", fontFamily: "monospace" },

  unsigned: { display: "flex", flexDirection: "column", gap: 12 },
  phaseTag: { display: "inline-block", alignSelf: "flex-start", padding: "4px 12px", borderRadius: 12, fontSize: 12, fontWeight: 700, background: "#ecfdf5", color: "#047857" },
  desc: { margin: 0, fontSize: 14, color: "#334155", lineHeight: 1.7 },
  devNote: { padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, fontSize: 12.5, color: "#92400e", lineHeight: 1.6 },
  genBtn: { padding: "12px 20px", fontSize: 15, fontWeight: 700, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer", marginTop: 4 },

  signed: { display: "flex", flexDirection: "column", gap: 14, alignItems: "stretch" },
  signedBadge: { alignSelf: "center", padding: "6px 18px", borderRadius: 14, fontSize: 14, fontWeight: 700, background: "#dcfce7", color: "#166534" },
  qrBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 16, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 },
  qrImg: { width: 200, height: 200 },
  qrLabel: { fontSize: 12, color: "#64748b" },

  fields: { display: "flex", flexDirection: "column", gap: 10 },
  field: { display: "flex", flexDirection: "column", gap: 3, padding: "8px 12px", background: "#f8fafc", borderRadius: 8 },
  fLabel: { fontSize: 11, color: "#94a3b8" },
  fValue: { fontSize: 12, color: "#0f172a", fontFamily: "monospace", wordBreak: "break-all" },

  actions: { display: "flex", gap: 10, flexWrap: "wrap" },
  xmlBtn: { flex: 1, minWidth: 140, padding: "10px 16px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#16a34a", border: "none", borderRadius: 8, cursor: "pointer" },
  regenBtn: { padding: "10px 16px", fontSize: 14, fontWeight: 600, color: "#475569", background: "#e2e8f0", border: "none", borderRadius: 8, cursor: "pointer" },

  error: { padding: "10px 12px", background: "#fee2e2", color: "#b91c1c", borderRadius: 8, fontSize: 14 },
};
