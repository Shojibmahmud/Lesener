import { useState } from 'react';
import { deleteAccount } from '../lib/account';
import { errorMessageStyle, submitButtonStyle } from '../lib/authUi';
import PasswordField from './PasswordField';

// The warning at the top of this modal has always said the account is purged.
// Until this feature it was not: the button called signOut and nothing was
// erased. The wording is therefore deliberately unchanged -- making the button
// work is what makes the sentence true, and rewriting it at the same time would
// hide that nothing about the promise changed, only whether it is kept.
//
// Modelled on ChangePasswordModal throughout: same overlay and card, same
// error / done / busy state, same Cancel-plus-submit pair. It differs in one
// way that matters -- the confirmation is not a courtesy. The reader has just
// destroyed something irreversible, and being dropped on the marketing page
// with no word said would be indistinguishable from a bug.
export default function DeleteModal({ closeDelete, onConfirm }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);

    try {
      await deleteAccount(password);
      setDone(true);
    } catch (deleteError) {
      // The modal stays open with the account intact, so pressing the button
      // again is a retry rather than a fresh start.
      setError(deleteError.message);
    } finally {
      setBusy(false);
    }
  };

  // Dismissing mid-request would leave the reader watching the dashboard while
  // their account was being erased behind it. Cancel takes `disabled`; the
  // backdrop is a div, which `disabled` does nothing to, so it needs the check
  // written out. Once `done`, the backdrop stops dismissing at all -- the note
  // is the only thing standing between them and a silent sign-out.
  const dismiss = () => {
    if (busy || done) return;
    closeDelete();
  };

  return (
    <div
      onClick={dismiss}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        // `margin: auto` on the card instead of centring the flex line: a
        // flex-centred item taller than the backdrop overflows *both* ways and
        // its top becomes unreachable, which is what a tall dialog does on a
        // short phone. Auto margins centre while still allowing a scroll.
        overflowY: 'auto',
        overscrollBehavior: 'contain',
        zIndex: 70,
        padding: 24,
        animation: 'fade .2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          margin: 'auto',
          maxWidth: 420,
          background: 'var(--surf)',
          border: '1px solid var(--line)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-lg)',
          padding: 30,
          animation: 'rise .3s ease',
        }}
      >
        <h2 style={{ font: '400 26px var(--serif)', margin: '0 0 8px' }}>
          {done ? 'Your account is gone' : 'Delete your account?'}
        </h2>

        {done ? (
          <>
            {/* Confirms and leaves the door open, and does neither more nor
                less. No reason is asked for and no alternative is offered: a
                retention nudge at the moment somebody has chosen to leave would
                undo the honesty this whole feature exists to restore. */}
            <p style={{ font: '400 14.5px/1.65 var(--ui)', color: 'var(--muted)', margin: '0 0 24px' }}>
              Your profile, saved words and reading progress have all been erased. Thank you for
              reading with us — you are welcome back any time, with a fresh start.
            </p>
            <button type="button" className="btnp" onClick={onConfirm} style={submitButtonStyle(false)}>
              Goodbye
            </button>
          </>
        ) : (
          <form onSubmit={submit}>
            <p style={{ font: '400 14.5px/1.65 var(--ui)', color: 'var(--muted)', margin: '0 0 22px' }}>
              This purges your profile, saved words and reading progress. It cannot be undone.
            </p>

            {error && (
              <p role="alert" style={errorMessageStyle}>
                {error}
              </p>
            )}

            <PasswordField
              id="delete-password"
              label="Confirm your password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              disabled={busy}
              marginBottom={24}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btng"
                onClick={closeDelete}
                disabled={busy}
                style={{ flex: 1, padding: 13, borderRadius: 11, border: '1px solid var(--line)', font: '600 14px var(--ui)' }}
              >
                Keep my account
              </button>
              <button
                type="submit"
                disabled={busy}
                style={{ flex: 1, padding: 13, borderRadius: 11, background: 'var(--red)', color: '#fff', font: '600 14px var(--ui)', opacity: busy ? 0.65 : 1 }}
              >
                {busy ? 'Deleting…' : 'Delete forever'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
