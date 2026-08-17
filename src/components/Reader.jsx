import { useState, useEffect, useMemo, useRef } from 'react';
import { clean } from '../utils';
import ThemeToggle from './ThemeToggle';

export default function Reader({ post, level, dict, saved, session, onSaveWord, onFinish, goDashboard, dark, toggleTheme }) {
  const [open, setOpen] = useState(null);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const onDocClick = () => setOpen(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const savedSet = useMemo(() => new Set(saved.map((w) => w.de.toLowerCase())), [saved]);

  // The database dictionary is the only dictionary. There is no fallback and no
  // need for one: App shows the loading and error screens until the library has
  // arrived, so this screen never renders without `dict`. A word that is not in
  // it has no translation — the dash is the whole answer.
  //
  // `dict` is a Map rather than a plain object because the keys are arbitrary
  // German words. An object answers for names it was never given —
  // "constructor", "toString" — with a function, which a reader would be shown
  // as though it were a translation.
  const translate = useMemo(() => (term) => dict.get(term) ?? '—', [dict]);

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
            style: {
              position: 'relative',
              display: 'inline-block',
              padding: '0 2px',
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
              onSaveWord({ de: c, en: translation, post: 'Post ' + post.position + ': ' + post.title });
              setOpen(null);
            },
          };
        }),
      })),
    [post, open, savedSet, onSaveWord, translate]
  );

  const onScroll = (e) => {
    const el = e.target;
    const max = el.scrollHeight - el.clientHeight;
    const p = max > 0 ? Math.min(100, Math.round((el.scrollTop / max) * 100)) : 100;
    setProgress((prev) => (p !== prev ? p : prev));
  };

  const progressLabel = progress + '%';
  const noSession = session.length === 0;
  const sessionCountLabel = session.length + (session.length === 1 ? ' word' : ' words');

  return (
    <div style={{ animation: 'fade .35s ease' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <button
              className="btng"
              onClick={goDashboard}
              style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--muted)', fontSize: 15 }}
            >
              ←
            </button>
            <span style={{ font: '600 15px var(--ui)' }}>
              Post {post.position}: {post.title}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ font: '600 12.5px var(--ui)', color: 'var(--muted)' }}>{progressLabel} read</span>
            <ThemeToggle dark={dark} onToggle={toggleTheme} style={{ width: 34, height: 34, fontSize: 15 }} />
          </div>
        </div>
        <div style={{ height: 3, background: 'var(--line2)' }}>
          <div style={{ height: '100%', background: 'var(--ind)', transition: 'width .15s linear', width: progressLabel }} />
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', maxWidth: 1180, margin: '0 auto' }}>
        <div
          ref={scrollRef}
          onScroll={onScroll}
          style={{ height: 'calc(100vh - 57px)', overflowY: 'auto', padding: '56px 56px 140px' }}
        >
          <div style={{ maxWidth: 720, margin: '0 auto' }}>
            <div style={{ font: '600 12px var(--ui)', letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--ind)' }}>
              {level.cefr} · {post.topic}
            </div>
            <h1 style={{ font: '400 44px/1.15 var(--serif)', letterSpacing: '-.025em', margin: '14px 0 34px' }}>
              Post {post.position}: {post.title}
            </h1>
            {paragraphs.map((para) => (
              <p key={para.id} style={{ font: '400 21px/1.85 var(--serif)', color: 'var(--text)', margin: '0 0 30px', textWrap: 'pretty' }}>
                {para.tokens.map((t) => (
                  <span key={t.key} className="w" onClick={t.onClick} style={t.style}>
                    {t.text}
                    {t.isOpen && (
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
                          whiteSpace: 'nowrap',
                          animation: 'pop .22s ease',
                          zIndex: 10,
                          cursor: 'default',
                        }}
                      >
                        <span style={{ font: '600 15px var(--ui)', color: 'var(--text)' }}>{t.translation}</span>
                        <button
                          className="btnp"
                          onClick={t.onSave}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 9,
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
              onClick={onFinish}
              style={{ marginTop: 16, padding: '16px 28px', borderRadius: 12, background: 'var(--ind)', color: '#fff', font: '600 15px var(--ui)' }}
            >
              Finish reading →
            </button>
          </div>
        </div>

        <aside style={{ borderLeft: '1px solid var(--line)', height: 'calc(100vh - 57px)', overflowY: 'auto', padding: '28px 24px', background: 'var(--surf2)' }}>
          <div style={{ font: '600 11.5px var(--ui)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>This session</div>
          <div style={{ font: '400 30px var(--serif)', margin: '6px 0 20px' }}>{sessionCountLabel}</div>
          {noSession && (
            <p style={{ font: '400 13.5px/1.7 var(--ui)', color: 'var(--muted)', border: '1px dashed var(--line)', borderRadius: 14, padding: 16 }}>
              Tap any word in the text to see its translation, then press <strong style={{ color: 'var(--ind)' }}>+</strong> to keep it.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {session.map((s, i) => (
              <div key={s.de + i} style={{ background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px', animation: 'slideup .28s ease' }}>
                <div style={{ font: '600 14px var(--ui)' }}>{s.de}</div>
                <div style={{ font: '400 13px var(--ui)', color: 'var(--muted)', marginTop: 2 }}>{s.en}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
