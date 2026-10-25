# Plan de trabajo — "El Rival Más Débil" (trivia multiplayer)

> **Estado:** implementación completada en Supabase y frontend; pendiente el despliegue en Netlify.
> **Este archivo es la fuente de verdad.** Si se reinicia la sesión de OpenCode, continuar desde la sección “Estado de implementación”.

---

## Estado de implementación (2026-10-25)

### Completado

- [x] MCP de Supabase configurado y autenticado.
- [x] Proyecto Supabase creado/verificado: `aaojioxhupihfgqfiken`.
- [x] Esquema, índices, RLS, RPC y seguridad aplicados.
- [x] **1.050 preguntas** generadas, validadas y cargadas:
  - 350 cultura general.
  - 350 videojuegos.
  - 350 series de los 90.
  - 0 errores del validador.
- [x] Edge Function `api` desplegada (versión 3) con `verify_jwt = false`.
- [x] Frontend React + Vite + TypeScript + Tailwind implementado.
- [x] Sesión local por token, salas, lobby, juego, votación, resultados y reinicio.
- [x] Ranking solo por sala; sin ranking global.
- [x] Confeti CSS en respuestas correctas y resultados.
- [x] **Modo Relámpago** (primero en responder, 10 s, sin eliminación, −100 por fallo, dificultad progresiva).
- [x] **Timer de 10 s en todos los modos**, con avance automático y “Tiempo agotado”.
- [x] **Puntos decrecientes en Relámpago** según el tiempo restante, mínimo 10.
- [x] **−10 a todos los activos** si nadie responde en Relámpago; salto del anfitrión sin penalización.
- [x] **Banderas por IP** en lobby, jugadores, scoreboard y resultados.
- [x] **Listado de conectados** y **modal de invitación** con 60 s de validez.
- [x] **Chat efímero por sala** solo durante la partida, sin persistencia.
- [x] **Emojis de posición** 🥇🥈🥉, keycaps 4–10 y `#N` desde 11.º.
- [x] **Sin repetición de preguntas dentro de una partida** (índice único).
- [x] **Sonidos** de turno, inicio de pregunta, correcta, fallida y tiempo agotado.
- [x] **Orden de turnos fijo por índice/asiento**, sin rotación ni influencia del puntaje.
- [x] **Dificultad progresiva** fácil → media → difícil en Relámpago.
- [x] Pruebas unitarias: 23/23.
- [x] Smoke test backend: clásico, eliminación, relámpago, timeout, concurrencia, reinicio y permisos.
- [x] E2E real con Chrome: clásico, relámpago y social (timer, sonido, banderas, emojis, invitación y chat).
- [x] Asesores de seguridad sin advertencias.
- [x] Backend actualizado mientras había partidas en curso, sin alterar su estado ni su orden ya asignado.

### Desviaciones respecto al plan original

1. **Una sola Edge Function `api`** en lugar de tres funciones. Centraliza el enrutamiento por `action` y reduce despliegues.
2. **Sincronización por Realtime Broadcast + polling**, no por Postgres Changes/CDC. En este proyecto CDC no entregó eventos al cliente; Broadcast sí funciona. La tabla `room_sync` y sus triggers se eliminaron.
3. **Mínimo 3 jugadores en Eliminación** (Clásico mantiene mínimo 2) para que la votación tenga sentido.
4. Se añadieron políticas explícitas de denegación y se revocó `EXECUTE` de `PUBLIC`, `anon` y `authenticated` en las RPC.

### Pendiente

- [ ] Desplegar el frontend en Netlify (requiere cuenta/token o conectar el repositorio).
- [ ] Revisión factual completa de las 1.050 preguntas. Ya se hizo un muestreo inicial de 15 preguntas sin errores y la validación estructural está al 100%.

### Cómo continuar

1. Leer `README.md` para instalación, pruebas y despliegue.
2. Para Netlify: configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
3. Para cambios de backend: usar MCP o la CLI de Supabase y las migraciones de `supabase/migrations/`.

---

## 1. Resumen del proyecto

Juego de trivia multijugador por salas, cada jugador desde su propio navegador.

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4.
- **Backend:** sin servidor propio; Supabase (Postgres, Realtime y Edge Functions).
- **Despliegue del frontend:** Netlify.
- **Idioma de la interfaz:** español.
- **Modos de juego:** Clásico y Eliminación.
- **Sin ranking global.** Solo tabla de posiciones por sala.
- **Base de preguntas:** 1050 preguntas, 350 por categoría.

### Categorías definitivas

| Categoría | Valor interno | Preguntas | Icono |
|---|---|---|---|
| Cultura general global | `general` | 350 | 🌍 |
| Videojuegos | `videogames` | 350 | 🎮 |
| Series de los 90 | `series_90s` | 350 | 📺 |

> "Los Simpson" ya no es una categoría propia. Sus preguntas se incluyen dentro de **Series de los 90**.
> En "Series de los 90" se cubren Friends, Seinfeld, Frasier, The X-Files, Twin Peaks, ER, Beverly Hills 90210, Dawson's Creek, Buffy, Charmed, Star Trek TNG/DS9/Voyager, Stargate SG-1, Babylon 5, The Sopranos, Sex and the City, Los Simpson, South Park, Futurama, Pokémon, Dragon Ball Z, Sailor Moon, Power Rangers, Xena, Hercules, Baywatch, MacGyver, Saved by the Bell, Step by Step y producciones latinoamericanas/españolas representativas.

---

## 2. Decisiones cerradas

1. **Dos modos:** Clásico y Eliminación.
2. **Clásico:** mínimo 2 jugadores.
3. **Eliminación:** mínimo 3 jugadores (con 2 la votación sería un empate trivial).
4. **Turnos = preguntas por jugador.** Ejemplo: 3 jugadores × 5 turnos = 15 preguntas.
5. **Temas mezclados** en cada partida; sin filtro de categoría.
6. **Puntaje:** 100, 150 o 200 puntos según dificultad (fácil, media, difícil). Incorrecta = 0.
7. **Timer de 10 s en todos los modos.** El anfitrión puede saltar un turno trabado.
8. **Nickname único dentro de cada sala.** No hay identidad global ni tag.
9. **Sin ranking global.** Solo ranking de sala y resultado de cada partida.
10. **Identidad local sin Supabase Auth:** `playerId` + token secreto en `localStorage`.
11. **El nickname es solo presentación.** Los puntajes se guardan contra el UUID del jugador, nunca contra el nickname.
12. **La contraseña de la base de datos no se usa ni se guarda.** El acceso es por MCP/OAuth.
13. **Todas las escrituras pasan por Edge Functions.** El cliente no puede modificar puntajes ni respuestas.
14. **El JSON de preguntas se genera y valida antes de construir frontend/backend.**
15. **Netlify:** se deja configuración y documentación; despliegue real solo si se proporciona token.

---

## 3. Estado inicial verificado

- `C:\Users\404\Desktop\jueguito` estaba vacío.
- Node 24.16 y npm 11.13 disponibles.
- Supabase CLI no instalada (se prevé usar MCP; CLI solo como respaldo).
- Proyecto Supabase: `aaojioxhupihfgqfiken`.
- URL: `https://aaojioxhupihfgqfiken.supabase.co`.
- Proyecto activo, **sin tablas** al momento de planificar.

---

## 4. Fase 0 — Supabase MCP (requisito previo)

### Configuración creada

Archivo: `C:\Users\404\.config\opencode\opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "supabase": {
      "type": "remote",
      "url": "https://mcp.supabase.com/mcp?project_ref=aaojioxhupihfgqfiken&features=docs%2Caccount%2Cdatabase%2Cdebugging%2Cdevelopment%2Cfunctions%2Cbranching",
      "enabled": true
    }
  }
}
```

### Pasos para el usuario

1. Autenticar el MCP:

```bash
opencode mcp auth supabase
```

2. Completar el flujo OAuth en el navegador.
3. **Reiniciar OpenCode** para que se carguen las herramientas MCP.
4. Verificar que existan herramientas de Supabase (`list_projects`, `apply_migration`, `execute_sql`, `deploy_edge_function`, `get_advisors`).

### Herramientas MCP que se usarán

- `apply_migration`: esquema, RLS, RPC, triggers y Realtime.
- `execute_sql`: carga de preguntas y consultas de verificación.
- `deploy_edge_function`: despliegue de la Edge Function `api`.
- `gener…` / `generate_typescript_types`: tipos de la base de datos.
- `get_advisors`: revisión de seguridad y rendimiento.
- `list_tables`, `list_migrations`, `list_edge_functions`: verificación.

### Respaldo si falla el MCP

- CLI de Supabase con Access Token, o ejecutar el SQL manualmente en el dashboard.
- El seed de preguntas también queda como SQL reproducible.

---

## 5. Fase 1 — Base de preguntas (primer entregable)

### Archivos

```text
data/questions/cultura-general.json
data/questions/videojuegos.json
data/questions/series-90.json
data/questions.json                  # consolidado
data/questions.report.json           # reporte de validación
scripts/validate-questions.mjs
scripts/merge-questions.mjs
scripts/seed-questions.mjs
```

### Esquema de cada pregunta

```json
{
  "id": "cg-0001",
  "category": "general",
  "difficulty": "easy",
  "question": "¿Cuál es la capital de Australia?",
  "options": ["Sídney", "Melbourne", "Canberra", "Perth"],
  "correctIndex": 2,
  "explanation": "Canberra es la capital de Australia desde 1913."
}
```

| Campo | Regla |
|---|---|
| `id` | Único y estable: `cg-####`, `vg-####`, `s90-####` |
| `category` | `general`, `videogames`, `series_90s` |
| `difficulty` | `easy`, `medium`, `hard` |
| `question` | Texto en español, sin ambigüedad |
| `options` | Exactamente 4 opciones únicas |
| `correctIndex` | Entero 0–3 |
| `explanation` | Explicación breve de la respuesta correcta |

### Distribución

- 350 cultura general global.
- 350 videojuegos.
- 350 series de los 90.
- **Total: 1050.**
- Dificultad por categoría: 40 % fácil, 40 % media, 20 % difícil.

### Validación automática

El script comprobará:

- JSON válido y campos obligatorios.
- Exactamente 4 opciones, no vacías ni repetidas.
- `correctIndex` entre 0 y 3.
- Preguntas duplicadas o casi duplicadas.
- Conteo mínimo por categoría.
- Distribución de dificultad.
- Distribución de la posición de la respuesta correcta.
- Longitud de enunciados y explicaciones.

### Control de calidad factual

- Solo hechos consolidados y verificables.
- Explicación en todas las preguntas.
- Revisión por muestreo y corrección de errores detectados.
- **Limitación conocida:** no se verificará con una fuente individual cada una de las 1050 preguntas; se prioriza exactitud y se documenta el muestreo.

### Carga en Supabase

- Tabla `questions` sin acceso público.
- Carga por lotes vía MCP `execute_sql`.
- Respaldo reproducible en `supabase/seed/questions.sql`.
- Verificación:

```sql
select category, count(*) from public.questions group by category order by category;
```

---

## 6. Fase 2 — Modelo de datos

### Tablas

#### `players`
- `id uuid pk`
- `nickname text not null`
- `token_hash text not null`
- `created_at timestamptz`
- `last_seen_at timestamptz`

> Sin puntos globales, sin partidas jugadas, sin victorias y sin tag. El ranking global no existe.

#### `rooms`
- `id uuid pk`
- `code text unique` (6 caracteres, alfabeto sin ambigüedad)
- `host_player_id uuid fk players`
- `status text` → `lobby | playing | finished`
- `mode text` → `classic | elimination`
- `max_rounds int` (1–30, default 5)
- `current_game_id uuid null`
- `created_at`, `updated_at`

#### `room_players`
- `room_id`, `player_id` (PK compuesta)
- `nickname text` (snapshot para mostrar y validar unicidad)
- `seat int`
- `joined_at`
- `status` → `in_room | left`
- Restricciones: único `(room_id, player_id)`, único `(room_id, seat)`, único `(room_id, lower(nickname))`.

#### `games`
- `id uuid pk`
- `room_id`, `game_number`
- `mode`, `max_rounds`
- `status` → `playing | finished`
- `phase` → `question | reveal | voting | vote_result | results`
- `current_round int`
- `current_player_id uuid null`
- `reveal_until timestamptz null`
- `winner_player_id uuid null`
- `started_at`, `finished_at`

#### `game_players`
- `game_id`, `player_id` (PK compuesta)
- `nickname`, `seat`
- `score int`, `correct_count int`, `wrong_count int`
- `total_response_ms bigint`
- `status` → `active | eliminated | left`
- `eliminated_round int null`
- `final_rank int null`
- `is_winner boolean default false`

#### `questions`
- `id uuid pk`
- `external_id text unique`
- `category text` → `general | videogames | series_90s`
- `difficulty text` → `easy | medium | hard`
- `question text`
- `options jsonb` (array de 4 strings)
- `correct_index smallint` (0–3)
- `explanation text`
- `is_active boolean default true`
- `created_at`
- Restricción: `jsonb_array_length(options) = 4`.

#### `game_questions`
- `id uuid pk`
- `game_id`, `round_number`, `turn_index`
- `player_id`, `question_id`
- `option_order smallint[]` (para barajar opciones sin perder la correcta)
- `served_at`, `answered_at`, `status`
- Únicos: `(game_id, round_number, turn_index)` y `(game_id, player_id, round_number)`.

#### `answers`
- `id uuid pk`
- `game_question_id uuid unique`
- `game_id`, `player_id`, `round_number`
- `selected_index smallint null` (null = turno saltado)
- `is_correct boolean`, `points int`
- `response_ms int`
- `answered_at`

#### `votes`
- `id uuid pk`
- `game_id`, `round_number`
- `voter_player_id`, `target_player_id`
- `created_at`
- Único: `(game_id, round_number, voter_player_id)`.

#### `room_sync` (eliminada)
- Se creó para Postgres Changes/CDC, pero CDC no entregó eventos en este proyecto.
- La sincronización actual usa **Realtime Broadcast + polling**.
- La tabla, sus triggers y sus funciones se eliminaron en la migración `20261025000600_remove_room_sync_cdc.sql`.

### Sin tabla de ranking global

No existirá:

- `global_leaderboard`.
- Suma de puntos entre salas.
- Estadísticas globales por jugador.
- Página `/ranking`.

### RLS y permisos

- RLS activo en todas las tablas.
- Todas las tablas tienen políticas explícitas de denegación para `anon` y `authenticated`.
- `questions` y `votes`: completamente inaccesibles desde el cliente.
- Las Edge Functions usan `service_role` y validan el token del jugador.
- `execute` de las RPC revocado para `PUBLIC`, `anon` y `authenticated`; solo `service_role`.
- Realtime no requiere leer tablas: se usa Broadcast con un ping sin datos sensibles.

---

## 7. Fase 3 — Edge Functions

### Funciones

#### `players`
- `register`: crea jugador y token; devuelve `playerId` y token (una sola vez).
- `resume`: valida token y devuelve la sala activa si existe.

#### `rooms`
- `create`: crea sala y asiento del anfitrión.
- `join`: une por código, valida nickname único en la sala.
- `leave`: sale del lobby o abandona la partida; promueve nuevo anfitrión si hace falta.
- `update`: solo anfitrión; modo y turnos solo en lobby.
- `start`: solo anfitrión; mínimo de jugadores y preguntas suficientes.
- `restart`: solo anfitrión y con partida finalizada; vuelve al lobby conservando historial.

#### `game`
- `state`: estado saneado + avance de fases vencidas.
- `answer`: valida turno, califica en servidor, guarda respuesta y actualiza puntaje.
- `vote`: voto secreto de eliminación.
- `skip-turn`: solo anfitrión.
- `force-vote-close`: solo anfitrión.

### Seguridad de las funciones

- `verify_jwt = false`; autenticación propia con:
  - header `x-player-id`
  - header `x-player-token`
- Validación con Zod del cuerpo de cada acción.
- CORS para los métodos y headers necesarios.
- No se registran tokens en logs.

### RPC transaccionales en Postgres

- `rpc_create_room`
- `rpc_join_room`
- `rpc_leave_room`
- `rpc_update_room`
- `rpc_start_game`
- `rpc_submit_answer`
- `rpc_submit_vote`
- `rpc_resolve_votes` (interna)
- `rpc_force_vote_close`
- `rpc_skip_turn`
- `rpc_restart_room`
- `rpc_get_state`
- `rpc_advance_due` (interna)
- `rpc_settle_game` (interna)

Características:

- `security definer`.
- Bloqueos `FOR UPDATE` para evitar dobles avances o puntos duplicados.
- Idempotencia en avances de fase y liquidación de partida.
- `rpc_get_state` nunca incluye `correct_index` durante la fase de pregunta.
- Los votos no se devuelven hasta que la votación se resuelve.

---

## 8. Fase 4 — Reglas de juego

### Modo Clásico

- Mínimo 2 jugadores.
- El anfitrión configura turnos = preguntas por jugador (1–30; default 5).
- Cada ronda todos responden una pregunta.
- El orden de turnos es fijo por índice/asiento (0, 1, 2…), sin rotación y sin depender del puntaje.
- Puntos: fácil 100, media 150, difícil 200.
- Incorrecta o turno saltado: 0.
- Al agotar las rondas gana el mayor puntaje.
- Desempate: más aciertos → menor tiempo total de respuesta → asiento.
- Jugador que abandona: se omite en turnos futuros y no puede ganar.

### Modo Eliminación

- Mínimo 3 jugadores.
- Cada ronda cada jugador activo responde una pregunta.
- Al terminar la ronda comienza la votación secreta.
- Cada activo vota a otro activo; no puede votarse a sí mismo.
- El más votado queda eliminado y pasa a espectador.
- Empate en votos: menor puntaje acumulado → menos aciertos → asiento.
- La partida termina cuando queda 1 activo.
- Si se agotan las rondas con más de 1 activo, gana el mejor puntaje entre los activos.
- Eliminados: ven la partida, no responden ni votan.
- El anfitrión conserva sus controles aunque esté eliminado.
- Si el anfitrión abandona, el host pasa al siguiente jugador de la sala.

### Modo Relámpago

- Mínimo 2 jugadores.
- Sin eliminación ni votación.
- El anfitrión configura el total de preguntas (1–30).
- Cada pregunta dura 10 segundos y todos pueden responder a la vez.
- La primera respuesta que llega al servidor cierra la pregunta y se le atribuye.
- Los puntos de una respuesta correcta **bajan con el tiempo restante**: máximo al inicio, mínimo 10.
- Incorrecta: −100.
- Sin respuesta: **−10 a todos los jugadores activos**.
- El salto manual del anfitrión no aplica penalización.
- Dificultad progresiva: fácil → media → difícil.
- Categorías rotativas: general → videojuegos → series de los 90.
- Ninguna pregunta se repite dentro de la misma partida.
- Puntajes negativos permitidos y visibles en rojo.
- Al terminar las preguntas gana el mayor puntaje.
- Desempate: más aciertos → menor tiempo total de respuesta → asiento.

### Sonidos

- Turno: al comenzar el turno de un jugador en Clásico/Eliminación.
- Inicio de pregunta: al comenzar cada ronda de Relámpago.
- Correcta y fallida: al revelarse el resultado, en todos los modos.
- Tiempo agotado: al vencer el turno en cualquier modo o al saltar una pregunta.
- Botón de silencio persistente en el header.
- Audio sintetizado con Web Audio API, sin archivos externos.

### Timer global

- Todas las preguntas tienen 10 segundos para responder.
- En Clásico/Eliminación, el timeout otorga 0 puntos y avanza.
- En Relámpago, el timeout resta 10 a todos los activos.
- El deadline es autoritativo en PostgreSQL.

### Chat, banderas e invitaciones

- Chat efímero por sala, visible solo durante la partida y sin persistencia.
- Banderas por país según IP; se guarda solo el código ISO, nunca la IP.
- Panel de conectados en el lobby con invitaciones de 60 segundos.
- Modal global para aceptar/rechazar una invitación.
- Emojis de posición en scoreboard y resultados: 🥇🥈🥉, keycaps 4–10, `#N` desde 11.º.
- Restricción única para impedir preguntas repetidas dentro de una partida.

### Reinicio

- Al finalizar, solo el anfitrión ve "Volver a jugar".
- Acción: sala vuelve a `lobby`, se limpia `current_game_id`, se conservan los jugadores.
- El anfitrión configura modo y turnos y vuelve a iniciar.
- Los demás ven "Esperando al anfitrión".
- El historial de partidas anteriores se conserva en `games`/`game_players`.

### Ranking por sala

- Tabla en vivo: puntaje, aciertos, estado (activo/eliminado/abandonó).
- Al finalizar: podio, ranking completo y ganador centrado en pantalla.
- Sin acumulación entre salas.

### Casos límite

- Jugador que cierra el navegador: conserva su turno; el host puede saltarlo.
- Jugador que sale: se marca `left`, se omite y no puede ganar.
- 1 solo jugador restante en clásico: se finaliza y gana.
- 0 jugadores: la sala queda abandonada.
- Votación sin todos los votos: el host puede forzar el cierre.
- Preguntas insuficientes para la configuración: `start` falla con mensaje claro.

---

## 9. Fase 5 — Frontend

### Stack

- React 19 + Vite + TypeScript.
- Tailwind CSS v4.
- Zustand para sesión y estado de sala.
- React Router.
- `@supabase/supabase-js`.
- Confeti **CSS puro**, sin librería.

### Rutas

| Ruta | Pantalla |
|---|---|
| `/` | Nickname / sesión existente |
| `/home` | Crear sala, unirse por código, continuar partida |
| `/room/:code` | Lobby, juego, votación y resultados |
| `*` | 404 |

> No existe `/ranking`.

### Pantallas

#### Landing
- Logo y propuesta del juego.
- Input de nickname con validación.
- Si ya hay sesión: "Continuar como …" y opción de cambiar.

#### Home
- Crear sala: modo clásico/eliminación y turnos.
- Unirse: código de 6 caracteres.
- Banner de "Continuar partida" si hay sala activa.
- Sin top global.

#### Lobby
- Código de sala y botón de copiar enlace.
- Lista de jugadores con corona del anfitrión.
- Modo y turnos configurados.
- Solo el anfitrión ve configuración y "Iniciar partida".
- El resto ve "Esperando al anfitrión" y el motivo si faltan jugadores.

#### Juego
- Ronda actual / total.
- Pregunta y 4 opciones.
- Indicador de turno y orden de jugadores.
- Tabla de posiciones de la sala.
- Solo el jugador del turno puede responder.
- Al responder:
  - opción elegida,
  - correcta en verde,
  - incorrecta en rojo,
  - explicación,
  - puntos ganados,
  - confeti CSS si acierta.
- Los demás ven la revelación y esperan el siguiente turno.
- El anfitrión tiene "Saltar turno" si se traba.

#### Votación (Eliminación)
- Tarjetas de candidatos activos.
- Voto secreto y confirmación.
- Contador de votos emitidos.
- Revelación con conteo y jugador eliminado.
- El anfitrión puede forzar el cierre.

#### Resultados
- Ganador centrado en pantalla con nombre y puntaje.
- Confeti.
- Podio y tabla completa de la sala.
- Solo el anfitrión ve "Volver a jugar".
- Los demás ven "Esperando al anfitrión".
- Botón para salir de la sala.

### Realtime y sincronización

- Cliente suscrito al canal Broadcast `room:<roomId>`.
- Tras cada acción, el cliente emite un ping `sync` por la API HTTP de Broadcast.
- Al recibir el ping: refetch del estado autoritativo a la Edge Function.
- Polling de respaldo cada 3,5 segundos y al recuperar foco.
- Tras `reveal_until`, programar refetch local.
- Si Broadcast falla, la partida continúa por polling.

### Sesión y reconexión

- `localStorage`: `playerId`, `playerToken`, `nickname`.
- Al cargar: `resume` valida el token y devuelve la sala activa.
- Si el token ya no es válido: limpiar sesión y pedir nickname.
- Si se borra el almacenamiento, se pierde el perfil (limitación conocida de identidad local).

### Diseño

- Tema oscuro tipo programa de TV.
- Acentos ámbar/cian.
- Tipografía grande y legible.
- Animaciones de entrada, hover y revelación.
- Responsive: escritorio y móvil.
- `prefers-reduced-motion` respetado.
- Accesibilidad: teclado, foco visible, `aria-live` para cambios de turno.

---

## 10. Fase 6 — Pruebas y despliegue

### Pruebas

- **Unitarias (Vitest):**
  - puntajes,
  - desempates,
  - reparto de preguntas,
  - transiciones de fase,
  - resolución de votos,
  - condiciones de victoria.
- **Smoke test real:**
  - partida clásica de 2 jugadores,
  - partida de eliminación de 3 jugadores,
  - respuestas completas,
  - verificación de ganador,
  - reinicio.
- **Pruebas manuales:**
  - dos navegadores/ventanas,
  - recarga en plena partida,
  - jugador que abandona,
  - anfitrión que abandona.
- **Seguridad:**
  - `get_advisors`,
  - verificar que `questions` y `votes` no son legibles con la publishable key,
  - verificar que `correct_index` no aparece antes de responder.

### Netlify

- `netlify.toml`:

```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
- Sin secretos de Supabase en el frontend.
- Despliegue real solo si se proporciona token de Netlify.
- Si no, se entrega configuración y pasos.

### Documentación

- `README.md` con:
  - requisitos,
  - instalación,
  - configuración de Supabase,
  - carga de preguntas,
  - despliegue de Edge Functions,
  - despliegue en Netlify,
  - cómo jugar,
  - solución de problemas.

---

## 11. Estructura de archivos prevista

```text
jueguito/
├─ PLAN.md
├─ README.md
├─ package.json
├─ vite.config.ts
├─ tsconfig.json
├─ netlify.toml
├─ .env.example
├─ .env.local                  # no se sube
├─ data/
│  ├─ questions/
│  │  ├─ cultura-general.json
│  │  ├─ videojuegos.json
│  │  └─ series-90.json
│  ├─ questions.json
│  └─ questions.report.json
├─ scripts/
│  ├─ validate-questions.mjs
│  ├─ merge-questions.mjs
│  ├─ seed-questions.mjs
│  └─ smoke-test.mjs
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  ├─ seed/
│  │  └─ questions.sql
│  └─ functions/
│     ├─ _shared/
│     │  ├─ auth.ts
│     │  ├─ cors.ts
│     │  ├─ supabase.ts
│     │  ├─ errors.ts
│     │  └─ types.ts
│     ├─ players/
│     │  └─ index.ts
│     ├─ rooms/
│     │  └─ index.ts
│     └─ game/
│        └─ index.ts
├─ src/
│  ├─ components/
│  ├─ hooks/
│  ├─ lib/
│  ├─ pages/
│  ├─ store/
│  ├─ styles/
│  ├─ types/
│  ├─ App.tsx
│  └─ main.tsx
└─ tests/
```

---

## 12. Orden de implementación

1. **Fase 0:** configurar MCP, autenticar y reiniciar OpenCode.
2. **Fase 1:** generar las 1050 preguntas, validarlas y consolidarlas.
3. **Fase 2:** crear migraciones, RLS, RPC, triggers y Realtime; cargar preguntas.
4. **Fase 3:** implementar y desplegar la Edge Function `api`.
5. **Fase 4:** implementar el frontend y la sincronización.
6. **Fase 5:** pruebas unitarias y smoke test real.
7. **Fase 6:** configurar Netlify, documentar y desplegar si hay token.

> El primer entregable es el **JSON de 1050 preguntas validado**. No se construye frontend/backend antes de eso.

---

## 13. Pendientes del usuario

- [ ] Ejecutar `opencode mcp auth supabase`.
- [ ] Reiniciar OpenCode para cargar las herramientas MCP.
- [ ] Confirmar que el MCP responde (el agente lo verificará con `list_tables` / `get_project_url`).
- [ ] Opcional: proporcionar token de Netlify para el despliegue final.
- [ ] Aceptar el muestreo de revisión factual de las 1050 preguntas.

---

## 14. Registro de cambios del plan

- Se eliminó el ranking global por pedido del usuario.
- Se eliminó el tag `Nickname#XXXX`; ya no es necesario.
- Se reemplazó la categoría "Los Simpson" por "Series de los 90".
- Se mantiene el ranking por sala.
- Se mantiene la identidad local con token.
- Se mantiene el primer entregable: JSON de preguntas validado.
