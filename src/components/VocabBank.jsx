import { useMemo } from 'react';
import ThemeToggle from './ThemeToggle';

export default function VocabBank({ dark, toggleTheme, saved, postLabels, goDashboard, onRemove, removeFailed }) {
  // Grouped by the post a word was met in, in the order the words were saved.
  //
  // The heading comes from the library where the post is still there, so
  // renaming a post updates the bank on the next load. Where it is not — the
  // post was deleted, or unpublished and therefore withheld by RLS — the
  // heading stored with the word answers instead. Such a group is rendered
  // exactly like any other: nothing in the bank links to a post, so there is
  // nothing the reader could try and fail to do.
  //
  // Keyed on post_id, falling back to the stored heading, because two words
  // from two *different* deleted posts both carry a null post_id and must not
  // be merged into one group.
  const groups = useMemo(() => {
    const gs = [];
    saved.forEach((w) => {
      const key = w.post_id ?? 'label:' + w.post_label;
      let g = gs.find((x) => x.key === key);
      if (!g) {
        g = { key, title: postLabels.get(w.post_id) ?? w.post_label, items: [] };
        gs.push(g);
      }
      g.items.push(w);
    });
    return gs;
  }, [saved, postLabels]);

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
        {removeFailed && (
          <p
            role="alert"
            style={{ font: '400 14px/1.7 var(--ui)', color: 'var(--text)', background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 16px', marginBottom: 24 }}
          >
            That word couldn’t be removed. Tap 🗑 again to try once more.
          </p>
        )}
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
          <section key={g.key} style={{ marginBottom: 38 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
              <h2 style={{ font: '400 22px var(--serif)', margin: 0 }}>{g.title}</h2>
              <span style={{ font: '500 12.5px var(--ui)', color: 'var(--muted)' }}>
                {g.items.length + (g.items.length === 1 ? ' word' : ' words')}
              </span>
            </div>
            {g.items.map((it) => (
              <div
                key={it.id}
                className="rowh"
                style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', alignItems: 'center', gap: 16, padding: '14px 12px', borderBottom: '1px solid var(--line2)', borderRadius: 10 }}
              >
                <span style={{ font: '600 15.5px var(--ui)' }}>{it.surface_form}</span>
                <span style={{ font: '400 15px var(--ui)', color: 'var(--muted)' }}>{it.translation ?? '—'}</span>
                <button
                  className="trash"
                  onClick={() => onRemove(it.id)}
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
