// Inserta UNA pregunta de ejemplo con imagen, página de fuente y enlace, para poder ver
// cómo se ve el nuevo campo antes de decidir si se generaliza a más preguntas del banco.
// Requiere haber pegado antes la migración 00000000000004_imagen_fuente_preguntas.sql
// en el SQL Editor de Supabase (añade las columnas image_url/source_page/source_url).
//
// Uso: npm run seed:example-image
//
// La pregunta se sube con fuente "Ejemplo con imagen" (no "Murray 9ª Ed., Lote 1") para
// poder generar un examen con Fuente = "Ejemplo con imagen" y 1 pregunta, y que sea
// siempre y exactamente esta.

import { config } from 'dotenv';
config({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';

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
  const { error } = await supabase.from('questions').insert({
    question: '¿Qué prueba bioquímica sencilla se utiliza para diferenciar Staphylococcus aureus (coagulasa positiva) de Staphylococcus epidermidis y el resto de estafilococos coagulasa-negativos?',
    option_a: 'La prueba de la coagulasa',
    option_b: 'La tinción de Gram',
    option_c: 'La morfología cocácea en racimos',
    option_d: 'El crecimiento en agar sangre',
    correct: 'A',
    explanation: 'S. aureus produce coagulasa, una enzima que agrega el plasma (o lo coagula en tubo). Los estafilococos coagulasa-negativos, como S. epidermidis, no la producen. La tinción de Gram, la morfología en racimos y el crecimiento en agar sangre son comunes a ambas especies y no sirven para diferenciarlas.',
    source: 'Ejemplo con imagen',
    topic: 'Bacteriología',
    image_url: '/example-images/prueba-coagulasa.svg',
    source_page: 238,
    source_url: 'https://microbenotes.com/coagulase-test-principle-procedure-and-result-interpretation/',
  });

  if (error) {
    console.error('Error al insertar la pregunta de ejemplo:', error.message);
    process.exit(1);
  }

  console.log('Pregunta de ejemplo insertada. En la app: Generar examen -> Fuente "Ejemplo con imagen" -> 1 pregunta.');
}

main();
