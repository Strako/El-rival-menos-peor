# El rival menos peor

Trivia multijugador por salas, inspirada en el formato de “El rival menos peor”. Cada jugador entra desde su propio navegador, responde por turnos y compite en una tabla de posiciones **solo de su sala**.

- **Frontend:** React 19 + Vite + TypeScript + Tailwind CSS v4.
- **Backend:** Supabase (Postgres, Edge Functions y Realtime).
- **Despliegue:** Netlify.
- **Sin ranking global.**
- **6.050 preguntas** en tres categorías.
- **5.350 de cultura general**, ampliadas a artes y ciencias de todo el mundo.
- **Tres modos:** Clásico, Eliminación y Relámpago.
- **Timer de 10 s** para responder en todos los modos.
- **Chat efímero por sala** durante la partida.
- **Ítems opcionales** en los tres modos: apagón, barajado, cambio de pregunta, intercambio de puntos y aleatorio.
- **Banderas por país** según la IP.
- **Invitaciones** a jugadores conectados desde el lobby.
- **Cierre de sala** por el anfitrión, validado en base de datos.
- **Salida libre** de cualquier jugador en todo momento.
- **Emojis de posición** en el scoreboard.
- **Diseño responsive** optimizado para móviles de 320–390 px.
- **Sonidos:** turno, respuesta correcta, respuesta fallida y tiempo agotado.

---

## Estado actual

| Componente | Estado |
|---|---|
| Proyecto Supabase | Activo |
| Esquema, RLS, RPC y seguridad | Aplicado |
| Preguntas cargadas | 6.050 |
| Banco ampliado | 5.000 nuevas de cultura general |
| Auditoría de contexto | 206 preguntas mejoradas |
| Edge Function `api` | Desplegada (versión 5) |
| Frontend | Implementado y compilando |
| Modo Relámpago | Implementado |
| Timer de 10 s | En los tres modos |
| Chat efímero | Implementado |
| Banderas por IP | Implementadas |
| Invitaciones en lobby | Implementadas |
| Cierre de sala | Implementado con validación de anfitrión |
| Salida de jugadores | Disponible en lobby, partida y resultados |
| Sistema de ítems | Implementado en Clásico, Eliminación y Relámpago |
| Emojis de ranking | Implementados |
| Sin repetición por partida | Restricción única aplicada |
| Sonidos | Implementados |
| Pruebas unitarias | 23/23 |
| Smoke test backend | Clásico, Eliminación y Relámpago OK |
| Prueba de cierre de sala | Permisos, bloqueo y salida OK |
| E2E con Chrome | Clásico, Relámpago, social, cierre e ítems OK |
| Responsive mobile | 320, 360 y 390 px sin desbordes |
| Despliegue Netlify | Pendiente de credenciales |

- Supabase: `https://aaojioxhupihfgqfiken.supabase.co`
- Edge Function: `https://aaojioxhupihfgqfiken.supabase.co/functions/v1/api`
- El plan de trabajo original y las decisiones están en [`PLAN.md`](./PLAN.md).

---

## Categorías y contenido

| Categoría | Valor interno | Preguntas |
|---|---|---|
| Cultura general global | `general` | 5.350 |
| Videojuegos | `videogames` | 350 |
| Series de los 90 | `series_90s` | 350 |

Incluye sitcoms, dramas, ciencia ficción, animación y producciones latinoamericanas/españolas de los 90. “Los Simpson” está dentro de **Series de los 90**, no como categoría separada.

Distribución por dificultad: 2.386 fáciles, 2.448 medias, 1.216 difíciles.

La ampliación cubre física, astronomía, química, biología, medicina, matemáticas, tecnología, ciencias de la Tierra, geografía, historia antigua y moderna, arqueología, filosofía, religión, mitología, lingüística, literatura, teatro, poesía, pintura, escultura, arquitectura, diseño, fotografía, música, danza, cine y culturas del mundo.

---

## Requisitos

- Node.js 24 o superior.
- npm 11 o superior.
- Chrome/Edge para la prueba E2E (opcional).
- Acceso al proyecto Supabase para desplegar cambios (MCP o CLI).

---

## Instalación local

```bash
npm install
```

El proyecto ya incluye `.env.local` con la URL y la **publishable key** de Supabase. Si vas a usar otro proyecto, copia `.env.example` y ajusta:

```env
VITE_SUPABASE_URL=https://<proyecto>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

> La publishable key es pública por diseño. **Nunca** pongas la `service_role` ni la contraseña de la base en el frontend.

Arranca el frontend:

```bash
npm run dev
```

Abre `http://localhost:5173`.

---

## Cómo jugar

1. **Nickname:** cada jugador elige un nombre. Se guarda una identidad local en `localStorage` (UUID + token secreto).
2. **Crear o unirse:** el anfitrión crea una sala y comparte el código de 6 caracteres o el enlace.
3. **Configurar:** solo el anfitrión elige el modo y la cantidad de turnos (1–30).
4. **Iniciar:** se necesitan al menos 2 jugadores en Clásico y Relámpago, y 3 en Eliminación.
5. **Responder:** en Clásico y Eliminación cada jugador responde una pregunta por turno. En Relámpago todos responden la misma pregunta a la vez.
6. **Timer:** todas las preguntas tienen **10 segundos**. Si el turno expira sin respuesta, se otorgan 0 puntos y se avanza automáticamente.
7. **Puntuar:** fácil = 100, media = 150, difícil = 200. En Relámpago el valor baja con el tiempo; incorrecta = −100.
8. **Eliminación:** después de cada ronda, los activos votan en secreto. El más votado queda eliminado y pasa a espectador.
9. **Relámpago:** la primera respuesta cierra la pregunta. Sin respuesta: −10 a todos los activos. Sin eliminación.
10. **Resultados:** se muestra el ganador y la tabla final. Solo el anfitrión puede volver a configurar y reiniciar.
11. **Cerrar o salir:** el anfitrión puede cerrar la sala desde el lobby o los resultados si la partida no está en curso (o si ya no queda nadie dentro). Cualquier jugador puede salir en cualquier momento con el botón **Salir**.
12. **Ítems opcionales:** si el anfitrión los habilita, aparecen en la bandeja de cada jugador. Se usan antes de responder y los efectos se aplican en el turno de la víctima.

### Orden de turnos

- El orden de turnos es **fijo por índice/asiento** (`0, 1, 2…`), según el orden de unión.
- No se rota al jugador inicial ni se ordena por puntaje.
- La tabla de posiciones sí se ordena por puntos, pero **no altera los turnos**.
- En Eliminación, los eliminados se omiten, pero los demás conservan su índice.
- En Relámpago no hay turnos; el listado sigue por índice.
- Ninguna pregunta se repite dentro de la misma partida, en ningún modo.

### Reglas del modo Relámpago

- Dificultad progresiva: las primeras preguntas son fáciles, luego medias y al final difíciles.
- Las categorías rotan entre Cultura general, Videojuegos y Series de los 90.
- Cada pregunta dura 10 segundos.
- La primera respuesta que llega al servidor se atribuye a ese jugador.
- Los puntos de una respuesta correcta **bajan con el tiempo**: máximo al inicio y mínimo 10.
- Si nadie responde, **todos los activos pierden 10 puntos**.
- Si la primera respuesta es incorrecta, se restan 100 puntos y la pregunta se cierra.
- El salto manual del anfitrión no aplica penalización.
- Los puntajes negativos se muestran en rojo.
- No hay votación ni eliminación.
- Ninguna pregunta se repite dentro de la misma partida.

### Reglas de desempate

- Clásico y Relámpago: puntaje → aciertos → menor tiempo total de respuesta → asiento.
- Eliminación: más votos; en empate, menor puntaje → menos aciertos → asiento.

### Reglas especiales

- **Todas las preguntas tienen 10 segundos** para responder en los tres modos.
- El anfitrión puede **saltar un turno/pregunta** si un jugador se desconecta.
- El anfitrión puede **forzar el cierre de una votación** si falta alguien.
- Si el anfitrión abandona, el host pasa al siguiente jugador de la sala.
- El anfitrión conserva sus controles aunque sea eliminado.

### Scoreboard con emojis

- 1.º 🥇, 2.º 🥈, 3.º 🥉.
- 4.º a 10.º: `4️⃣` … `🔟`.
- 11.º en adelante: `#11`, `#12`…
- La tabla se ordena por puntos; el orden de turno sigue fijo por asiento.
- Los emojis también aparecen en el podio y la tabla final.

### Chat de partida

- Chat **por sala**, visible solo cuando la partida está en curso.
- **No persiste**: no hay tabla de mensajes ni historial en Supabase.
- Los mensajes viven en la memoria de los clientes conectados.
- Al recargar, salir o cerrar la pestaña, el historial se pierde.
- Usa Broadcast; no hay polling de chat.
- Eliminados pueden chatear; jugadores que salieron no.
- Límite de 280 caracteres y rate limit básico.

### Banderas e invitaciones

- El país se obtiene por IP al registrarse o reanudar sesión.
- Solo se guarda el código ISO del país; **nunca la IP**.
- Si la geolocalización falla, se muestra 🌐.
- El lobby muestra un panel de **jugadores conectados** con bandera, nickname y estado.
- Se puede invitar a un jugador conectado; recibe un modal con cuenta regresiva de 60 s.
- Si está en partida, no puede aceptar; si está en otro lobby, al aceptar sale de ese lobby.

---

## Seguridad

- El cliente **no puede leer ni escribir directamente** las tablas de juego.
- La `publishable key` solo sirve para llamar a la Edge Function y para Realtime Broadcast.
- Todas las escrituras pasan por `api` y por RPC transaccionales.
- La Edge Function valida `x-player-id` + `x-player-token` contra un hash SHA-256.
- Las RPC tienen `EXECUTE` revocado de `PUBLIC`, `anon` y `authenticated`.
- Las tablas tienen RLS habilitado y políticas explícitas de denegación.
- La tabla de preguntas nunca es accesible desde el cliente.
- La respuesta correcta no se envía hasta que el jugador responde.
- Los votos no se revelan hasta que termina la votación.
- **No hay ranking global**, tal como se solicitó: el nickname nunca se usa como clave de puntaje.
- La contraseña de la base de datos no se usa ni se guarda en el proyecto.

### Limitación conocida de identidad

La identidad se guarda en `localStorage`. Si se borran los datos del sitio, se pierde el perfil y el acceso a la sala actual. Es el intercambio de no usar Supabase Auth.

---

## Sincronización en tiempo real

El proyecto usa dos mecanismos complementarios:

1. **Supabase Realtime Broadcast:** tras cada acción, el cliente emite un ping al canal `room:<roomId>`; los demás clientes reciben el evento y piden el estado autoritativo a la Edge Function.
2. **Polling de respaldo cada 3,5 s** y al recuperar el foco de la ventana.

El estado de la partida siempre se lee desde la Edge Function; los eventos de Realtime no contienen datos sensibles. Si Realtime falla, el juego sigue funcionando por polling. Al cerrar una sala se emite el evento `closed`; si no llega, el polling detecta que la sala ya no existe.

> Se intentó Postgres Changes/CDC, pero en este proyecto los eventos no llegaron al cliente; por eso se usa Broadcast.

---

## Sonidos

El juego incluye un sistema de audio sintetizado con **Web Audio API**, sin archivos MP3 ni dependencias externas.

| Sonido | Cuándo suena |
|---|---|
| Turno | Al comenzar el turno de un jugador en Clásico/Eliminación |
| Inicio de pregunta | Al comenzar cada ronda de 10 s en Relámpago |
| Correcta | Al revelarse una respuesta correcta en cualquier modo |
| Fallida | Al revelarse una respuesta incorrecta en cualquier modo |
| Tiempo agotado | Cuando vence el turno en cualquier modo o se salta una pregunta |

- El botón de altavoz del header activa/silencia los sonidos.
- La preferencia se guarda en `localStorage`.
- Los sonidos se desbloquean con el primer clic/tecla (política de autoplay de los navegadores).
- No se repiten por polling: cada evento tiene una clave única.
- No suenan al recargar a mitad de una pregunta o revelación.

---

## Base de datos

Migraciones en `supabase/migrations/`:

1. `schema` — tablas, índices, helpers y triggers.
2. `rpc_rooms` — crear/unirse/configurar/iniciar.
3. `rpc_game` — respuestas, votos, avance, resultados y estado.
4. `security` — RLS, permisos y Realtime.
5. `security_hardening` — revocación de `PUBLIC`, políticas de denegación e índices.
6. `remove_room_sync_cdc` — limpieza del mecanismo CDC no utilizado.
7. `race_mode_schema` — tablas, constraints e índices del modo Relámpago.
8. `race_mode_functions` — inicio, respuesta, timeout y avance del modo Relámpago.
9. `race_mode_rpcs` — estado del modo, orden fijo por asiento y permisos.
10. `race_mode_fk_indexes` — índices de claves foráneas del modo Relámpago.
11. `global_timer_flags_invites_schema` — timer global, país, unicidad de preguntas e invitaciones.
12. `timer_scoring_flags_invites_functions` — avance con timer, puntos decrecientes, penalización, presencia e invitaciones.
13. `question_keys_topic` — normalización de enunciados, índice único y metadato de tema.
14. `close_room` — cierre de sala por el anfitrión con validación de partida en curso y jugadores dentro.
15. `items_system` — inventario, premios, efectos, límites y configuración de ítems.

La Edge Function está en `supabase/functions/api/index.ts` y se despliega con `verify_jwt = false` porque usa autenticación propia por token de jugador.

### Variables de la Edge Function

Supabase inyecta automáticamente:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

No hay secretos adicionales.

---

## Banco de preguntas

Archivos:

```text
data/questions/cultura-general.json
data/questions/videojuegos.json
data/questions/series-90.json
data/questions.json
data/questions/general-5000/      # 20 lotes fuente
data/questions/general-5000.json  # 5.000 seleccionadas
data/questions/context-fixes.json # 206 correcciones de contexto
data/questions/parts/*.json
data/questions.report.json
data/questions/general-5000.report.json
data/questions/general-5000.selected.report.json
supabase/seed/questions.sql
```

Validar:

```bash
npm run validate:questions
npm run validate:questions:final
npm run validate:general-5000
npm run audit:ambiguity
```

Regenerar consolidado, correcciones y banco ampliado:

```bash
npm run merge:context-fixes
npm run merge:questions
npm run merge:general-5000
```

> El banco final en Supabase es de **6.050** preguntas. `questions.question_key` impide duplicados normalizados.

Cargar a Supabase con una clave secreta (solo para administración):

```bash
# PowerShell
$env:SUPABASE_URL="https://<proyecto>.supabase.co"
$env:SUPABASE_SECRET_KEY="<secret-key>"
npm run seed:questions
```

> La publishable key no puede insertar: RLS y los permisos lo impiden.

---

## Pruebas

### Unitarias

```bash
npm test
```

Valida el banco de preguntas y helpers de formato.

### Backend smoke test

Crea jugadores y salas reales, juega una partida clásica, una de eliminación y prueba reinicio y permisos de anfitrión.

```bash
npm run test:smoke
```

### Cierre de sala y salida

```bash
npm run test:room-close
```

Valida que solo el anfitrión cierre la sala, que no se pueda cerrar con una partida en curso y jugadores dentro, y que un jugador pueda salir en cualquier momento.

### Realtime

```bash
npm run test:realtime
```

### E2E con Chrome

Requiere el dev server corriendo y Chrome o Edge instalado. El script detecta las rutas habituales; puedes forzar una con `CHROME_PATH`.

```bash
npm run dev
# en otra terminal
npm run test:e2e         # Clásico
npm run test:e2e:race    # Relámpago, timer y sonido
npm run test:e2e:social  # Bandera, emoji, invitación, chat y timeout
npm run test:e2e:close-room # Cierre de sala y salida desde el lobby
npm run test:chat        # Chat por Broadcast
```

Genera capturas en `e2e-artifacts/` (ignorado por git).

### Sistema de ítems

```bash
npm run test:items       # configuración, estado, ítem aleatorio de Relámpago y uso
npm run test:e2e:items   # E2E de configuración, inventario y uso
```

Los ítems están desactivados por defecto. El anfitrión puede habilitarlos y permitir hasta 3 acumulados; al recibir un cuarto se pierden todos. Sin ítems múltiples, el nuevo reemplaza al anterior.

En Clásico/Eliminación se obtienen por racha de 3 aciertos o 30 % por respuesta. En Relámpago se entrega uno aleatorio por pregunta. Solo pueden usarse antes de responder y dentro de los 10 segundos del turno.

| Ítem | Efecto |
|---|---|
| 🌑 Apagón | La pantalla de la víctima parpadea en negro durante 5 s. |
| 🔀 Ora ora ora | Las opciones de la víctima se barajan cada 1,5 s. |
| ❓ Ah que dijeron | Si la víctima no responde a los 4 s, la pregunta cambia sin reiniciar el tiempo. En Relámpago cambia para todos. |
| 🔄 Ay wey | Intercambia puntos con un jugador activo al azar. |
| 🎲 Aleatorio | Víctima y efecto del 1 al 4 al azar; 5 % de +300 puntos para quien lo usa. |

En Clásico/Eliminación los efectos se aplican en el siguiente turno de la víctima. En Relámpago se aplican en la ronda actual.

### Responsive mobile

Requiere el dev server corriendo. Audita 320, 360 y 390 px, detecta desbordes horizontales y guarda capturas en `e2e-artifacts/mobile/`.

```bash
npm run test:mobile         # landing, home, lobby, juego, resultados y modales
npm run test:mobile:voting  # votación y resultado de votación
npm run test:mobile:invite  # modal de invitación
npm run test:lobby-card     # tarjeta de jugador del lobby de 320 a 1280 px
```

### Calidad

```bash
npm run typecheck
npm run build
```

---

## Despliegue en Netlify

`netlify.toml` ya define:

- build: `npm run build`
- publish: `dist`
- redirect SPA: `/* → /index.html`
- Node 24

### Opción A: conectar el repositorio

1. Sube el proyecto a GitHub/GitLab.
2. En Netlify: **Add new site → Import an existing project**.
3. Configura:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Agrega las variables de entorno:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Despliega.

### Opción B: CLI

```bash
npm run build
npx netlify login
npx netlify deploy --prod --dir=dist
```

La CLI pedirá vincular o crear el sitio. También puedes usar `--site <site-id>`.

### Después del despliegue

- Verifica que la URL de Netlify cargue el frontend.
- Prueba dos navegadores: crear sala, unirse, iniciar y responder.
- Comprueba que el código de sala y el enlace compartido funcionen.
- Si el frontend se sirve en un dominio nuevo, no hace falta cambiar CORS: la Edge Function permite `*` y no usa cookies.
- Revisa la consola del navegador y la pestaña Network si algo falla.

---

## Estructura del proyecto

```text
jueguito/
├─ data/questions/           # bancos de preguntas y tandas
├─ scripts/                  # validación, merge, seed, smoke, realtime, E2E
├─ supabase/
│  ├─ config.toml
│  ├─ migrations/
│  ├─ seed/questions.sql
│  └─ functions/api/index.ts
├─ src/
│  ├─ components/
│  │  ├─ RaceQuestionView.tsx
│  │  ├─ GameChat.tsx
│  │  ├─ ConnectedPlayersPanel.tsx
│  │  ├─ InviteHost.tsx
│  │  ├─ CountryFlag.tsx
│  │  ├─ SoundToggle.tsx
│  │  └─ ...
│  ├─ hooks/
│  │  ├─ useGameSounds.ts
│  │  ├─ useAudioUnlock.ts
│  │  ├─ useRoomChat.ts
│  │  ├─ usePresence.ts
│  │  ├─ useInvites.ts
│  │  ├─ useTurnCountdown.ts
│  │  └─ ...
│  ├─ lib/
│  │  ├─ sound.ts
│  │  ├─ rank.ts
│  │  ├─ race.ts
│  │  └─ ...
│  ├─ pages/
│  ├─ store/
│  ├─ styles/
│  ├─ types.ts
│  ├─ App.tsx
│  └─ main.tsx
├─ tests/                     # preguntas, formato, sonidos, rank y puntos race
├─ netlify.toml
├─ PLAN.md
└─ README.md
```

---

## Solución de problemas

**“Tu sesión no es válida”.**
El token local no coincide. Borra el almacenamiento del sitio o usa otro nickname.

**Realtime muestra “Sincronizando”.**
El polling sigue actualizando cada 3,5 s. Revisa la conexión; el indicador cambia a “En vivo” cuando el canal Broadcast se suscribe.

**No se puede iniciar la partida.**
Clásico y Relámpago requieren 2 jugadores; Eliminación requiere 3. También puede faltar configuración de turnos o preguntas.

**“No hay preguntas suficientes”.**
La partida pide más preguntas que las disponibles para la configuración; reduce turnos o jugadores.

**Netlify muestra 404 al recargar una ruta.**
Verifica que `netlify.toml` tenga el redirect SPA.

---

## Licencia

Proyecto privado de uso educativo/recreativo.
