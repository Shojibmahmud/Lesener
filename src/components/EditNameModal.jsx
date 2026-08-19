import { useState } from 'react';
import { updateProfileName } from '../lib/profile';
import { errorMessageStyle, inputStyle, labelStyle, submitButtonStyle } from '../lib/authUi';

// Follows ChangePasswordModal throughout: same overlay, same card, same
// busy/error handling, same Cancel-and-submit pair. The difference is what
// happens on success — a password change ends in its own confirmation because
// nothing on screen reflects it, whereas a name change is visible the moment
// the dashboard behind this re-renders. So this closes, and the greeting is the
// confirmation.
export default function EditNameModal({ profile, onSaved, onClose }) {
  const [first, setFirst] = useState(profile?.first_name ?? '');
  const [last, setLast] = useState(profile?.last_name ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);

    try {
      const saved = await updateProfileName({ firstName: first, lastName: last });
      onSaved(saved);
      onClose();
    } catch (saveError) {
      // Stays open, says so, and leaves the old name where it is. A failure that
      // closed the dialog would be indistinguishable from success until the
      // reader noticed the greeting had not changed.
      setError(saveError.message);
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
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
        <h2 style={{ font: '400 26px var(--serif)', margin: '0 0 8px' }}>Your name</h2>

        <form onSubmit={submit}>
          <p style={{ font: '400 14.5px/1.65 var(--ui)', color: 'var(--muted)', margin: '0 0 22px' }}>
            This is how Lesener greets you. Only your first name is shown on the dashboard.
          </p>

          {error && (
            <p role="alert" style={errorMessageStyle}>
              {error}
            </p>
          )}

          <label htmlFor="edit-first-name" style={labelStyle}>
            First name
          </label>
          <input
            id="edit-first-name"
            type="text"
            required
            autoComplete="given-name"
            maxLength={60}
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            disabled={busy}
            style={{ ...inputStyle, marginBottom: 16 }}
          />

          {/* Not required, and deliberately so: an email address carries no
              surname, so every reader whose name was derived from theirs has
              none. Clearing it puts them back in that state, which the
              dashboard and the account menu both render without comment. */}
          <label htmlFor="edit-last-name" style={labelStyle}>
            Last name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id="edit-last-name"
            type="text"
            autoComplete="family-name"
            maxLength={60}
            value={last}
            onChange={(e) => setLast(e.target.value)}
            disabled={busy}
            style={{ ...inputStyle, marginBottom: 24 }}
          />

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btng"
              onClick={onClose}
              disabled={busy}
              style={{ flex: 1, padding: 13, borderRadius: 11, border: '1px solid var(--line)', font: '600 14px var(--ui)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btnp"
              disabled={busy}
              style={{ ...submitButtonStyle(busy), flex: 1, padding: 13, borderRadius: 11, font: '600 14px var(--ui)' }}
            >
              {busy ? 'Saving…' : 'Save name'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
