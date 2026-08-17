import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

// `level` and `posts` are never missing here: App shows the loading and error
// screens instead of this one until the library has arrived.
export default function Dashboard({
  dark,
  toggleTheme,
  email,
  level,
  posts,
  postCount,
  savedCount,
  doneCount,
  pctLabel,
  completed,
  menuOpen,
  toggleMenu,
  goVocab,
  signOut,
  askDelete,
  askChangePassword,
  openPost,
  reviewPost,
}) {
  const remainLabel = postCount - doneCount + ' to go';

  return (
    <div style={{ animation: 'fade .35s ease' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 40px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <Logo />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, position: 'relative' }}>
          <button
            className="btng"
            onClick={goVocab}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--line)', font: '600 13px var(--ui)', color: 'var(--text)' }}
          >
            <span style={{ color: 'var(--muted)', fontWeight: 500 }}>Saved</span> {savedCount}
          </button>
          <span style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--grn-soft)', color: 'var(--grn)', font: '700 12.5px var(--ui)', letterSpacing: '.02em' }}>
            {level.cefr} · Level {level.position}
          </span>
          <ThemeToggle dark={dark} onToggle={toggleTheme} />
          <button
            onClick={toggleMenu}
            style={{ width: 36, height: 36, borderRadius: 99, background: 'var(--ind)', color: '#fff', font: '700 13px var(--ui)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            A
          </button>
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 48,
                right: 0,
                width: 250,
                background: 'var(--surf)',
                border: '1px solid var(--line)',
                borderRadius: 16,
                boxShadow: 'var(--shadow-lg)',
                overflow: 'hidden',
                animation: 'rise .2s ease',
                zIndex: 40,
              }}
            >
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line2)' }}>
                <div style={{ font: '500 11.5px var(--ui)', color: 'var(--muted)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Signed in as</div>
                <div style={{ font: '600 14px var(--ui)', marginTop: 4, overflowWrap: 'anywhere' }}>{email}</div>
              </div>
              <button className="rowh" onClick={goVocab} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', font: '500 14px var(--ui)' }}>
                Vocabulary bank
              </button>
              <button className="rowh" onClick={askChangePassword} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', font: '500 14px var(--ui)' }}>
                Change password
              </button>
              <button
                className="rowh"
                onClick={signOut}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', font: '500 14px var(--ui)', borderBottom: '1px solid var(--line2)' }}
              >
                Log out
              </button>
              <div style={{ padding: '14px 16px', background: 'var(--surf2)' }}>
                <div style={{ font: '600 11.5px var(--ui)', color: 'var(--red)', letterSpacing: '.05em', textTransform: 'uppercase' }}>Danger zone</div>
                <button
                  onClick={askDelete}
                  style={{ marginTop: 9, width: '100%', padding: 10, borderRadius: 10, border: '1px solid var(--red)', color: 'var(--red)', font: '600 13px var(--ui)', textAlign: 'left', paddingLeft: 12 }}
                >
                  Delete account
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: '0 auto', padding: 40 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <h1 style={{ font: '400 40px/1.15 var(--serif)', margin: 0, letterSpacing: '-.02em' }}>Guten Tag, Anna.</h1>
            <p style={{ font: '400 15.5px var(--ui)', color: 'var(--muted)', margin: '8px 0 0' }}>
              Level {level.position}: {level.name} — {doneCount} of {postCount} posts completed.
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ font: '700 34px var(--ui)', color: 'var(--ind)', lineHeight: 1 }}>{pctLabel}</div>
            <div style={{ font: '500 12.5px var(--ui)', color: 'var(--muted)' }}>to Level 2</div>
          </div>
        </div>
        <div style={{ marginTop: 22, height: 10, borderRadius: 99, background: 'var(--line2)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: 99, background: 'var(--ind)', transition: 'width .6s cubic-bezier(.2,.7,.3,1)', width: pctLabel }} />
        </div>
        <p style={{ font: '500 13px var(--ui)', color: 'var(--muted)', margin: '12px 0 0' }}>🔒 Level {level.position + 1} unlocks when all {postCount} posts are read — {remainLabel}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginTop: 38 }}>
          {posts.map((p) => {
            const isDone = completed.includes(p.id);
            return (
              <div
                key={p.id}
                className="lift"
                style={{
                  background: 'var(--surf)',
                  border: `1px solid ${isDone ? 'var(--grn)' : 'var(--line)'}`,
                  borderRadius: 18,
                  padding: 22,
                  boxShadow: 'var(--shadow)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ font: '600 11.5px var(--ui)', letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--muted)' }}>Post {p.position}</span>
                  <span
                    style={{
                      padding: '5px 10px',
                      borderRadius: 99,
                      font: '700 11px var(--ui)',
                      letterSpacing: '.03em',
                      background: isDone ? 'var(--grn-soft)' : 'var(--surf2)',
                      color: isDone ? 'var(--grn)' : 'var(--muted)',
                    }}
                  >
                    {isDone ? '✓ Gelesen' : 'Unread'}
                  </span>
                </div>
                <div style={{ font: '400 21px/1.3 var(--serif)', margin: '14px 0 8px', letterSpacing: '-.01em' }}>{p.title}</div>
                <p style={{ font: '400 13.5px/1.65 var(--ui)', color: 'var(--muted)', margin: '0 0 20px' }}>{p.blurb}</p>
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
                  <button
                    className="btng"
                    onClick={() => openPost(p.id)}
                    style={{
                      flex: 1,
                      padding: '11px 16px',
                      borderRadius: 11,
                      font: '600 13.5px var(--ui)',
                      textAlign: 'left',
                      ...(isDone
                        ? { border: '1px solid var(--line)', color: 'var(--text)', background: 'transparent' }
                        : { background: 'var(--ind)', color: '#fff', border: '1px solid var(--ind)' }),
                    }}
                  >
                    {isDone ? 'Read again' : 'Read post'}
                  </button>
                  {isDone && (
                    <button
                      className="btng"
                      onClick={reviewPost}
                      style={{ padding: '11px 14px', borderRadius: 11, border: '1px solid var(--line)', font: '600 13.5px var(--ui)', color: 'var(--muted)' }}
                    >
                      Vocab
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
