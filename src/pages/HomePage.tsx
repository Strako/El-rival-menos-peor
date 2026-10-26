import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Input, Logo, cn } from '../components/ui';
import { SoundToggle } from '../components/SoundToggle';
import { callApi, errorMessage } from '../lib/api';
import { broadcastRoomSync } from '../lib/realtime';
import { MODE_LABEL } from '../lib/format';
import { useSessionStore } from '../store/session';
import type { GameMode, RoomState } from '../types';

export function HomePage() {
  const navigate = useNavigate();
  const session = useSessionStore((s) => s.session);
  const activeRoom = useSessionStore((s) => s.activeRoom);
  const setActiveRoom = useSessionStore((s) => s.setActiveRoom);
  const clear = useSessionStore((s) => s.clear);

  const [mode, setMode] = useState<GameMode>('classic');
  const [rounds, setRounds] = useState(5);
  const [itemsEnabled, setItemsEnabled] = useState(false);
  const [multipleItemsEnabled, setMultipleItemsEnabled] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;

  const applyRoom = (state: RoomState) => {
    setActiveRoom({
      id: state.room.id,
      code: state.room.code,
      status: state.room.status,
    });
    void broadcastRoomSync(state.room.id);
    navigate(`/room/${state.room.code}`);
  };

  const createRoom = async () => {
    setError(null);
    setBusy('create');
    try {
      const state = await callApi<RoomState>(
        'room.create',
        {
          mode,
          maxRounds: rounds,
          itemsEnabled,
          multipleItemsEnabled: itemsEnabled && multipleItemsEnabled,
        },
        session,
      );
      applyRoom(state);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const joinRoom = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const clean = code.trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(clean)) {
      setError('El código debe tener 6 caracteres, por ejemplo ABC234.');
      return;
    }

    setBusy('join');
    try {
      const state = await callApi<RoomState>('room.join', { code: clean }, session);
      applyRoom(state);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const logout = () => {
    clear();
    navigate('/');
  };

  const continueLabel = activeRoom
    ? activeRoom.status === 'playing'
      ? 'Continuar partida'
      : activeRoom.status === 'finished'
        ? 'Ver resultados'
        : 'Volver a la sala'
    : null;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-gold-400/[0.06] blur-3xl" />

      <header className="relative z-10 border-b border-white/5 bg-ink-950/60 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="hidden min-[360px]:flex">
            <Logo />
          </div>
          <div className="min-[360px]:hidden">
            <Logo compact />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-[10px] uppercase tracking-wider text-white/30">Jugador</p>
              <p className="max-w-[180px] truncate text-sm font-semibold text-white">
                {session.nickname}
              </p>
            </div>
            <SoundToggle />
            <Button variant="ghost" size="sm" onClick={logout}>
              Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <Badge tone="gold">Lobby</Badge>
            <h1 className="mt-3 max-w-full break-words font-display text-4xl tracking-wide text-white [overflow-wrap:anywhere] sm:text-5xl lg:text-6xl">
              Hola, <span className="text-gold-400">{session.nickname}</span>
            </h1>
            <p className="mt-2 text-sm text-white/40">
              Crea una sala privada o únete con el código de un amigo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="cyan">Ranking por sala</Badge>
            <Badge tone="muted">Sin ranking global</Badge>
          </div>
        </div>

        {activeRoom && (
          <Card className="animate-fade-up mt-7 flex flex-wrap items-center justify-between gap-4 border-cyan-400/20 bg-cyan-400/[0.04] p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 6h16v12H4z" />
                  <path d="M8 10h8M8 14h5" />
                </svg>
              </span>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/60">
                  Sala reciente
                </p>
                <p className="font-mono text-lg font-bold tracking-[0.24em] text-white">
                  {activeRoom.code}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="text-xs text-white/35">
                {activeRoom.status === 'playing'
                  ? 'Partida en curso'
                  : activeRoom.status === 'finished'
                    ? 'Partida finalizada'
                    : 'En espera'}
              </span>
              <Button size="sm" onClick={() => navigate(`/room/${activeRoom.code}`)}>
                {continueLabel}
              </Button>
            </div>
          </Card>
        )}

        <div className="mt-7 grid gap-5 lg:grid-cols-2">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge tone="gold">Crear</Badge>
                <h2 className="mt-3 font-display text-4xl tracking-wide text-white">
                  Nueva sala
                </h2>
                <p className="mt-1 text-sm text-white/40">
                  Tú serás el anfitrión y decidirás cuándo empieza.
                </p>
              </div>
              <span className="text-2xl">🎬</span>
            </div>

            <div className="mt-6">
              <span className="label">Modo</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(['classic', 'elimination', 'race'] as GameMode[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => setMode(option)}
                    className={cn(
                      'rounded-xl border p-3 text-left transition disabled:cursor-not-allowed',
                      mode === option
                        ? option === 'classic'
                          ? 'border-gold-400/45 bg-gold-400/[0.08]'
                          : option === 'elimination'
                            ? 'border-red-400/40 bg-red-500/[0.07]'
                            : 'border-cyan-400/45 bg-cyan-400/[0.08]'
                        : 'border-white/10 bg-white/[0.025] hover:border-white/20',
                    )}
                  >
                    <span className="block text-sm font-bold text-white">
                      {MODE_LABEL[option]}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-tight text-white/35">
                      {option === 'classic'
                        ? '20 s por turno · mayor puntaje'
                        : option === 'elimination'
                          ? '20 s por turno · votan y eliminan'
                          : '20 s · el primero responde'}
                    </span>
                  </button>
                ))}
              </div>
              {mode === 'race' && (
                <p className="mt-2 text-[10px] leading-relaxed text-cyan-200/60">
                  20 segundos por pregunta · sin eliminación · respuesta incorrecta: −100.
                </p>
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={itemsEnabled}
                  onChange={(event) => {
                    setItemsEnabled(event.target.checked);
                    if (!event.target.checked) setMultipleItemsEnabled(false);
                  }}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-gold-400"
                />
                <span>
                  <span className="block text-sm font-semibold text-white">Habilitar items</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-white/35">
                    Apagón, barajado, cambio de pregunta, intercambio y aleatorio.
                  </span>
                </span>
              </label>

              {itemsEnabled && (
                <label className="mt-3 flex cursor-pointer items-start gap-3 border-t border-white/[0.06] pt-3">
                  <input
                    type="checkbox"
                    checked={multipleItemsEnabled}
                    onChange={(event) => setMultipleItemsEnabled(event.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-gold-400"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-white">
                      Habilitar items múltiples
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-white/35">
                      Hasta 3 ítems. Si llega un cuarto, se pierden todos.
                    </span>
                  </span>
                </label>
              )}
            </div>

            <div className="mt-5">
              <span className="label">
                {mode === 'race' ? 'Preguntas de la partida' : 'Turnos por jugador'}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRounds((value) => Math.max(1, value - 1))}
                  disabled={Boolean(busy) || rounds <= 1}
                  aria-label={mode === 'race' ? 'Menos preguntas' : 'Menos turnos'}
                >
                  −
                </Button>
                <div className="flex-1 rounded-xl border border-white/10 bg-ink-900/70 py-2.5 text-center">
                  <span className="font-display text-2xl text-gold-300">{rounds}</span>
                  <span className="ml-2 text-xs text-white/35">
                    {mode === 'race' ? 'preguntas totales' : 'preguntas por jugador'}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setRounds((value) => Math.min(30, value + 1))}
                  disabled={Boolean(busy) || rounds >= 30}
                  aria-label={mode === 'race' ? 'Más preguntas' : 'Más turnos'}
                >
                  +
                </Button>
              </div>
            </div>

            <Button
              fullWidth
              size="lg"
              className="mt-5"
              onClick={() => void createRoom()}
              loading={busy === 'create'}
              disabled={Boolean(busy)}
            >
              Crear sala
            </Button>
            <p className="mt-3 text-center text-[10px] text-white/25">
              {mode === 'elimination' ? 'Mínimo 3 jugadores' : 'Mínimo 2 jugadores'} para
              comenzar.
              {mode === 'race' ? ' Sin eliminación.' : ''}
            </p>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Badge tone="cyan">Unirse</Badge>
                <h2 className="mt-3 font-display text-4xl tracking-wide text-white">
                  Entrar a una sala
                </h2>
                <p className="mt-1 text-sm text-white/40">
                  Pide el código de 6 caracteres al anfitrión.
                </p>
              </div>
              <span className="text-2xl">🔑</span>
            </div>

            <form onSubmit={joinRoom} className="mt-6">
              <Input
                label="Código de sala"
                placeholder="ABC234"
                value={code}
                onChange={(event) =>
                  setCode(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 6),
                  )
                }
                className="text-center font-mono text-2xl font-bold tracking-[0.4em]"
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
              />

              <Button
                fullWidth
                size="lg"
                className="mt-4"
                type="submit"
                loading={busy === 'join'}
                disabled={Boolean(busy)}
              >
                Unirme
              </Button>
            </form>

            <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
              <p className="text-xs font-semibold text-white/60">Consejo</p>
              <p className="mt-1 text-[11px] leading-relaxed text-white/30">
                Cada jugador debe abrir el juego en su propio navegador. Comparte el enlace o
                el código de la sala; no necesitas instalar nada.
              </p>
            </div>
          </Card>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="mt-10">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
            Cómo se juega
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[
              {
                step: '01',
                title: 'Crea o únete',
                text: 'El anfitrión elige el modo y los turnos. La partida empieza cuando él decide.',
              },
              {
                step: '02',
                title: 'Responde por turnos',
                text: 'Cada jugador recibe una pregunta con 4 opciones. Los aciertos suman puntos.',
              },
              {
                step: '03',
                title: 'Sobrevive a la votación',
                text: 'En eliminación, después de cada ronda se vota y el MENOS PEOR sale de la partida.',
              },
            ].map((item) => (
              <Card key={item.step} className="p-5">
                <p className="font-display text-3xl text-white/15">{item.step}</p>
                <h3 className="mt-2 text-sm font-bold text-white">{item.title}</h3>
                <p className="mt-1 text-[11px] leading-relaxed text-white/35">{item.text}</p>
              </Card>
            ))}
          </div>
        </section>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-5 text-[10px] text-white/20">
          <span>El rival menos peor</span>
          <span>7.050 preguntas · 3 categorías · 3 modos</span>
        </footer>
      </main>
    </div>
  );
}
