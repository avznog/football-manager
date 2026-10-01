/**
 * The shell for the only two screens reachable without a session.
 *
 * No navigation: there is nowhere to go yet. Centred on a phone, centred on a desktop.
 */

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="gutter-px flex min-h-svh flex-col items-center justify-center py-10">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-ink">Football Manager</h1>
          <p className="mt-1 text-sm text-ink-muted">La saison de ton équipe à 7.</p>
        </header>
        {children}
      </div>
    </main>
  );
}
