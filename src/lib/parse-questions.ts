export type ParsedQuestion = {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct: string;
  explanation: string;
  source: string;
  topic: string;
};

const TOPIC_KEYWORDS: [string, string[]][] = [
  ['Virología', ['virus','viral','viriones','retrovirus','vih','sida','hepatitis','herpes','varicela','zóster','sarampión','rubéola','influenza','gripe','papiloma','poliovirus','rabia','dengue','zika','chikungunya','ébola','marburg','filovirus','coronavirus','sars','mers','rotavirus','adenovirus','citomegalovirus','cmv','epstein-barr','vpn','arbovirus','arenavirus','bunyavirus','flavivirus','retrotranscriptasa']],
  ['Micología', ['hongo','hongos','fúngic','micosis','candida','aspergillus','criptococo','cryptococcus','dermatofito','levadura','micelio','hifas','conidios','ergosterol','azol','equinocandina','anfotericina','histoplasma','coccidioides','blastomyces','mucor','esporotricosis']],
  ['Parasitología', ['parásito','parasitosis','protozoo','helminto','plasmodium','malaria','giardia','entamoeba','ameba','amebiasis','toxoplasma','leishmania','leishmaniasis','trypanosoma','chagas','tenia','cestodo','áscaris','uncinaria','esquistosoma','filaria','ooquiste','trofozoíto','quiste','triquina','anisakis','pediculosis','sarna','garrapata','flebótomo']],
  ['Inmunología', ['linfocito','anticuerpo','inmunidad','complemento','citocina','citoquina','interferón','interleucina','mhc','antígeno hla','inmunoglobulina','macrófago','fagocit','vacuna','autoinmun','hipersensibilidad','opsoniz']],
  ['Antimicrobianos y resistencias', ['antibiótico','resistencia','betalactamasa','ble a','carbapenem','vancomicina','aminoglucósido','quinolona','fluoroquinolona','cmi','concentración mínima inhibitoria','antifúngico','antivírico','antiviral','tratamiento antimicrobiano','sensibilidad antibiótica','mecanismo de resistencia']],
  ['Diagnóstico y técnicas de laboratorio', ['pcr','cultivo','tinción','gram','maldi-tof','serología','elisa','microscopía','antígeno urinario','hemocultivo','antibiograma','western blot','inmunocromatografía','biopsia','carga viral','secuenciación']],
  ['Control de infección y esterilización', ['esterilización','desinfección','autoclave','bioseguridad','nosocomial','aislamiento','higiene de manos','descontaminación','antisepsia']],
  ['Bacteriología', ['bacteria','bacterias','gramnegativ','grampositiv','cocos','bacilo','toxina','pared celular','peptidoglicano','endospora','staphylococcus','streptococcus','escherichia','klebsiella','pseudomonas','neisseria','salmonella','shigella','listeria','clostridium','mycobacterium','legionella','helicobacter','chlamydia','treponema','vibrio','campylobacter','bordetella','haemophilus']],
];

export function classifyTopic(text: string): string {
  const lower = text.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;
  for (const [topic, keywords] of TOPIC_KEYWORDS) {
    let score = 0;
    for (const kw of keywords) if (lower.includes(kw)) score++;
    if (score > bestScore) { bestScore = score; best = topic; }
  }
  return best || 'General / otros';
}

/**
 * Parsea texto en el formato:
 *   PREGUNTA: ...
 *   A) ...
 *   B) ...
 *   C) ...
 *   D) ...
 *   CORRECTA: X
 *   EXPLICACION: ...
 *   FUENTE: ... (opcional; si no está, se usa defaultSource)
 *   ====
 * (el mismo formato que ya genera convertir.py)
 */
export function parseQuestionsText(raw: string, defaultSource?: string): ParsedQuestion[] {
  const blocks = raw.split(/\n\s*={3,}\s*\n/).map(b => b.trim()).filter(Boolean);
  const questions: ParsedQuestion[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    let question = '', a = '', b = '', c = '', d = '', correct = '', explanation = '', source = '';
    for (const rawLine of lines) {
      const line = rawLine.trim();
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^PREGUNTA:\s*(.*)$/i))) question = m[1].trim();
      else if ((m = line.match(/^A\)\s*(.*)$/))) a = m[1].trim();
      else if ((m = line.match(/^B\)\s*(.*)$/))) b = m[1].trim();
      else if ((m = line.match(/^C\)\s*(.*)$/))) c = m[1].trim();
      else if ((m = line.match(/^D\)\s*(.*)$/))) d = m[1].trim();
      else if ((m = line.match(/^CORRECTA:\s*([A-Da-d])/i))) correct = m[1].toUpperCase();
      else if ((m = line.match(/^EXPLICACION:\s*(.*)$/i))) explanation = m[1].trim();
      else if ((m = line.match(/^FUENTE:\s*(.*)$/i))) source = m[1].trim();
    }
    if (!question || !a || !b || !c || !d || !correct) continue;
    const topic = classifyTopic(`${question} ${a} ${b} ${c} ${d} ${explanation}`);
    questions.push({
      question, option_a: a, option_b: b, option_c: c, option_d: d,
      correct, explanation, source: source || defaultSource || 'Sin especificar', topic,
    });
  }
  return questions;
}
