# Academia de Microbiología — versión online

Esta es la primera capa del proyecto: **login seguro + aprobación manual + banco de preguntas compartido**.
El motor de examen, las estadísticas, el panel de progreso de usuarios y el modo offline se añaden en capas siguientes.

## Qué incluye ya esta capa

- Registro con Google **o** con email + contraseña.
- Toda cuenta nueva queda en estado `pending` hasta que un administrador la aprueba.
- Middleware de rutas (`src/proxy.ts`) que protege todo lo que no sea login/registro.
- Panel de administrador (`/admin`) con la lista de solicitudes pendientes, para aprobar o rechazar.
- Base de datos con seguridad a nivel de fila (RLS): cada usuario solo puede ver/editar sus propios datos;
  el banco de preguntas es de solo lectura para todos salvo el administrador.
- **Motor de examen completo**: generar examen (por fuente/tema/número de preguntas), corrección al instante,
  marcar preguntas, cronómetro, resultados con nota de corte, repaso de falladas/marcadas.
- **Sin repetir innecesariamente**: prioriza preguntas nunca vistas o vistas hace más tiempo.
- **Progreso guardado**: si sales a mitad de examen, puedes continuar más tarde desde donde lo dejaste.
- **Historial de exámenes** en la nube, con opción de repetir cualquiera exacto.
- **Estadísticas de estudio** con gráfica de evolución (nota por examen + media móvil) y temas con más fallos.
- **Repaso inteligente**: genera un examen priorizando las preguntas que más fallas.
- **Buscador** en todo el banco de preguntas.
- **Modo oscuro**.

Nota importante: como el progreso guardado y las preferencias (modo oscuro, etc.) se guardan en el navegador
de cada dispositivo, si sales de un examen a medias en el ordenador no podrás continuarlo desde el móvil —
solo el resultado final y el historial se sincronizan entre dispositivos. Esto se resolverá en la capa de
modo offline/sincronización, pendiente de construir.

Tienes dos formas de probarlo. Elige una:

- **Opción A — 100% local con Docker**: nada de cuentas online, la base de datos y el login corren en tu
  propio ordenador. Es la que te recomiendo mientras solo lo estás probando tú.
- **Opción B — Supabase en la nube**: más sencillo de arrancar (no instalas nada aparte de Node), pero implica
  crear una cuenta gratuita en supabase.com. Necesario de todas formas cuando quieras que otras personas puedan
  entrar desde fuera de tu ordenador.

---

## Opción A: 100% local con Docker (sin cuentas online)

### A.1 Instala Docker Desktop

Descárgalo gratis desde [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
e instálalo. Al abrirlo, si te pide iniciar sesión, puedes normalmente saltarlo ("Skip sign in" / continuar sin
cuenta) — solo hace falta que el motor de Docker esté encendido en segundo plano, no necesitas una cuenta activa
para usarlo en local.

### A.2 Arranca el stack local de Supabase

Dentro de la carpeta del proyecto:

```bash
npm install
npx supabase start
```

La primera vez tarda varios minutos (descarga las imágenes de Docker). Al terminar, verás algo así en la terminal:

```
API URL: http://127.0.0.1:54321
anon key: eyJhbGciOi...
service_role key: eyJhbGciOi...
Studio URL: http://127.0.0.1:54323
```

Este comando aplica automáticamente el esquema de base de datos (`supabase/migrations/`), no hace falta
que pegues nada a mano en ningún sitio.

### A.3 Configura las variables de entorno

```bash
cp .env.local.example .env.local
```

Edita `.env.local` y pega el `API URL` como `NEXT_PUBLIC_SUPABASE_URL`, y el `anon key` como
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (los que te ha dado el paso anterior, no los de una cuenta online).

### A.4 Arranca la aplicación

```bash
npm run dev
```

Abre `http://localhost:3000`, regístrate con tu email y contraseña (Google no funcionará en local salvo que
configures credenciales OAuth reales, pero no lo necesitas para probar la app).

### A.5 Conviértete en administrador

Abre `http://127.0.0.1:54323` (Supabase Studio, el panel de administración de tu base de datos local, también
corre en tu ordenador) → **SQL Editor** → ejecuta:

```sql
update public.profiles
  set role = 'admin', status = 'approved', approved_at = now()
  where email = 'tu-email@ejemplo.com';
```

Recarga `http://localhost:3000`: ya tienes acceso y verás el enlace al panel de administrador.

### A.6 Parar y volver a arrancar

```bash
npx supabase stop     # para todo cuando termines
npx supabase start    # lo vuelve a levantar más tarde, con tus datos intactos
```

---

## Opción B: Supabase en la nube (necesaria para desplegarlo con una URL real)

### 1. Crear el proyecto de Supabase (gratuito)

1. Ve a [supabase.com](https://supabase.com) → "Start your project" → crea una cuenta gratuita.
2. "New project". Elige nombre, contraseña de base de datos (guárdala) y región (Europa si puedes, por latencia).
3. Cuando el proyecto esté listo, ve a **Project Settings → API** y copia:
   - `Project URL`
   - clave `anon public`
   - clave `service_role` (¡secreta, no la publiques nunca!)
4. Ve a **SQL Editor** → pega el contenido completo de `supabase/migrations/00000000000001_esquema_inicial.sql`
   de este proyecto → **Run**.
5. Repite lo mismo con `supabase/migrations/00000000000002_indices_busqueda.sql` (mejora el rendimiento del
   buscador; opcional pero recomendado).
6. Repite lo mismo con `supabase/migrations/00000000000003_conteo_banco.sql` (**esta es imprescindible**:
   sin ella, los contadores de "preguntas en el banco" se quedan mal calculados en bancos de más de 1000
   preguntas, por un límite de Supabase).

### 2. Activar el login con Google (opcional pero recomendado)

1. En Supabase: **Authentication → Providers → Google** → actívalo.
2. Necesitas un Client ID y Client Secret de Google. Se crean en
   [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → "Create OAuth client ID" → tipo
   "Web application" → en "Authorized redirect URIs" pon la URL que te muestra Supabase en esa misma pantalla
   (algo como `https://TU-PROYECTO.supabase.co/auth/v1/callback`).
3. Pega el Client ID y Secret en Supabase y guarda.

Si de momento no quieres configurar Google, no pasa nada: el registro con email+contraseña funciona igual, y el
botón de Google simplemente dará un error hasta que lo actives.

### 3. Configurar el proyecto en tu ordenador

```bash
npm install
cp .env.local.example .env.local
```

Edita `.env.local` y rellena con los tres valores del paso 1.

```bash
npm run dev
```

Abre `http://localhost:3000`. Regístrate una vez (con tu propio email o Google) para crear tu cuenta.

### 4. Convertirte en el primer administrador

Tras registrarte, tu cuenta está en `pending` como la de cualquiera — nadie puede autoaprobarse desde la app,
así que este primer paso se hace directamente en la base de datos:

En Supabase → **SQL Editor**, ejecuta (cambiando el email por el tuyo):

```sql
update public.profiles
  set role = 'admin', status = 'approved', approved_at = now()
  where email = 'tu-email@ejemplo.com';
```

Recarga la aplicación: ya deberías entrar directamente y ver el enlace "Panel de administrador".

### 5. Desplegarlo con una URL real (Vercel, gratuito)

1. Sube este proyecto a un repositorio de GitHub (puede ser privado).
2. Ve a [vercel.com](https://vercel.com) → inicia sesión con GitHub → "Add New… → Project" → elige el repositorio.
3. En "Environment Variables" añade las mismas tres variables de `.env.local`.
4. Deploy. En un par de minutos tienes una URL pública (`tu-proyecto.vercel.app`).
5. Vuelve a Supabase → **Authentication → URL Configuration** → añade esa URL como "Site URL" y en
   "Redirect URLs" (para que el login con Google/email funcione también en producción, no solo en local).

## Siguientes capas (pendientes)

- Migrar el banco de 4837 preguntas a la tabla `questions` (script `scripts/seed-questions.ts`, aún no incluido).
- Motor de examen (generar examen, responder, resultados, marcar preguntas, cronómetro) — puerto de la lógica
  de `banco-preguntas.html`.
- Estadísticas y gráfica de evolución.
- Panel de admin: ver progreso de cada usuario, importar nuevos lotes de preguntas desde la web.
- Modo offline con sincronización automática al recuperar conexión.

