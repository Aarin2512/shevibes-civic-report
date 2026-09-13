import { type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Home, Plus, User, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { to: '/', label: 'Feed', icon: Home },
    { to: '/new', label: 'Report', icon: Plus },
    { to: '/profile', label: 'Profile', icon: User },
  ];

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900 tracking-tight">
              CivicReport
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {profile && (
              <span className="text-sm text-slate-500 mr-2 hidden sm:inline">
                {profile.pseudonym}
              </span>
            )}
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-6 pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-md border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-around">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active =
              to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all ${
                  active
                    ? 'text-emerald-600'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon
                  className="w-6 h-6"
                  strokeWidth={active ? 2.5 : 2}
                />
                <span className="text-xs font-medium">{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
