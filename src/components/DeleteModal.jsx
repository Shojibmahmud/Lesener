export default function DeleteModal({ closeDelete, goLanding }) {
  return (
    <div
      onClick={closeDelete}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 70,
        padding: 24,
        animation: 'fade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--surf)',
          border: '1px solid var(--line)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-lg)',
          padding: 30,
          animation: 'rise .3s ease',
        }}
      >
        <h2 style={{ font: '400 26px var(--serif)', margin: '0 0 8px' }}>Delete your account?</h2>
        <p style={{ font: '400 14.5px/1.65 var(--ui)', color: 'var(--muted)', margin: '0 0 24px' }}>
          This purges your profile, saved words and reading progress. It cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="btng"
            onClick={closeDelete}
            style={{ flex: 1, padding: 13, borderRadius: 11, border: '1px solid var(--line)', font: '600 14px var(--ui)' }}
          >
            Keep my account
          </button>
          <button
            onClick={goLanding}
            style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--red)', color: '#fff', font: '600 14px var(--ui)' }}
          >
            Delete forever
          </button>
        </div>
      </div>
    </div>
  );
}
