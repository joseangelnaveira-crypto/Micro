// Sube preguntas (en el formato PREGUNTA/A/B/C/D/CORRECTA/EXPLICACION/FUENTE
// que ya genera convertir.py) a la tabla `questions` de Supabase.
//
// Uso:
//   npm run seed -- ruta/al/archivo-convertido.txt
//
// Necesita en .env.local: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
// (esta última es la única vez que se usa esa clave secreta: solo aquí, en tu
// ordenador, nunca en el código de la web).

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { parseQuestionsText } from '../src/lib/parse-questions';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: npm run seed -- ruta/al/archivo-convertido.txt');
    process.exit(1);
  }

  const raw = readFileSync(filePath, 'utf-8');
  const questions = parseQuestionsText(raw);
  console.log(`Encontradas ${questions.length} preguntas válidas en el archivo.`);
  if (questions.length === 0) {
    console.error('No se ha podido extraer ninguna pregunta. Revisa el formato del archivo.');
    process.exit(1);
  }

  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const chunk = questions.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('questions').insert(chunk);
    if (error) {
      console.error(`Error al insertar el lote empezando en la pregunta ${i}:`, error.message);
      process.exit(1);
    }
    inserted += chunk.length;
    console.log(`  Subidas ${inserted}/${questions.length}...`);
  }

  console.log(`Listo. ${inserted} preguntas subidas al banco compartido.`);
}

main();
