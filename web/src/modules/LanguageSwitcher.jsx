import { useState } from "react";
import { useT } from "./i18n";

/* مبدّل اللغة — قائمة منسدلة بأربع لغات، متاح في أي مكان */
export default function LanguageSwitcher({ compact }) {
  const { lang, setLang, langs } = useT();
  const [open, setOpen] = useState(false);
  const cur = langs[lang] || langs.ar;

  return (
    <div style={styles.wrap}>
      <button style={styles.trigger} onClick={() => setOpen((o) => !o)} title="Language / اللغة">
        <span style={styles.flag}>{cur.flag}</span>
        {compact ? null : <span style={styles.curName}>{cur.name}</span>}
        <span style={styles.chevron}>▾</span>
      </button>

      {open ? (
        <>
          <div style={styles.overlay} onClick={() => setOpen(false)} />
          <div style={styles.menu}>
            {Object.keys(langs).map((code) => {
              const l = langs[code];
              const isActive = code === lang;
              return (
                <button
                  key={code}
                  style={{ ...styles.item, ...(isActive ? styles.itemActive : {}) }}
                  onClick={() => { setLang(code); setOpen(false); }}
                >
                  <span style={styles.flag}>{l.flag}</span>
                  <span style={styles.itemName}>{l.name}</span>
                  {isActive ? <span style={styles.check}>✓</span> : null}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

const styles = {
  wrap: { position: "relative", display: "inline-block" },
  trigger: { display: "flex", alignItems: "center", gap: 7, padding: "7px 12px", fontSize: 13, fontWeight: 600, color: "#334155", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" },
  flag: { fontSize: 16, lineHeight: 1 },
  curName: { whiteSpace: "nowrap" },
  chevron: { fontSize: 10, color: "#94a3b8" },
  overlay: { position: "fixed", inset: 0, zIndex: 999 },
  menu: { position: "absolute", top: "calc(100% + 6px)", insetInlineEnd: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.12)", padding: 6, minWidth: 160, zIndex: 1000 },
  item: { display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", fontSize: 14, fontWeight: 600, color: "#334155", background: "transparent", border: "none", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", textAlign: "start" },
  itemActive: { background: "#eef2ff", color: "#4f46e5" },
  itemName: { flex: 1, textAlign: "start" },
  check: { color: "#4f46e5", fontWeight: 800 },
};
