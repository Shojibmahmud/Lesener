import { useMemo } from 'react';
import ThemeToggle from './ThemeToggle';

export default function VocabBank({ dark, toggleTheme, saved, goDashboard, onRemove }) {
  const groups = useMemo(() => {
    const gs = [];
    saved.forEach((w) => {
      let g = gs.find((x) => x.title === w.post);
      if (!g) {
        g = { title: w.post, items: [] };
        gs.push(g);
      }
      g.items.push(w);
    });
    return gs;
  }, [saved]);

  const noSaved = saved.length === 0;

  return (
    <div style={{ animation: 'fade .35s ease' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 40px',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--line)',
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            className="btng"
            onClick={goDashboard}
            style={{ width: 34, height: 34, borderRadius: 10, border: '1px solid var(--line)', color: 'var(--muted)', fontSize: 15 }}
          >
            ←
          </button>
          <span style={{ font: '600 19px var(--serif)' }}>Vocabulary bank</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--ind-soft)', color: 'var(--ind)', font: '700 12.5px var(--ui)' }}>
            {saved.length} words
          </span>
          <ThemeToggle dark={dark} onToggle={toggleTheme} />
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '44px 40px 90px' }}>
        {noSaved && (
          <div style={{ border: '1px dashed var(--line)', borderRadius: 18, padding: 56, textAlign: 'center' }}>
            <div style={{ font: '400 26px var(--serif)' }}>Nothing saved yet</div>
            <p style={{ font: '400 14.5px var(--ui)', color: 'var(--muted)', margin: '10px 0 22px' }}>
              Words you keep while reading land here, grouped by their text.
            </p>
            <button
              className="btnp"
              onClick={goDashboard}
              style={{ padding: '13px 22px', borderRadius: 12, background: 'var(--ind)', color: '#fff', font: '600 14px var(--ui)' }}
            >
              Back to dashboard
            </button>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.title} style={{ marginBottom: 38 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
              <h2 style={{ font: '400 22px var(--serif)', margin: 0 }}>{g.title}</h2>
              <span style={{ font: '500 12.5px var(--ui)', color: 'var(--muted)' }}>
                {g.items.length + (g.items.length === 1 ? ' word' : ' words')}
              </span>
            </div>
            {g.items.map((it) => (
              <div
                key={it.de}
                className="rowh"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', alignItems: 'center', gap: 16, padding: '14px 12px', borderBottom: '1px solid var(--line2)', borderRadius: 10 }}
              >
                <span style={{ font: '600 15.5px var(--ui)' }}>{it.de}</span>
                <span style={{ font: '400 15px var(--ui)', color: 'var(--muted)' }}>{it.en}</span>
                <button
                  className="trash"
                  onClick={() => onRemove(it.de, g.title)}
                  style={{ justifySelf: 'end', width: 32, height: 32, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}
                >
                  🗑
                </button>
              </div>
            ))}
          </section>
        ))}
      </main>
    </div>
  );
}
