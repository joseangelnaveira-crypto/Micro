-- Guarda si un intento de examen contaba para el ciclo de no-repetición (examen normal)
-- o no (repaso de falladas/marcadas, repaso inteligente, repetición). Antes solo se
-- aplicaba el efecto en el momento y no quedaba registrado -- hace falta saberlo después
-- para poder deshacerlo correctamente si se borra el examen del historial.
-- Los intentos ya existentes se asumen `true` (la inmensa mayoría son exámenes normales);
-- es una aproximación razonable solo para el historial previo a esta columna.

alter table exam_attempts
  add column if not exists affects_cycle boolean not null default true;
