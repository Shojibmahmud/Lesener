import Logo from './Logo';

// The library could not be fetched. Deliberately generic: it does not try to
// tell being offline apart from the database refusing, because a reader can do
// nothing different either way and a wrong guess reads worse than no guess.
export default function ContentError({ onRetry }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        background: 'var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        animation: 'fade .35s ease',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: 'var(--surf)',
          border: '1px solid var(--line)',
          borderRadius: 22,
          boxShadow: 'var(--shadow)',
          padding: 32,
          textAlign: 'center',
          animation: 'rise .32s cubic-bezier(.2,.7,.3,1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Logo size={20} />
        </div>
        <h1 style={{ font: '400 26px/1.25 var(--serif)', margin: '22px 0 8px', letterSpacing: '-.02em' }}>
          We couldn’t load your library.
        </h1>
        <p style={{ font: '400 14.5px/1.65 var(--ui)', color: 'var(--muted)', margin: '0 0 24px' }}>
          Something went wrong on the way. Try again in a moment.
        </p>
        <button
          className="btnp"
          onClick={onRetry}
          style={{ width: '100%', padding: 14, borderRadius: 12, background: 'var(--ind)', color: '#fff', font: '600 15px var(--ui)' }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
