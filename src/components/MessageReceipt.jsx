// ─── DM receipt under the sender's last bubble — Envoyé ✓ / Vu ✓✓ / Lu ✓✓ ─────
// Three stages, each backed by a server-side column on direct_messages:
//   sent      → row exists
//   delivered → delivered_at, stamped by the recipient's background poll (AppProvider)
//   read      → read_at, stamped when the recipient opens the thread
// read_at implies delivered even if delivered_at was never set (e.g. the
// recipient opened the thread before their first poll ran).

function receiptStatus(m) {
  if(m.read_at) return "read";
  if(m.delivered_at) return "delivered";
  return "sent";
}

// "14:32" today, "12/09 14:32" otherwise — short enough for a 9px caption.
function readTime(iso, lang) {
  const d = new Date(iso);
  const locale = lang === "en" ? "en-GB" : "fr-FR";
  const time = d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if(d.toDateString() === new Date().toDateString()) return time;
  return `${d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit" })} ${time}`;
}

function Ticks({ double }) {
  return (
    <svg width={double ? 14 : 10} height="10" viewBox={double ? "0 0 22 14" : "0 0 16 14"} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1.5 7.5l4 4L14 2.5" />
      {double && <path d="M9.5 11.5L20 2.5" />}
    </svg>
  );
}

// `t` needs sent / delivered / read(time) labels (chatBubbleI18n / chatModalI18n).
export function MessageReceipt({ message, t, lang }) {
  const status = receiptStatus(message);
  const label = status === "read" ? t.read(readTime(message.read_at, lang))
              : status === "delivered" ? t.delivered
              : t.sent;
  return (
    <span className="inline-flex items-center gap-1" style={status === "read" ? { color: "#7dd3fc" } : undefined}>
      <Ticks double={status !== "sent"} />
      {label}
    </span>
  );
}
