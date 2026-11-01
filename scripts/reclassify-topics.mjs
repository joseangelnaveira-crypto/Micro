// Reclasifica las preguntas que quedaron en «General / otros» con una lista de términos
// mucho más amplia (géneros, especies, términos de laboratorio y bioseguridad), sin acentos.
// Solo toca esas preguntas (no cambia el tema de las ya clasificadas).
// Uso (raíz del repo):  node --env-file=.env.local scripts/reclassify-topics.mjs [--apply]
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const apply = process.argv.includes('--apply');
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

const norm = s => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const TOPICS = {
  'Virología': 'virus viral viriones retrovirus vih sida hepatitis herpes varicela zoster sarampion rubeola parotid influenza gripe papiloma poliovirus polio rabia dengue zika chikungunya ebola marburg filovirus coronavirus sars mers rotavirus norovirus astrovirus adenovirus citomegalovirus cmv epstein vhs vvz vhb vhc vhd vhe htlv arbovirus arenavirus bunyavirus flavivirus togavirus parvovirus enterovirus rinovirus toscana nilo occidental crimea-congo coriomeningitis orthopox viruela poxvirus prion polioma jc bk hpv vph bacteriofago capside genoma vacunal'.split(' '),
  'Micología': 'hongo fungic micosis candida aspergill criptococ cryptococc dermatofit levadura micelio hifa conidio ergosterol azol equinocandina anfotericina histoplasma coccidioid blastomyc mucor mucorales rhizopus esporotric sporothrix fusarium scedosporium pneumocystis tinea tina trichophyton microsporum epidermophyton malassezia pitiriasis cromoblastomicosis micetoma saccharomyces auris galactomanano glucano'.split(' '),
  'Parasitología': 'parasit protozo helminto plasmodium malaria giardia entamoeba ameba amebiasis toxoplasma leishmania trypanosoma tripanosom chagas tenia taenia cestodo nematodo trematodo ascaris uncinaria ancylostoma necator esquistosom schistosoma filaria wuchereria brugia onchocerca loa strongyloides trichuris enterobius oxiuro echinococcus hidatid ooquiste trofozoito quiste trichinella anisakis pediculosis sarna sarcoptes garrapata flebotomo triatomino babesia cryptosporidium cyclospora cystoisospora isospora blastocystis balantidium trichomonas dientamoeba fasciola opisthorchis paragonimus clonorchis dracunculus diphyllobothrium hymenolepis dipylidium acanthamoeba naegleria demodex tunga cisticerc'.split(' '),
  'Inmunología': 'linfocito anticuerpo inmunidad complemento citocina citoquina interferon interleucina mhc hla inmunoglobulina macrofago fagocit autoinmun hipersensibilidad opsoniz neutrofilo celula dendritica toll tlr inmunodeficiencia'.split(' '),
  'Antimicrobianos y resistencias': 'antibiotico resistencia betalactamasa blee ampc carbapenem carbapenemasa vancomicina aminoglucosid quinolona fluoroquinolona cmi concentracion minima inhibitoria antifungico antiviral antimicrobian sensibilidad antibiotica proa fosfomicina colistina linezolid daptomicina cefalosporina penicilina macrolido tetraciclina rifampicina isoniacida pirazinamida ceftazidima avibactam meropenem aztreonam cefiderocol sinergia pk/pd farmacodinam ecoff eucast clsi bactericida bacteriostatic'.split(' '),
  'Diagnóstico y técnicas de laboratorio': 'pcr cultivo tincion gram maldi serolog elisa microscopia antigenuria hemocultivo antibiograma western blot inmunocromatografia biopsia carga viral secuenciacion ngs muestra transporte medio agar tcbs macconkey bcye chocolate sabouraud inmunofluorescencia aglutinacion fijacion complemento valor predictivo sensibilidad especificidad kit prueba rapida metagenomic cromogenic'.split(' '),
  'Control de infección y esterilización': 'esterilizacion,desinfeccion,desinfectante,autoclave,bioseguridad,nosocomial,aislamiento,higiene de manos,descontaminacion,antisepsia,cabina de seguridad,iso 15189,acreditacion,lejia,clorado,glutaraldehido,clorhexidina,precauciones estandar,sustancias de categoria,iras,vigilancia epidemiologica'.split(','),
  'Bacteriología': 'bacteri gramnegativ grampositiv coco bacilo toxina pared celular peptidoglicano endospora staphylococcus streptococcus escherichia klebsiella pseudomonas neisseria salmonella shigella listeria clostridi mycobacteri micobacteri legionella helicobacter chlamydia treponema vibrio campylobacter bordetella haemophilus enterococc acinetobacter burkholderia stenotrophomonas bartonella brucella francisella coxiella rickettsia borrelia leptospira mycoplasma ureaplasma nocardia actinomyces corynebacter bacteroides fusobacter prevotella yersinia proteus enterobacter serratia citrobacter aeromonas plesiomonas pasteurella eikenella kingella moraxella capnocytophaga bacillus anthracis carbunco tuberculosis lepra operon plasmido conjugacion transposon cromosoma bacteriano'.split(' '),
};

function classify(q) {
  const title = norm(q.question);
  const rest = norm([q.option_a, q.option_b, q.option_c, q.option_d, q.explanation].join(' '));
  let best = null, bestScore = 0;
  for (const [topic, kws] of Object.entries(TOPICS)) {
    let score = 0;
    for (const kw of kws) {
      // los términos cortos (<=4 letras: pcr, vih, cmv...) solo cuentan como palabra completa
      const re = kw.length <= 4 ? new RegExp(`\b${kw}\b`) : null;
      const inTitle = re ? re.test(title) : title.includes(kw);
      const inRest = re ? re.test(rest) : rest.includes(kw);
      if (inTitle) score += 3;
      if (inRest) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = topic; }
  }
  return bestScore >= 2 ? best : null;
}

const res = await fetch(`${url}/rest/v1/questions?select=id,question,option_a,option_b,option_c,option_d,explanation&topic=eq.${encodeURIComponent('General / otros')}&limit=2000`, { headers: H });
const rows = await res.json();
const counts = {}; const changes = [];
for (const q of rows) {
  const t = classify(q);
  if (t) { changes.push({ id: q.id, topic: t }); counts[t] = (counts[t] ?? 0) + 1; }
}
console.log(`${rows.length} en «General / otros»; reclasificables: ${changes.length}`, counts);
if (!apply) { console.log('(simulación; usa --apply para guardar)'); process.exit(0); }
let ok = 0;
const queue = [...changes];
async function worker() {
  while (queue.length) {
    const c = queue.shift();
    const r = await fetch(`${url}/rest/v1/questions?id=eq.${c.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ topic: c.topic }) });
    if (r.ok) ok++; else console.error('ERROR', c.id, r.status);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`Actualizadas ${ok}.`);
