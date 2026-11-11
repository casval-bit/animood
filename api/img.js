// Fonction Vercel : /api/img?u=<adresse de l'affiche> → l'image, relayée depuis notre domaine avec l'en-tête CORS.
// Utilisée par l'export PNG de la Tierlist (voir server/imageProxy.js pour les limites de sécurité).
import { fetchImage, sendImage } from "../server/imageProxy.js";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") { res.statusCode = 405; res.end("méthode non autorisée"); return; }
  const raw = new URL(req.url, "http://localhost").searchParams.get("u");
  sendImage(res, await fetchImage(raw));
}
