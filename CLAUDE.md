# Academia de Microbiología — contexto del proyecto

Aplicación de examen tipo test para preparación OPE de Microbiología, con banco de preguntas
compartido y progreso privado por usuario. Nace como evolución de un archivo HTML offline
(`banco-preguntas.html`, no forma parte de este repo, se conserva aparte como respaldo).

## Stack

- Next.js 16 (App Router, Server Actions, Turbopack)
- Supabase (Postgres + Auth + RLS) — base de datos y login
- Tailwind CSS v4 + shadcn/ui (Radix UI primitives) — migración completada, ver abajo
- Desplegado en Vercel, código en GitHub (subido manualmente vía la web de GitHub, no git CLI)

## Qué hace la app

- Registro con Google o email/contraseña. Toda cuenta nueva queda `pending` hasta que el
  administrador la aprueba manualmente desde `/admin`.
- Banco de preguntas compartido (actualmente 4837 preguntas del Murray 9ª Ed., Lote 1),
  solo el admin puede importarlas/gestionarlas (`/admin/questions`).
- Motor de examen: generar examen (filtro fuente/tema/nº preguntas), corrección al instante,
  marcar preguntas, cronómetro, resultados con nota de corte, repaso de falladas/marcadas,
  repaso inteligente (prioriza lo que más falla), progreso guardado en localStorage si sales
  a medias.
- Ciclo de no-repetición: las preguntas se ordenan por `question_stats.last_seen_at` (nulls
  primero = nunca vistas). **Importante**: esa marca de tiempo SOLO se actualiza cuando el
  examen se completa de verdad (aparece en el historial) y era un examen "normal" (no un
  repaso/repetición) — ver `finishExam()` en `src/app/dashboard/actions.ts`, parámetro
  `affectsCycle`.
- Estadísticas de estudio con gráfica de evolución (SVG hecho a mano, sin librería de gráficos).
- Panel de administrador: aprobar/rechazar usuarios, ver progreso de todos (solo el admin, los
  usuarios no se ven entre sí), gestionar banco de preguntas.
- Modo offline (PWA instalable): banco de preguntas y estadísticas cacheados en IndexedDB,
  se pueden hacer/terminar exámenes sin conexión y los resultados se sincronizan solos al
  recuperarla. Ver sección propia más abajo.

## Decisiones de arquitectura importantes (no deshacer sin motivo)

- **Nunca usar `.select()` sin paginar en tablas grandes**: Supabase/PostgREST limita a 1000
  filas por consulta por defecto. Para conteos usamos la función de Postgres
  `question_bank_breakdown()` (agrupa dentro de la BD). Para listas de IDs completas usamos
  el helper `fetchAllIds()` en `src/lib/fetch-all.ts`, que pagina en bloques de 1000.
- El ciclo de no-repetición y las estadísticas de acierto son cosas separadas aunque viven en
  la misma tabla `question_stats` — no volver a fusionarlas sin querer (ya pasó una vez).
- Migraciones de Supabase en `supabase/migrations/`, numeradas. Cada una hay que pegarla a
  mano en el SQL Editor de Supabase (no hay CI/CD conectado a la base de datos).

## Migración a Tailwind + shadcn/ui (COMPLETADA)

Toda la app usa ya los componentes de `src/components/ui/` (Button, Card, Input, Textarea,
Label, Select, Dialog, Badge, Separator, Table — todos escritos a mano, no por la CLI de
shadcn porque el entorno donde se crearon no tenía acceso a `ui.shadcn.com`):

- `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/app/pending/page.tsx`,
  `src/components/SignOutButton.tsx`.
- `src/app/dashboard/DashboardApp.tsx` — pantalla de inicio, examen, resultados; el modal de
  confirmación propio se sustituyó por el `Dialog` de shadcn; la gráfica de tendencia (SVG
  hecho a mano) se mantiene tal cual, con sus propias clases en `globals.css` (`.trend-*`).
- `src/app/admin/layout.tsx`, `src/app/admin/page.tsx` (+ `ApprovalList.tsx`),
  `src/app/admin/users/page.tsx` (tabla con el componente `Table`),
  `src/app/admin/questions/page.tsx` (+ `QuestionsAdmin.tsx`).

`globals.css` ya no tiene el sistema de clases CSS antiguo (`.card`, `.option`, `button`
genérico, etc.) — solo quedan las variables de paleta/shadcn, el fondo decorativo del `body`
y las clases `.trend-*` de la gráfica de evolución. Si se añade una pantalla nueva, usar
directamente los componentes de `src/components/ui/` + utilidades de Tailwind, manteniendo la
paleta actual (variables de shadcn en `globals.css`: `--primary`, `--secondary`,
`--destructive`, `--success`, `--warning`, etc. — no inventar colores nuevos). Iconos con
`lucide-react` (ya instalado) o los propios de `src/components/Icons.tsx`.

**Cuidado con reglas CSS sin `@layer`**: cualquier regla de `globals.css` que no esté dentro
de un `@layer` (p. ej. si en el futuro se añade una regla suelta sobre una etiqueta como
`button` o `input`) tiene prioridad sobre TODAS las utilidades de Tailwind sin importar su
especificidad, por las reglas de cascade layers de CSS. Ya pasó una vez (una regla `button{...}`
sin capa pisaba las variantes `ghost`/`secondary`/etc. de todos los `Button` de shadcn — se
diagnosticó y arregló en esta migración). Evitar selectores de etiqueta sueltos fuera de
`@layer`; si hace falta uno para algo no migrado, excluir los componentes shadcn con
`:not([data-slot])` (todos los primitivos de `src/components/ui/` llevan `data-slot`).

## Modo offline / PWA instalable (COMPLETADO)

PWA completa (no solo caché de datos): se puede cerrar la pestaña/navegador sin conexión y
volver a abrir la app igual. Piezas clave:

- **Sin `next-pwa`/`@serwist`**: el build de producción de este proyecto usa Turbopack
  (`next build` muestra "▲ Next.js ... (Turbopack)"), y esas librerías asumen hooks de
  compilación webpack para generar el manifest de precache. En su lugar, `public/sw.js` es un
  service worker escrito a mano con caché "sobre la marcha" (runtime caching): cache-first
  para `/_next/static/*` (nombres con hash, inmutables), network-first-con-fallback-a-caché
  para peticiones de documento (`/dashboard`, clave porque esa página hace una consulta a
  Supabase obligatoria y es la única forma de que abra en frío sin conexión), y bypass total
  para cualquier request que no sea GET (las Server Actions son POST a la misma URL) o de
  otro origin (Supabase). Subir a mano `STATIC_CACHE`/`DOC_CACHE` en `public/sw.js` cuando
  haga falta invalidar una versión antigua.
- `public/manifest.json` con `start_url: "/dashboard"` (evita el round trip extra de `/`).
- **Iconos de `public/icons/*.png` son un placeholder** (cuadrado sólido del color de marca
  `#241E3D`, generado con `scripts/generate-pwa-icons.js` usando solo `zlib` de Node, sin
  añadir sharp/canvas) — sustituir por arte real cuando haya diseño definitivo.
- `src/lib/offline/db.ts` (IndexedDB vía el paquete `idb`): cachea `questions`,
  `question_stats` del usuario, una cola `pending_attempts` y un `kv` con `cachedUserId` para
  no mezclar datos entre cuentas en un dispositivo compartido.
- `src/lib/exam-utils.ts` centraliza `shuffle()`, `scoreAttempt()` y `applyAttemptToStats()`
  para que el motor de examen online (`src/app/dashboard/actions.ts`) y el offline
  (`src/lib/offline/exam-engine.ts`) nunca diverjan (mismo tipo de bug que ya pasó una vez con
  `question_stats`, ver arriba).
- `src/lib/offline/sync.ts`: al recuperar conexión sincroniza la cola llamando al `finishExam`
  real; un intento duplicado (mismo `client_uuid`, violación de unicidad `23505`) se trata
  como ya sincronizado en vez de error — por eso existe `exam_attempts.client_uuid unique`.
- Alcance a propósito: "Estadísticas de estudio" e "Historial" muestran el último dato
  conocido del servidor offline (no se recalculan desde la caché); `/admin/*` no tiene
  soporte offline. Sin aviso de "hay una versión nueva, ¿recargar?" para el SW todavía.

## Reportar errores en preguntas y recordatorios por inactividad (COMPLETADO)

- **Reportar error**: botón en la pantalla de examen (junto a "Marcar") que guarda
  `pregunta + motivo` en `question_reports` (tabla nueva, RLS: cualquier aprobado inserta
  las suyas, solo el admin las lee/gestiona). El admin las revisa en `/admin/questions`
  ("Errores reportados") y las marca resueltas — no toca el flujo de examen del usuario.
  Distinto de "Marcar", que es solo repaso personal y no llega al admin.
- **Recordatorios por inactividad**: notificaciones Web Push reales (no solo la UI).
  - `src/lib/push-client.ts` (cliente) + `src/app/dashboard/push-actions.ts` (guarda la
    suscripción en `push_subscriptions`). Botón de campana en la cabecera del dashboard.
  - `public/sw.js` ya escucha `push`/`notificationclick`.
  - `src/app/api/send-reminders/route.ts`: lo llama el cron de Vercel (`vercel.json`, una
    vez al día) protegido por `CRON_SECRET`. Avisa a usuarios aprobados con más de 3 días
    sin completar un examen y que tengan notificaciones activadas, sin repetir el aviso
    en menos de 3 días (cooldown vía `profiles.last_reminder_sent_at`).
  - Necesita variables de entorno propias en Vercel (no solo en `.env.local`):
    `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`
    (generadas con `npx web-push generate-vapid-keys --json`).
  - `src/proxy.ts` excluye `/api/` del guard de autenticación -- si no, el cron (sin sesión
    de usuario) sería redirigido a `/login` en vez de llegar a la ruta.

## Posiblemente pendiente

- Penalización por fallo configurable, cuenta atrás con tiempo límite real de examen, cuenta
  atrás hacia la fecha de la convocatoria.

## Cómo se prueba

- Local: `.env.local` con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (las
  claves públicas, nunca la `service_role` fuera de `scripts/seed-questions.ts`), luego
  `npm install && npm run dev`.
- El primer administrador se promociona a mano vía SQL en Supabase (ver `README.md`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
