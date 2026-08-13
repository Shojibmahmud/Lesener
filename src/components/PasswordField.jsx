import { useState } from 'react';
import { inputStyle, labelStyle } from '../lib/authUi';

// Flow A ends by signing the reader out, so a typo in a new password locks them
// straight back out of the account they are half way through recovering — with
// another wait for another email. Letting them read what they typed is the
// cheapest guard against that, and beats a second "confirm password" box on a
// phone keyboard.
export default function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  minLength,
  marginBottom = 16,
}) {
  const [shown, setShown] = useState(false);

  return (
    <>
      <label htmlFor={id} style={labelStyle}>
        {label}
      </label>
      <div style={{ position: 'relative', marginBottom }}>
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          placeholder="••••••••"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{ ...inputStyle, paddingRight: 62 }}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-pressed={shown}
          style={{
            position: 'absolute',
            top: '50%',
            right: 10,
            transform: 'translateY(-50%)',
            padding: '5px 8px',
            borderRadius: 7,
            color: 'var(--muted)',
            font: '600 11.5px var(--ui)',
            letterSpacing: '.04em',
            textTransform: 'uppercase',
          }}
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
    </>
  );
}
