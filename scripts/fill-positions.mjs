// Rellena questions.position (orden original dentro de cada examen OPE) a partir de
// scripts/ope/posiciones.json ({ id: nº de pregunta en el examen }). Requiere la migración 10.
// Uso (raíz del repo):  node --env-file=.env.local scripts/fill-positions.mjs
import { readFileSync } from 'fs';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
const probe = await fetch(`${url}/rest/v1/questions?select=position&limit=1`, { headers: H });
if (!probe.ok) { console.error('La columna «position» no existe: aplica antes la migración 00000000000010 en Supabase.'); process.exit(1); }
const pos = JSON.parse(readFileSync(new URL('./ope/posiciones.json', import.meta.url), 'utf-8'));
const queue = Object.entries(pos);
let ok = 0, fail = 0;
async function worker() {
  while (queue.length) {
    const [id, position] = queue.shift();
    const r = await fetch(`${url}/rest/v1/questions?id=eq.${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ position }) });
    if (r.ok) ok++; else { fail++; console.error('ERROR', id, r.status); }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`Posiciones guardadas: ${ok}${fail ? `, ${fail} con error` : ''}.`);
