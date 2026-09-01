-- Añade soporte opcional de imagen y de cita de fuente (página del libro + enlace de
-- ampliación) a las preguntas. Todo nullable: no afecta a ninguna de las preguntas ya
-- existentes en el banco, que simplemente no mostrarán estos campos hasta que se rellenen.

alter table questions
  add column if not exists image_url text,
  add column if not exists source_page int,
  add column if not exists source_url text;
