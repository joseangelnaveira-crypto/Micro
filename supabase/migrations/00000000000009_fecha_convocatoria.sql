-- Fecha objetivo de la convocatoria (opcional, por usuario). Se usa en el dashboard
-- para mostrar una cuenta atrás "faltan X días" y para dimensionar el ritmo de estudio.

alter table public.profiles add column if not exists exam_date date;
