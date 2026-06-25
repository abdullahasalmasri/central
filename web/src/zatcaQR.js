import QRCode from "qrcode";

// ===== توليد QR code متوافق مع ZATCA (المرحلة 1) =====
// يبني سلسلة TLV (Tag-Length-Value) من الحقول الخمسة الأساسية،
// يرمّزها Base64، ثم يولّد QR كـ Data URL لإدراجه في PDF.

// يبني عنصر TLV واحد: [tag][length][value bytes]
function encodeTLV(tag, value) {
  const valueBytes = new TextEncoder().encode(String(value)); // UTF-8
  const buffer = new Uint8Array(2 + valueBytes.length);
  buffer[0] = tag;                  // رقم الحقل
  buffer[1] = valueBytes.length;    // طول القيمة بالبايت
  buffer.set(valueBytes, 2);        // القيمة
  return buffer;
}

// يحوّل Uint8Array إلى Base64
function uint8ToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// يبني سلسلة TLV الكاملة بصيغة Base64
// fields: { sellerName, vatNumber, timestamp, total, vatTotal }
export function buildZatcaTLVBase64({ sellerName, vatNumber, timestamp, total, vatTotal }) {
  const parts = [
    encodeTLV(1, sellerName || ""),
    encodeTLV(2, vatNumber || ""),
    encodeTLV(3, timestamp || ""),
    encodeTLV(4, total || "0"),
    encodeTLV(5, vatTotal || "0"),
  ];
  // دمج كل الأجزاء
  let totalLen = 0;
  for (const p of parts) totalLen += p.length;
  const combined = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    combined.set(p, offset);
    offset += p.length;
  }
  return uint8ToBase64(combined);
}

// يولّد QR code كـ Data URL (PNG) من بيانات الفاتورة
// يرجّع Promise<string> (Data URL)
export async function generateZatcaQR({ sellerName, vatNumber, timestamp, total, vatTotal }) {
  const base64 = buildZatcaTLVBase64({ sellerName, vatNumber, timestamp, total, vatTotal });
  // مستوى تصحيح M (15%) كما يتطلّب ZATCA، QR Model 2
  const dataUrl = await QRCode.toDataURL(base64, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 300,
  });
  return dataUrl;
}