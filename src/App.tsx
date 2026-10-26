import { useEffect, type ReactNode } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { useAudioUnlock } from './hooks/useAudioUnlock';
import { useSessionBootstrap } from './hooks/useSessionBootstrap';
import { useSessionStore } from './store/session';
import { LandingPage } from './pages/LandingPage';
import { HomePage } from './pages/HomePage';
import { ChangelogPage } from './pages/ChangelogPage';
import { RoomPage } from './pages/RoomPage';
import { Button, Card, Logo, Spinner } from './components/ui';
import { InviteHost } from './components/InviteHost';

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6">
      <Logo />
      <div className="flex items-center gap-3 text-sm text-white/35">
        <Spinner className="h-5 w-5 text-gold-300" />
        Cargando tu sesión…
      </div>
    </div>
  );
}

function RequireSession({ children }: { children: ReactNode }) {
  const session = useSessionStore((s) => s.session);
  const location = useLocation();

  if (!session) {
    const code = location.pathname.startsWith('/room/')
      ? location.pathname.split('/')[2] ?? ''
      : '';
    return <Navigate to={code ? `/?code=${code}` : '/'} replace />;
  }

  return <>{children}</>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <Card className="w-full max-w-lg p-8 text-center">
        <Logo />
        <p className="mt-6 font-display text-7xl text-gold-400">404</p>
        <h1 className="mt-2 font-display text-4xl tracking-wide text-white">
          Esta sala no existe
        </h1>
        <p className="mt-3 text-sm text-white/40">
          La página que buscas no está disponible. Vuelve al inicio para crear o unirte a una
          sala.
        </p>
        <Button className="mt-6" onClick={() => navigate('/home')}>
          Volver al inicio
        </Button>
      </Card>
    </div>
  );
}

export default function App() {
  const { booting } = useSessionBootstrap();
  useAudioUnlock();

  if (booting) return <Splash />;

  return (
    <BrowserRouter>
      <ScrollToTop />
      <InviteHost />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/changelog" element={<ChangelogPage />} />
        <Route
          path="/home"
          element={
            <RequireSession>
              <HomePage />
            </RequireSession>
          }
        />
        <Route
          path="/room/:code"
          element={
            <RequireSession>
              <RoomPage />
            </RequireSession>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}
