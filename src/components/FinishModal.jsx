export default function FinishModal({ doneCount, postCount, pctLabel, session, saveFailed, backToDash, closeModal }) {
  const noSession = session.length === 0;

  return (
    <div
      onClick={closeModal}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: 24,
        animation: 'fade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          background: 'var(--surf)',
          border: '1px solid var(--line)',
          borderRadius: 22,
          boxShadow: 'var(--shadow-lg)',
          padding: 32,
          animation: 'rise .32s cubic-bezier(.2,.7,.3,1)',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 16,
            background: saveFailed ? 'var(--amb-soft, var(--line2))' : 'var(--grn-soft)',
            color: saveFailed ? 'var(--amb, var(--muted))' : 'var(--grn)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
          }}
        >
          {saveFailed ? '!' : '✓'}
        </div>
        <h2 style={{ font: '400 32px/1.15 var(--serif)', margin: '20px 0 6px', letterSpacing: '-.02em' }}>
          {saveFailed ? 'Nicht gespeichert' : 'Gut gemacht!'}
        </h2>
        <p style={{ font: '400 15px/1.6 var(--ui)', color: 'var(--muted)', margin: '0 0 22px' }}>
          {saveFailed
            ? 'Your progress couldn’t be saved. Press Finish reading again to try once more.'
            : `Level progression updated — ${doneCount} of ${postCount} posts completed.`}
        </p>
        {!saveFailed && (
          <div style={{ height: 8, borderRadius: 99, background: 'var(--line2)', overflow: 'hidden', marginBottom: 26 }}>
            <div style={{ height: '100%', background: 'var(--grn)', transition: 'width .8s cubic-bezier(.2,.7,.3,1)', width: pctLabel }} />
          </div>
        )}
        <div style={{ font: '600 11.5px var(--ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>
          New words this session — {session.length}
        </div>
        {noSession && <p style={{ font: '400 14px var(--ui)', color: 'var(--muted)', margin: '0 0 22px' }}>No new words — you knew them all.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 200, overflowY: 'auto', marginBottom: 26 }}>
          {session.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line2)' }}>
              <span style={{ font: '600 14.5px var(--ui)' }}>{s.surface_form}</span>
              <span style={{ font: '400 14px var(--ui)', color: 'var(--muted)' }}>{s.translation ?? '—'}</span>
            </div>
          ))}
        </div>
        <button
          className="btnp"
          onClick={backToDash}
          style={{ width: '100%', padding: 15, borderRadius: 12, background: 'var(--ind)', color: '#fff', font: '600 15px var(--ui)' }}
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
