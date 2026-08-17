import Logo from './Logo';

// Shown between signing in and the library arriving. Before the screens read
// the database this gap did not exist — the bundled copy was there the moment
// the dashboard rendered — so this is the one thing about Stage C a reader is
// meant to notice.
export default function ContentLoading() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        animation: 'fade .35s ease',
      }}
    >
      <div style={{ animation: 'pulse 1.7s ease-in-out infinite' }}>
        <Logo size={22} />
      </div>
      <p style={{ font: '500 14px var(--ui)', color: 'var(--muted)', margin: 0 }}>Loading your library…</p>
    </div>
  );
}
