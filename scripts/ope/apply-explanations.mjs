// Guarda en Supabase las explicaciones (y la página del Murray 9.ª ed.) de un .jsonl con líneas
// {"id": "...", "page": 232 | null, "expl": "..."}.  Uso (desde la raíz del repo):
//   node --env-file=.env.local scripts/ope/apply-explanations.mjs scripts/ope/explicaciones.jsonl
// Usa la clave service_role (solo en tu ordenador). Solo toca las columnas explanation y source_page.
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
      body: JSON.stringify({ explanation: r.expl, source_page: r.page ?? null }),
    });
    if (res.ok) ok++; else { fail++; console.error('ERROR', r.id, res.status, await res.text()); }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`Guardadas ${ok} explicaciones${fail ? `, ${fail} con error` : ''}.`);
