// Guarda SOLO source_page (no toca la explicación) desde un .jsonl {"id","page"}.
// Uso:  node --env-file=.env.local scripts/ope/apply-pages.mjs scripts/ope/paginas-murray.jsonl
import { readFileSync } from 'fs';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const rows = readFileSync(process.argv[2], 'utf-8').split('\n').filter(Boolean).map(l => JSON.parse(l));
let ok = 0, fail = 0;
const queue = [...rows];
async function worker() {
  while (queue.length) {
    const r = queue.shift();
    const res = await fetch(`${url}/rest/v1/questions?id=eq.${r.id}`, {
      method: 'PATCH',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ source_page: r.page }),
    });
    if (res.ok) ok++; else { fail++; console.error('ERROR', r.id, res.status); }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`Páginas guardadas: ${ok}${fail ? `, ${fail} con error` : ''}.`);
