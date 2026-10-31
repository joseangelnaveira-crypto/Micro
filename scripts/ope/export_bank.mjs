import { writeFileSync } from 'fs';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const out = [];
for (let from = 0; ; from += 1000) {
  const r = await fetch(`${url}/rest/v1/questions?select=id,question,option_a,option_b,option_c,option_d,correct,source&order=id&offset=${from}&limit=1000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) { console.error(r.status, await r.text()); process.exit(1); }
  const rows = await r.json(); out.push(...rows);
  if (rows.length < 1000) break;
}
writeFileSync(process.argv[2], JSON.stringify(out));
console.log('preguntas en el banco:', out.length);
