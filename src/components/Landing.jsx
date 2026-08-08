import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

const FEATURES = [
  {
    step: '01 — READ',
    title: 'Curated B1 texts on everyday life',
    body: 'No graded-reader stiffness. Ten texts, written to be read straight through.',
  },
  {
    step: '02 — TAP',
    title: 'Every word is a lookup',
    body: 'Translation appears above the word. Save it, keep reading — you never lose your place.',
  },
  {
    step: '03 — LEVEL',
    title: 'Ten posts unlock the next level',
    body: 'Your saved words collect in one bank, grouped by the text they came from.',
  },
];

export default function Landing({ dark, toggleTheme, goSignIn, goSignUp }) {
  return (
    <div style={{ animation: 'fade .4s ease' }}>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 40px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <Logo />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle dark={dark} onToggle={toggleTheme} />
          <button
            className="btng"
            onClick={goSignIn}
            style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--line)', font: '600 13.5px var(--ui)', color: 'var(--text)' }}
          >
            Sign In
          </button>
          <button
            className="btnp"
            onClick={goSignUp}
            style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--ind)', color: '#fff', font: '600 13.5px var(--ui)' }}
          >
            Get Started
          </button>
        </div>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: '1.05fr .95fr',
          gap: 64,
          alignItems: 'center',
          maxWidth: 1240,
          margin: '0 auto',
          padding: '88px 40px 72px',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 999,
              background: 'var(--ind-soft)',
              color: 'var(--ind)',
              font: '600 12px var(--ui)',
              letterSpacing: '.02em',
            }}
          >
            10 curated B1 texts · free to start
          </div>
          <h1 style={{ font: '400 62px/1.06 var(--serif)', letterSpacing: '-.025em', margin: '22px 0 0', textWrap: 'pretty' }}>
            Master German reading through <em style={{ fontStyle: 'italic', color: 'var(--ind)' }}>context</em>.
          </h1>
          <p style={{ font: '400 18px/1.7 var(--ui)', color: 'var(--muted)', margin: '22px 0 0', maxWidth: 460, textWrap: 'pretty' }}>
            Read real B1 texts. Tap any word you don't know for an instant translation, save it with one click, and watch your
            vocabulary bank grow as you level up.
          </p>
          <div style={{ display: 'flex', gap: 12, marginTop: 34 }}>
            <button
              className="btnp"
              onClick={goSignUp}
              style={{ padding: '15px 26px', borderRadius: 12, background: 'var(--ind)', color: '#fff', font: '600 15px var(--ui)' }}
            >
              Start reading — free
            </button>
            <button
              className="btng"
              onClick={goSignIn}
              style={{ padding: '15px 24px', borderRadius: 12, border: '1px solid var(--line)', font: '600 15px var(--ui)', color: 'var(--text)' }}
            >
              I have an account
            </button>
          </div>
          <div style={{ display: 'flex', gap: 28, marginTop: 40, paddingTop: 26, borderTop: '1px solid var(--line)' }}>
            {[
              ['10', 'Curated texts'],
              ['1 tap', 'To save a word'],
              ['B1', 'Level, end to end'],
            ].map(([n, label]) => (
              <div key={label}>
                <div style={{ font: '700 22px var(--ui)' }}>{n}</div>
                <div style={{ font: '500 12.5px var(--ui)', color: 'var(--muted)', marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', inset: '-26px -18px', background: 'var(--ind-soft)', borderRadius: 28, opacity: 0.55 }} />
          <div
            style={{
              position: 'relative',
              background: 'var(--surf)',
              border: '1px solid var(--line)',
              borderRadius: 20,
              boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderBottom: '1px solid var(--line2)',
              }}
            >
              <span style={{ font: '600 12px var(--ui)', color: 'var(--muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                Post 1 · Der Alltag in Berlin
              </span>
              <span style={{ display: 'flex', gap: 5 }}>
                <i style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--line)', display: 'block' }} />
                <i style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--line)', display: 'block' }} />
                <i style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--ind)', display: 'block' }} />
              </span>
            </div>
            <div style={{ padding: '30px 26px 26px', font: '400 19px/2 var(--serif)', color: 'var(--text)' }}>
              Jeden Morgen fahre ich mit der U‑Bahn zur Arbeit. Die{' '}
              <span
                style={{
                  position: 'relative',
                  display: 'inline-block',
                  background: 'var(--ind-soft)',
                  color: 'var(--ind)',
                  borderRadius: 5,
                  padding: '0 3px',
                }}
              >
                Herausforderung
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
                    padding: '11px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    whiteSpace: 'nowrap',
                    animation: 'pop .3s ease',
                  }}
                >
                  <span style={{ font: '600 15px var(--ui)', color: 'var(--text)' }}>challenge</span>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9,
                      background: 'var(--ind)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      font: '600 17px var(--ui)',
                    }}
                  >
                    +
                  </span>
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
              </span>{' '}
              beginnt schon am Bahnsteig, wenn alle{' '}
              <span style={{ background: 'var(--grn-soft)', borderRadius: 5, padding: '0 3px' }}>Fahrgäste</span> gleichzeitig
              einsteigen wollen.
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px',
                borderTop: '1px solid var(--line2)',
                background: 'var(--surf2)',
              }}
            >
              <span style={{ font: '500 12.5px var(--ui)', color: 'var(--muted)' }}>3 words saved this session</span>
              <span style={{ font: '600 12.5px var(--ui)', color: 'var(--grn)' }}>✓ 42% read</span>
            </div>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1240, margin: '0 auto', padding: '0 40px 90px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 20, borderTop: '1px solid var(--line)', paddingTop: 44 }}>
          {FEATURES.map((f) => (
            <div key={f.step}>
              <div style={{ font: '600 12px var(--ui)', color: 'var(--ind)', letterSpacing: '.08em' }}>{f.step}</div>
              <div style={{ font: '400 24px/1.3 var(--serif)', marginTop: 10 }}>{f.title}</div>
              <p style={{ font: '400 14.5px/1.7 var(--ui)', color: 'var(--muted)', margin: '8px 0 0' }}>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer
        style={{
          borderTop: '1px solid var(--line)',
          padding: '26px 40px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: 1240,
          margin: '0 auto',
          font: '500 13px var(--ui)',
          color: 'var(--muted)',
        }}
      >
        <span>© 2026 Lesener</span>
        <span style={{ display: 'flex', gap: 22 }}>
          <a href="#">Impressum</a>
          <a href="#">Datenschutz</a>
          <a href="#">Kontakt</a>
        </span>
      </footer>
    </div>
  );
}
