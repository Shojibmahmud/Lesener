import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { clean } from '../utils';
import ThemeToggle from './ThemeToggle';
import { gutter, useIsNarrow } from '../lib/responsive';

// The height of the collapsed session bar on a phone. The text pane reserves it
// as bottom padding so the Finish control can never end up underneath it, and
// the translation bar sits directly on top of it.
const BAR_HEIGHT = 52;

export default function Reader({ post, level, dict, saved, session, onSaveWord, saveWordFailed, onFinish, goDashboard, dark, toggleTheme }) {
  const [open, setOpen] = useState(null);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef(null);

  // The one place on this screen where the layout changes shape rather than
  // size: the 300px sidebar becomes a sheet pinned to the bottom edge. Below
  // 820px the sidebar left the article about 178px of measure, which set German
  // prose at roughly one word per line.
  const narrow = useIsNarrow();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(null);

  useEffect(() => {
    const onDocClick = () => setOpen(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // `term` is already the lowercase key the database stores and the dictionary
  // is looked up by, so there is nothing left to normalise here.
  const savedSet = useMemo(() => new Set(saved.map((w) => w.term)), [saved]);

  // The database dictionary is the only dictionary. There is no fallback and no
  // need for one: App shows the loading and error screens until the library has
  // arrived, so this screen never renders without `dict`. A word that is not in
  // it has no translation — the dash is the whole answer.
  //
  // `dict` is a Map rather than a plain object because the keys are arbitrary
  // German words. An object answers for names it was never given —
  // "constructor", "toString" — with a function, which a reader would be shown
  // as though it were a translation.
  // Returns the raw lookup, undefined and all. The em dash is applied at each
  // place a translation is *displayed*, never here: what gets saved has to be
  // able to say "there is no translation", and a stored dash could not be told
  // apart from a dictionary entry that genuinely reads as one.
  const translate = useMemo(() => (term) => dict.get(term), [dict]);

  const paragraphs = useMemo(
    () =>
      post.body.split('\n\n').map((para, pi) => ({
        id: pi,
        tokens: para.split(/\s+/).map((raw, wi) => {
          const key = pi + '-' + wi;
          const c = clean(raw);
          const isSaved = savedSet.has(c.toLowerCase());
          const isOpen = open === key;
          const translation = translate(c.toLowerCase());
          return {
            key,
            text: raw + ' ',
            isOpen,
            isSaved,
            translation,
            translationLabel: translation ?? '—',
            style: {
              position: 'relative',
              display: 'inline-block',
              padding: '0 2px',
              // Each word is its own inline-block, and an inline-block never
              // breaks internally — so without this a single long compound noun
              // sets a min-content floor that pushes the whole column wider than
              // the screen instead of wrapping.
              overflowWrap: 'break-word',
              ...(isSaved ? { background: 'var(--grn-soft)', boxShadow: 'inset 0 -2px 0 var(--grn)' } : {}),
              ...(isOpen ? { background: 'var(--ind-soft)', color: 'var(--ind)' } : {}),
            },
            onClick: (e) => {
              e.stopPropagation();
              if (!c) return;
              setOpen(isOpen ? null : key);
            },
            onSave: (e) => {
              e.stopPropagation();
              if (isSaved) {
                setOpen(null);
                return;
              }
              // The surface form as tapped, and the raw translation. App owns
              // the post and composes the heading; the reader no longer needs
              // to know how a heading is spelled.
              onSaveWord({ surfaceForm: c, translation });
              setOpen(null);
            },
          };
        }),
      })),
    [post, open, savedSet, onSaveWord, translate]
  );

  // On a phone the translation is a bar fixed above the session sheet rather
  // than a popover over the word, so it needs the open token rather than just
  // the key. `paragraphs` is already rebuilt whenever `open` changes, so this
  // costs no more than the rebuild that produced it.
  const openToken = useMemo(() => {
    for (const para of paragraphs) {
      const found = para.tokens.find((t) => t.isOpen);
      if (found) return found;
    }
    return null;
  }, [paragraphs]);

  // A post with nothing to scroll is entirely read the moment it is on screen,
  // which is why the no-overflow case is 100 rather than 0.
  const measure = (el) => {
    const max = el.scrollHeight - el.clientHeight;
    return max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 100;
  };

  // Measured on arrival, not only on scroll. Waiting for a scroll event means a
  // post short enough not to scroll never fires one, so the header would read
  // "0% read" for a post the reader can see all of — and pressing Finish would
  // store that 0 as the percentage they reached.
  useLayoutEffect(() => {
    if (scrollRef.current) setProgress(measure(scrollRef.current));
  }, [post]);

  const onScroll = (e) => {
    const p = measure(e.target);
    setProgress((prev) => (p !== prev ? p : prev));
  };

  const progressLabel = progress + '%';
  const noSession = session.length === 0;
  const sessionCountLabel = session.length + (session.length === 1 ? ' word' : ' words');
  const sessionCount = session.length;
  const seenCount = useRef(sessionCount);

  // With the sheet collapsed the reader cannot see the card slide in, so the
  // bar names the word for a moment instead. Confirmation without taking them
  // out of the text, which auto-expanding on every save would.
  useEffect(() => {
    if (sessionCount <= seenCount.current) {
      seenCount.current = sessionCount;
      return undefined;
    }
    seenCount.current = sessionCount;
    setJustSaved(session[sessionCount - 1]?.surface_form ?? null);
    const timer = setTimeout(() => setJustSaved(null), 1600);
    return () => clearTimeout(timer);
  }, [sessionCount, session]);

  // A failure is rare and worth interrupting for: the retry message lives in the
  // sheet, and a reader who cannot see it believes a word was saved that was not.
  useEffect(() => {
    if (saveWordFailed) setSheetOpen(true);
  }, [saveWordFailed]);

  const failureNotice = (
    <p
      role="alert"
      style={{ font: '400 13.5px/1.7 var(--ui)', color: 'var(--text)', background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, marginBottom: 14 }}
    >
      That word couldn’t be saved. Tap <strong style={{ color: 'var(--ind)' }}>+</strong> again to try once more.
    </p>
  );

  const sessionCards = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {session.map((s) => (
        <div key={s.id} style={{ background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px', animation: 'slideup .28s ease' }}>
          <div style={{ font: '600 14px var(--ui)' }}>{s.surface_form}</div>
          <div style={{ font: '400 13px var(--ui)', color: 'var(--muted)', marginTop: 2 }}>{s.translation ?? '—'}</div>
        </div>
      ))}
    </div>
  );

  const emptyHint = (
    <p style={{ font: '400 13.5px/1.7 var(--ui)', color: 'var(--muted)', border: '1px dashed var(--line)', borderRadius: 14, padding: 16 }}>
      Tap any word in the text to see its translation, then press <strong style={{ color: 'var(--ind)' }}>+</strong> to keep it.
    </p>
  );

  // The bar carries the instruction while there is nothing to count, so a
  // first-time reader is told how this works without having to open an empty
  // sheet to find out.
  const barLabel = justSaved
    ? justSaved + ' · saved'
    : noSession
      ? 'Tap any word to translate'
      : 'This session · ' + sessionCountLabel;

  return (
    // A fixed-height flex column, which is what lets the magic number go. The
    // panes used to be `calc(100vh - 57px)` against a header that is actually
    // 64px tall (26px padding, a 34px button, the 3px progress track and a 1px
    // border), so they had always overhung the viewport by 7px — and 100vh on a
    // phone excludes the URL bar, so the overhang there was far worse.
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', animation: 'fade .35s ease' }}>
      <header style={{ flex: 'none', background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: `13px ${gutter}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            <button
              className="btng"
              onClick={goDashboard}
              style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--muted)', fontSize: 15, flexShrink: 0 }}
            >
              ←
            </button>
            {/* The title is unbounded and a post title can be long, so on a
                narrow row it is the thing that has to give. */}
            <span style={{ font: '600 15px var(--ui)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Post {post.position}: {post.title}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{ font: '600 12.5px var(--ui)', color: 'var(--muted)' }}>{progressLabel} read</span>
            <ThemeToggle dark={dark} onToggle={toggleTheme} style={{ width: 34, height: 34, fontSize: 15 }} />
          </div>
        </div>
        <div style={{ height: 3, background: 'var(--line2)' }}>
          <div style={{ height: '100%', background: 'var(--ind)', transition: 'width .15s linear', width: progressLabel }} />
        </div>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: narrow ? '1fr' : '1fr 300px',
          // Load-bearing. Without an explicit row track the grid gets one
          // implicit `auto` row, an auto track sizes to its items' max-content
          // contribution, and a scroll container contributes its *content's*
          // height — so the row would grow past this container and nothing
          // inside would ever scroll.
          gridTemplateRows: 'minmax(0, 1fr)',
          maxWidth: 1180,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* This element must stay the first thing in the document carrying
            `overflow-y: auto`: tests/reading-progress.test.jsx finds the scroll
            container by that inline-style substring and takes the first match.
            Nothing above it may gain an overflow. */}
        <div
          ref={scrollRef}
          onScroll={onScroll}
          style={{
            minHeight: 0,
            overflowY: 'auto',
            padding: narrow ? `28px ${gutter} ${BAR_HEIGHT + 80}px` : '56px 56px 140px',
          }}
        >
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ font: '600 12px var(--ui)', letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--ind)' }}>
              {level.cefr} · {post.topic}
            </div>
            <h1
              style={{
                fontWeight: 400,
                fontSize: 'clamp(26px, 6.5vw, 44px)',
                lineHeight: 1.15,
                fontFamily: 'var(--serif)',
                letterSpacing: '-.025em',
                margin: '14px 0 34px',
              }}
            >
              Post {post.position}: {post.title}
            </h1>
            {paragraphs.map((para) => (
              <p
                key={para.id}
                style={{
                  fontWeight: 400,
                  fontSize: 'clamp(18px, 4.6vw, 21px)',
                  lineHeight: 1.85,
                  fontFamily: 'var(--serif)',
                  color: 'var(--text)',
                  margin: '0 0 30px',
                  textWrap: 'pretty',
                }}
              >
                {para.tokens.map((t) => (
                  <span key={t.key} className="w" onClick={t.onClick} style={t.style}>
                    {t.text}
                    {/* The popover is the wide-screen presentation only. On a
                        phone the same translation is the fixed bar below, and
                        the two are mutually exclusive in JSX rather than one
                        being hidden by CSS — a hidden copy would still be in the
                        accessibility tree and would give every `+` and every
                        `—` in the Reader's tests a second match. */}
                    {t.isOpen && !narrow && (
                      <span
                        style={{
                          position: 'absolute',
                          left: '50%',
                          bottom: 'calc(100% + 12px)',
                          transform: 'translateX(-50%)',
                          background: 'var(--surf)',
                          border: '1px solid var(--line)',
                          borderRadius: 14,
                          boxShadow: 'var(--shadow-lg)',
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          // Was `nowrap`. The text pane is already a two-axis
                          // scroll container — an `overflow-y` that is not
                          // `visible` makes `overflow-x` compute to `auto` — so
                          // a long translation on a word near the edge was being
                          // clipped at every width, not only on a phone.
                          maxWidth: 'min(280px, 60vw)',
                          animation: 'pop .22s ease',
                          zIndex: 10,
                          cursor: 'default',
                        }}
                      >
                        <span style={{ font: '600 15px var(--ui)', color: 'var(--text)' }}>{t.translationLabel}</span>
                        <button
                          className="btnp"
                          onClick={t.onSave}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 9,
                            flexShrink: 0,
                            background: t.isSaved ? 'var(--grn)' : 'var(--ind)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            font: '600 16px var(--ui)',
                          }}
                        >
                          {t.isSaved ? '✓' : '+'}
                        </button>
                        <i
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: '100%',
                            marginLeft: -6,
                            width: 12,
                            height: 12,
                            background: 'var(--surf)',
                            borderRight: '1px solid var(--line)',
                            borderBottom: '1px solid var(--line)',
                            transform: 'rotate(45deg) translateY(-5px)',
                            borderBottomRightRadius: 3,
                          }}
                        />
                      </span>
                    )}
                  </span>
                ))}
              </p>
            ))}
            <button
              className="btnp"
              onClick={() => onFinish(progress)}
              style={{ marginTop: 16, padding: '16px 28px', borderRadius: 12, background: 'var(--ind)', color: '#fff', font: '600 15px var(--ui)' }}
            >
              Finish reading →
            </button>
          </div>
        </div>

        {!narrow && (
          <aside style={{ borderLeft: '1px solid var(--line)', minHeight: 0, overflowY: 'auto', padding: '28px 24px', background: 'var(--surf2)' }}>
            <div style={{ font: '600 11.5px var(--ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>This session</div>
            <div style={{ font: '400 30px var(--serif)', margin: '6px 0 20px' }}>{sessionCountLabel}</div>
            {saveWordFailed && failureNotice}
            {noSession && emptyHint}
            {sessionCards}
          </aside>
        )}
      </div>

      {narrow && (
        <>
          {/* Fixed to the viewport rather than absolutely placed on the word:
              there is no clamping to do, nothing to flip, and no clipping by the
              scroll container. `slideup` is reused rather than `pop`, because
              `pop` bakes in `translate(-50%, …)` for a popover centred on its
              word — and it is shared with the Landing hero, so it cannot be
              changed to suit this. */}
          {openToken && (
            <div
              style={{ position: 'fixed', left: 0, right: 0, bottom: BAR_HEIGHT, zIndex: 30, display: 'flex', justifyContent: 'center', padding: '0 12px 10px', pointerEvents: 'none' }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  pointerEvents: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  maxWidth: '100%',
                  background: 'var(--surf)',
                  border: '1px solid var(--line)',
                  borderRadius: 14,
                  boxShadow: 'var(--shadow-lg)',
                  padding: '12px 14px',
                  animation: 'slideup .22s ease',
                }}
              >
                <span style={{ font: '600 15px var(--ui)', color: 'var(--text)', minWidth: 0 }}>{openToken.translationLabel}</span>
                <button
                  className="btnp"
                  onClick={openToken.onSave}
                  style={{
                    width: 44,
                    height: 44,
                    flexShrink: 0,
                    borderRadius: 12,
                    background: openToken.isSaved ? 'var(--grn)' : 'var(--ind)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    font: '600 18px var(--ui)',
                  }}
                >
                  {openToken.isSaved ? '✓' : '+'}
                </button>
              </div>
            </div>
          )}

          <aside
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 25,
              background: 'var(--surf2)',
              borderTop: '1px solid var(--line)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <button
              onClick={() => setSheetOpen((o) => !o)}
              aria-expanded={sheetOpen}
              style={{
                width: '100%',
                height: BAR_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: `0 ${gutter}`,
                font: '600 13.5px var(--ui)',
                color: 'var(--text)',
                textAlign: 'left',
              }}
            >
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{barLabel}</span>
              <span aria-hidden="true" style={{ color: 'var(--muted)', flexShrink: 0, marginLeft: 12 }}>
                {sheetOpen ? '▼' : '▲'}
              </span>
            </button>
            {sheetOpen && (
              <div style={{ maxHeight: '55dvh', overflowY: 'auto', padding: `4px ${gutter} 20px` }}>
                {saveWordFailed && failureNotice}
                {noSession && emptyHint}
                {sessionCards}
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}
