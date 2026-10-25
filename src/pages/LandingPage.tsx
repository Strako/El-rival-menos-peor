import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, Badge, Button, Card, Input, Logo, cn } from '../components/ui';
import { SoundToggle } from '../components/SoundToggle';
import { callApi, errorMessage } from '../lib/api';
import { broadcastRoomSync } from '../lib/realtime';
import { useSessionStore } from '../store/session';
import type { PlayerSession, RegisterData, RoomState } from '../types';

export function LandingPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const code = (searchParams.get('code') ?? '').trim().toUpperCase();
  const hasCode = /^[A-Z2-9]{6}$/.test(code);

  const session = useSessionStore((s) => s.session);
  const activeRoom = useSessionStore((s) => s.activeRoom);
  const setSession = useSessionStore((s) => s.setSession);
  const setActiveRoom = useSessionStore((s) => s.setActiveRoom);
  const clear = useSessionStore((s) => s.clear);

  const [nickname, setNickname] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enterRoom = async (playerSession: PlayerSession) => {
    if (!hasCode) {
      navigate('/home');
      return;
    }

    const state = await callApi<RoomState>('room.join', { code }, playerSession);
    setActiveRoom({
      id: state.room.id,
      code: state.room.code,
      status: state.room.status,
    });
    void broadcastRoomSync(state.room.id);
    navigate(`/room/${state.room.code}`);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const clean = nickname.trim().replace(/\s+/g, ' ');
    if (!/^[\p{L}\p{N} _.-]{3,16}$/u.test(clean)) {
      setError('Escribe un nickname de 3 a 16 caracteres. Puedes usar letras, números, espacios, guion, punto o guion bajo.');
      return;
    }

    setBusy(true);
    try {
      const data = await callApi<RegisterData>('register', { nickname: clean });
      const playerSession: PlayerSession = {
        playerId: data.playerId,
        nickname: data.nickname,
        token: data.token,
      };
      setSession(playerSession);
      setEditing(false);
      await enterRoom(playerSession);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const continueSession = async () => {
    if (!session) return;
    setError(null);
    setBusy(true);
    try {
      if (hasCode) {
        await enterRoom(session);
      } else if (activeRoom) {
        navigate(`/room/${activeRoom.code}`);
      } else {
        navigate('/home');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changeIdentity = () => {
    clear();
    setNickname('');
    setEditing(true);
    setError(null);
  };

  const showForm = !session || editing;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-70" />
      <div className="pointer-events-none absolute -left-40 top-10 h-[28rem] w-[28rem] rounded-full bg-gold-400/[0.08] blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-40 h-[30rem] w-[30rem] rounded-full bg-cyan-400/[0.07] blur-3xl" />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <Logo />
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 text-xs text-white/35 sm:flex">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Multijugador en tiempo real
          </div>
          <SoundToggle />
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-6 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:pt-10">
        <section className="animate-fade-up">
          <Badge tone="gold">El programa de trivia</Badge>
          <h1 className="mt-5 font-display text-[4.2rem] leading-[0.86] tracking-wide text-white sm:text-[6.5rem] lg:text-[7.5rem]">
            ¿QUIÉN ES EL{' '}
            <span className="text-glow block text-gold-400">RIVAL MÁS DÉBIL?</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-white/50 sm:text-lg">
            Crea una sala privada, invita a tus amigos y demuestra quién sabe más. Responde
            por turnos, suma puntos y sobrevive a la votación.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            <span className="badge badge-muted">🌍 Cultura general</span>
            <span className="badge badge-muted">🎮 Videojuegos</span>
            <span className="badge badge-muted">📺 Series de los 90</span>
            <span className="badge badge-cyan">1.050 preguntas</span>
          </div>

          <div className="mt-9 grid max-w-lg grid-cols-3 gap-3">
            {[
              { value: '2', label: 'modos de juego' },
              { value: '∞', label: 'jugadores por sala' },
              { value: '100%', label: 'en tiempo real' },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3"
              >
                <p className="font-display text-3xl leading-none text-gold-300">{item.value}</p>
                <p className="mt-1 text-[10px] uppercase leading-tight tracking-wider text-white/30">
                  {item.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="animate-fade-up [animation-delay:120ms]">
          <Card className="relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-gold-400/10 blur-3xl" />

            <div className="relative">
              {hasCode && (
                <div className="mb-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.05] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200/60">
                    Invitación a sala
                  </p>
                  <p className="mt-1 font-mono text-xl font-bold tracking-[0.28em] text-cyan-200">
                    {code}
                  </p>
                </div>
              )}

              {!showForm && session ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">
                    Sesión activa
                  </p>
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
                    <Avatar name={session.nickname} size="lg" />
                    <div className="min-w-0">
                      <p className="truncate text-lg font-bold text-white">{session.nickname}</p>
                      <p className="text-xs text-white/35">
                        {activeRoom ? 'Tienes una sala reciente' : 'Listo para jugar'}
                      </p>
                    </div>
                  </div>

                  <Button fullWidth size="lg" className="mt-5" onClick={() => void continueSession()} loading={busy}>
                    {hasCode
                      ? 'Entrar a la sala'
                      : activeRoom
                        ? `Volver a la sala ${activeRoom.code}`
                        : 'Ir al inicio'}
                  </Button>

                  <button
                    type="button"
                    onClick={changeIdentity}
                    className="mt-4 w-full text-center text-xs text-white/30 transition hover:text-white/60"
                  >
                    Usar otro nickname (nueva identidad)
                  </button>
                </>
              ) : (
                <form onSubmit={submit}>
                  <h2 className="font-display text-4xl tracking-wide text-white">
                    {editing ? 'Nuevo jugador' : 'Entra al juego'}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-white/40">
                    Elige el nombre con el que te verán los demás jugadores de la sala.
                  </p>

                  <div className="mt-6">
                    <Input
                      label="Tu nickname"
                      placeholder="Ej. Alex, TriviaKing, LaLeyenda"
                      value={nickname}
                      onChange={(event) => setNickname(event.target.value)}
                      maxLength={16}
                      autoFocus
                      autoComplete="nickname"
                      error={error ?? undefined}
                      hint="3 a 16 caracteres. Sin emojis."
                    />
                  </div>

                  <Button fullWidth size="lg" className="mt-5" type="submit" loading={busy}>
                    {hasCode ? 'Entrar a la sala' : 'Crear mi jugador'}
                  </Button>

                  {session && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setError(null);
                      }}
                      className="mt-4 w-full text-center text-xs text-white/30 transition hover:text-white/60"
                    >
                      Volver a la sesión de {session.nickname}
                    </button>
                  )}
                </form>
              )}

              {error && showForm && (
                <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-xs leading-relaxed text-red-200">
                  {error}
                </div>
              )}

              {error && !showForm && (
                <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/[0.06] px-4 py-3 text-xs leading-relaxed text-red-200">
                  {error}
                </div>
              )}

              <p className="mt-6 border-t border-white/5 pt-4 text-[10px] leading-relaxed text-white/25">
                Tu identidad se guarda en este navegador. Si borras los datos del sitio,
                perderás el acceso a tu perfil actual.
              </p>
            </div>
          </Card>
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/5 px-5 py-5 text-[10px] text-white/20 sm:px-8">
        <span>El Rival Más Débil · Trivia multijugador</span>
        <span>React + Vite + Supabase</span>
      </footer>
    </div>
  );
}
