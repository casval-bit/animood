// ─── Lecture d'une longue liste page par page (l'API ne rend que 1 000 lignes à la fois) ──────────────────────────────────────────────────────
// Pur : la lecture d'une page est passée en paramètre (api/voteActivity.js lui donne la requête), donc testable sans réseau.

/**
 * Lit les pages l'une après l'autre (décalage 0, pageSize, 2 × pageSize…) jusqu'à une page incomplète ou `maxPages` pages. Ne rejette jamais.
 * @param {(offset: number) => Promise<any[]>} fetchPage
 * @param {{ pageSize?: number, maxPages?: number }} [opts]
 * @returns {Promise<{ items: any[], failed: boolean, truncated: boolean }>}
 *   failed    : une page n'a pas pu être lue — on garde ce qui a été lu avant
 *   truncated : les `maxPages` pages étaient pleines : il reste peut-être des lignes
 */
export async function readPages(fetchPage, { pageSize = 1000, maxPages = 3 } = {}) {
  const items = [];
  for (let page = 0; page < maxPages; page++) {
    let rows;
    try { rows = await fetchPage(page * pageSize); } catch { return { items, failed: true, truncated: false }; }
    const list = Array.isArray(rows) ? rows : [];
    for (const row of list) items.push(row);
    if (list.length < pageSize) return { items, failed: false, truncated: false };
  }
  return { items, failed: false, truncated: true };
}
