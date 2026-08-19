import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

// The avatar's letter. `charAt(0)` is wrong here in two ways, both found by
// looking at a running build rather than at a test: on a Bengali name it takes
// the bare consonant and leaves its vowel sign behind — শোহাব came out as শ —
// and on anything outside the basic plane it returns half a surrogate pair,
// which renders as an empty box. Segmenting by grapheme gets the whole visible
// character in both cases. Intl.Segmenter is the right tool and is everywhere
// the app runs; the fallback is for a runtime that lacks it, and takes a whole
// code point, which is still never half a character.
function firstLetter(source) {
  const text = source.trim();
  if (!text) return '?';

  const cluster =
    typeof Intl !== 'undefined' && Intl.Segmenter
      ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)][0].segment
      : [...text][0];

  // Scripts without letter case, Bengali among them, return the cluster
  // unchanged — which is the correct answer, not a failure to capitalise.
  return cluster.toUpperCase();
}

// `level` and `posts` are never missing here: App shows the loading and error
// screens instead of this one until the library has arrived.
export default function Dashboard({
  dark,
  toggleTheme,
  email,
  profile,
  level,
  levels,
  unlocked,
  selectLevel,
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
  askEditName,
  openPost,
  reviewPost,
}) {
  // Sign-up requires both names and the accounts that predate it were given
  // one, so a nameless reader should not exist. These fallbacks are a guard
  // rather than a state anyone should reach: without them a missing name would
  // put the word "undefined" in the largest type on the page. The greeting drops
  // the name entirely rather than leaving a gap, so it stays a whole sentence.
  const firstName = profile?.first_name ?? '';
  const greeting = firstName ? `Grüß Gott, ${firstName}.` : 'Grüß Gott.';
  const initial = firstLetter(firstName || email || '?');
  // The surname is genuinely optional — every backfilled reader has none, since
  // an email address does not carry one — so this must not render a stray space.
  const fullName = [firstName, profile?.last_name].filter(Boolean).join(' ');

  // Two different nothings, and they must never be worded alike.
  //
  // A locked level reports a post count while handing over none of its posts, so
  // an empty list there means "withheld". An unlocked level with an empty list
  // means the posts genuinely are not there. Telling a reader "no posts in this
  // level yet" about a level they simply have not earned is a false statement
  // about the library; telling them a level "unlocks when..." about one they
  // already opened is a false statement about them.
  const isLocked = unlocked ? !unlocked.get(level.id) : false;
  const isEmpty = !isLocked && posts.length === 0;

  const remainLabel = postCount - doneCount + ' to go';

  // C5: only promise a level that exists. The highest level has nothing above
  // it, so the line would be describing a level nobody wrote.
  const nextLevel = (levels ?? []).find((l) => l.position === level.position + 1);
  // And only while it is still shut. At "0 to go" the unlock has already
  // happened, and a padlock over an open door reads as a bug.
  const showUnlockLine = Boolean(nextLevel) && (unlocked ? !unlocked.get(nextLevel.id) : true);

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
            {initial}
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
                {fullName && (
                  <div style={{ font: '600 14px var(--ui)', marginTop: 4, overflowWrap: 'anywhere' }}>{fullName}</div>
                )}
                <div style={{ font: `${fullName ? '400' : '600'} 13px var(--ui)`, color: fullName ? 'var(--muted)' : 'var(--text)', marginTop: 4, overflowWrap: 'anywhere' }}>{email}</div>
              </div>
              <button className="rowh" onClick={goVocab} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', font: '500 14px var(--ui)' }}>
                Vocabulary bank
              </button>
              <button className="rowh" onClick={askEditName} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', font: '500 14px var(--ui)' }}>
                Edit your name
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
        {/* Every level, locked ones included. A level a reader cannot open yet
            is still worth seeing — it is what they are working towards, and
            hiding it makes the progress line above it meaningless. Rendered only
            when there is more than one, because a single-level switcher offers a
            choice that does not exist. */}
        {(levels ?? []).length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 26, flexWrap: 'wrap' }}>
            {levels.map((l) => {
              const isOpen = unlocked ? unlocked.get(l.id) : true;
              const isCurrent = l.id === level.id;
              return (
                <button
                  key={l.id}
                  className="btng"
                  onClick={() => selectLevel(l.id)}
                  disabled={!isOpen}
                  aria-current={isCurrent ? 'true' : undefined}
                  title={isOpen ? undefined : `Finish every post in Level ${l.position - 1} to open this`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '9px 15px',
                    borderRadius: 11,
                    border: `1px solid ${isCurrent ? 'var(--ind)' : 'var(--line)'}`,
                    background: isCurrent ? 'var(--ind-soft)' : 'var(--surf)',
                    color: isOpen ? (isCurrent ? 'var(--ind)' : 'var(--text)') : 'var(--muted)',
                    font: '600 13px var(--ui)',
                    // Greyed and unpressable, not hidden. The cursor is the only
                    // hint a reader gets before they try it.
                    opacity: isOpen ? 1 : 0.55,
                    cursor: isOpen ? 'pointer' : 'not-allowed',
                  }}
                >
                  {!isOpen && <span aria-hidden="true">🔒</span>}
                  Level {l.position}: {l.name}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <div>
            <h1 style={{ font: '400 40px/1.15 var(--serif)', margin: 0, letterSpacing: '-.02em' }}>{greeting}</h1>
            <p style={{ font: '400 15.5px var(--ui)', color: 'var(--muted)', margin: '8px 0 0' }}>
              Level {level.position}: {level.name}
              {/* The count comes from the level's own record, not from the posts
                  in hand, so with none handed over it would state a library that
                  is nowhere on screen. The level still gets named: the reader
                  should know which one is empty. */}
              {!isEmpty && ` — ${doneCount} of ${postCount} posts completed.`}
            </p>
          </div>
          {!isEmpty && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ font: '700 34px var(--ui)', color: 'var(--ind)', lineHeight: 1 }}>{pctLabel}</div>
              <div style={{ font: '500 12.5px var(--ui)', color: 'var(--muted)' }}>
                {nextLevel ? `to Level ${nextLevel.position}` : 'of this level'}
              </div>
            </div>
          )}
        </div>
        {isLocked ? (
          // Same shape as the empty panel, deliberately different words. The
          // reader is told what would open this, which is the one thing the
          // empty message must never claim.
          <div
            style={{
              marginTop: 38,
              background: 'var(--surf)',
              border: '1px solid var(--line)',
              borderRadius: 18,
              padding: '56px 22px',
              boxShadow: 'var(--shadow)',
              textAlign: 'center',
            }}
          >
            <p style={{ font: '400 21px/1.3 var(--serif)', margin: 0, letterSpacing: '-.01em' }}>
              🔒 Level {level.position} is locked.
            </p>
            <p style={{ font: '400 14px var(--ui)', color: 'var(--muted)', margin: '10px 0 0' }}>
              Finish every post in Level {level.position - 1} to open it.
            </p>
          </div>
        ) : isEmpty ? (
          // Deliberately nothing to press. No reader action makes content
          // appear, and a control that cannot help reads worse than none — the
          // header still offers the vocabulary bank, the theme and sign-out.
          // Card styling, not the error screen's: this is part of the dashboard.
          <div
            style={{
              marginTop: 38,
              background: 'var(--surf)',
              border: '1px solid var(--line)',
              borderRadius: 18,
              padding: '56px 22px',
              boxShadow: 'var(--shadow)',
              textAlign: 'center',
            }}
          >
            <p style={{ font: '400 21px/1.3 var(--serif)', margin: 0, letterSpacing: '-.01em' }}>No posts in this level yet.</p>
          </div>
        ) : (
          <>
            <div style={{ marginTop: 22, height: 10, borderRadius: 99, background: 'var(--line2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, background: 'var(--ind)', transition: 'width .6s cubic-bezier(.2,.7,.3,1)', width: pctLabel }} />
            </div>
            {showUnlockLine && (
              <p style={{ font: '500 13px var(--ui)', color: 'var(--muted)', margin: '12px 0 0' }}>🔒 Level {nextLevel.position} unlocks when all {postCount} posts are read — {remainLabel}</p>
            )}
          </>
        )}

        {/* Left unguarded: with no posts this maps to no children, and dropping
            its margin too makes it occupy nothing at all. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, marginTop: isEmpty || isLocked ? 0 : 38 }}>
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
