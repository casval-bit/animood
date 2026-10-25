// Liste de VPN proposés (liens officiels, aucun partenariat) — partagée entre Paramètres et la barre « Regarder sur ».
export const VPNS = [
  { name: "ProtonVPN", url: "https://protonvpn.com", color: "#6d4aff", note: { fr: "Offre gratuite, sans limite de données", en: "Free plan, no data cap" } },
  { name: "NordVPN", url: "https://nordvpn.com", color: "#4687ff", note: { fr: "Très grand choix de pays", en: "Huge choice of countries" } },
  { name: "CyberGhost", url: "https://www.cyberghostvpn.com", color: "#ffcc00", note: { fr: "Serveurs dédiés au streaming", en: "Streaming-optimised servers" } },
  { name: "Urban VPN", url: "https://www.urban-vpn.com", color: "#22c55e", note: { fr: "Gratuit (extension / appli)", en: "Free (extension / app)" } },
];
export const openExternalUrl = (url) => { try { window.animood.openExternal(url); } catch { window.open(url, "_blank", "noopener,noreferrer"); } };
