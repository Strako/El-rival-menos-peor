import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, Logo, Spinner } from '../components/ui';
import {
  CHANGELOG_REPO_URL,
  fetchChangelogCommits,
  formatChangelogDate,
  type ChangelogCommit,
} from '../lib/changelog';
import { useSessionStore } from '../store/session';

export function ChangelogPage() {
  const navigate = useNavigate();
  const session = useSessionStore((state) => state.session);
  const [commits, setCommits] = useState<ChangelogCommit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void fetchChangelogCommits()
      .then((latest) => {
        if (!active) return;
        setCommits(latest);
      })
      .catch(() => {
        if (!active) return;
        setError('No se pudieron cargar las actualizaciones desde GitHub.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-40" />
      <div className="pointer-events-none absolute -left-40 top-0 h-96 w-96 rounded-full bg-gold-400/[0.07] blur-3xl" />
      <div className="pointer-events-none absolute -right-40 top-56 h-96 w-96 rounded-full bg-cyan-400/[0.05] blur-3xl" />

      <header className="relative z-10 border-b border-white/5 bg-ink-950/60 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <div className="hidden min-[360px]:flex">
            <Logo onClick={() => navigate(session ? '/home' : '/')} />
          </div>
          <div className="min-[360px]:hidden">
            <Logo compact onClick={() => navigate(session ? '/home' : '/')} />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(session ? '/home' : '/')}
          >
            <span className="sm:hidden">Volver</span>
            <span className="hidden sm:inline">
              {session ? 'Volver al lobby' : 'Volver al inicio'}
            </span>
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
        <section className="max-w-2xl">
          <Badge tone="gold">Registro de cambios</Badge>
          <h1 className="mt-4 font-display text-5xl tracking-wide text-white sm:text-7xl">
            CHANGELOG
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/45 sm:text-base">
            Las últimas actualizaciones publicadas del juego. Se cargan directamente desde los
            commits de GitHub para que siempre veas lo más reciente.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300/80">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Actualizado desde GitHub
            </span>
            <a
              href={CHANGELOG_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-white/35 transition hover:text-white/70"
            >
              Ver repositorio ↗
            </a>
          </div>
        </section>

        <section className="mt-9" aria-live="polite">
          {loading ? (
            <Card className="flex items-center gap-3 p-6 text-sm text-white/40">
              <Spinner className="h-5 w-5 text-gold-300" />
              Cargando las últimas actualizaciones…
            </Card>
          ) : error ? (
            <Card className="border-red-400/15 bg-red-500/[0.035] p-6">
              <p className="text-sm font-semibold text-red-200">{error}</p>
              <p className="mt-2 text-xs leading-relaxed text-white/35">
                GitHub puede limitar las consultas anónimas. Puedes consultar el historial
                completo en el repositorio.
              </p>
              <a
                href={CHANGELOG_REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
              >
                Abrir historial en GitHub ↗
              </a>
            </Card>
          ) : commits.length === 0 ? (
            <Card className="p-6 text-sm text-white/40">
              Todavía no hay actualizaciones publicadas.
            </Card>
          ) : (
            <ol className="space-y-3">
              {commits.map((commit, index) => (
                <li key={commit.sha}>
                  <Card className="group relative overflow-hidden p-5 transition hover:border-white/20 sm:p-6">
                    <div className="flex items-start gap-4">
                      <div className="hidden shrink-0 sm:block">
                        <span
                          className={
                            index === 0
                              ? 'grid h-9 w-9 place-items-center rounded-full border border-gold-400/30 bg-gold-400/10 text-sm text-gold-300'
                              : 'grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.035] text-xs text-white/30'
                          }
                        >
                          {index === 0 ? '✦' : String(index + 1).padStart(2, '0')}
                        </span>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h2 className="min-w-0 break-words text-sm font-bold leading-relaxed text-white sm:text-base">
                            {commit.title}
                          </h2>
                          <time
                            dateTime={commit.date}
                            className="shrink-0 pt-0.5 text-[10px] uppercase tracking-wider text-white/25"
                          >
                            {formatChangelogDate(commit.date)}
                          </time>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/30">
                          <span>{commit.author}</span>
                          <span aria-hidden="true">·</span>
                          <code className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-white/40">
                            {commit.shortSha}
                          </code>
                          <a
                            href={commit.url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto text-[11px] font-medium text-white/35 transition hover:text-cyan-300"
                          >
                            Ver commit ↗
                          </a>
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 border-t border-white/5 px-5 py-5 text-[10px] text-white/20 sm:px-8">
        <span>El rival menos peor · Changelog</span>
        <a
          href={CHANGELOG_REPO_URL}
          target="_blank"
          rel="noreferrer"
          className="transition hover:text-white/50"
        >
          GitHub
        </a>
      </footer>
    </div>
  );
}
