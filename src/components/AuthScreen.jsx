import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

function tabStyle(active) {
  return {
    flex: 1,
    padding: 10,
    borderRadius: 9,
    font: '600 13.5px var(--ui)',
    transition: 'all .2s ease',
    background: active ? 'var(--surf)' : 'none',
    color: active ? 'var(--text)' : 'var(--muted)',
    boxShadow: active ? 'var(--shadow)' : 'none',
  };
}

export default function AuthScreen({ dark, toggleTheme, goLanding, authTab, setSignUp, setSignIn, goDashboard }) {
  const isUp = authTab === 'up';
  const authTitle = isUp ? 'Create your account' : 'Welcome back';
  const authSub = isUp ? 'Ten B1 texts are waiting. No card, no trial timer.' : 'Pick up where you left off.';
  const authCta = isUp ? 'Start learning' : 'Sign in';

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, position: 'relative', animation: 'fade .35s ease' }}>
      <ThemeToggle dark={dark} onToggle={toggleTheme} style={{ position: 'absolute', top: 24, right: 32 }} />
      <div style={{ position: 'absolute', top: 24, left: 32 }}>
        <Logo onClick={goLanding} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, animation: 'rise .4s cubic-bezier(.2,.7,.3,1)' }}>
        <div style={{ background: 'var(--surf)', border: '1px solid var(--line)', borderRadius: 20, boxShadow: 'var(--shadow-lg)', padding: 32 }}>
          <div style={{ display: 'flex', padding: 4, background: 'var(--surf2)', borderRadius: 12, marginBottom: 26 }}>
            <button onClick={setSignUp} style={tabStyle(isUp)}>
              Create account
            </button>
            <button onClick={setSignIn} style={tabStyle(!isUp)}>
              Sign in
            </button>
          </div>
          <h2 style={{ font: '400 30px/1.2 var(--serif)', margin: '0 0 6px', letterSpacing: '-.02em' }}>{authTitle}</h2>
          <p style={{ font: '400 14.5px/1.6 var(--ui)', color: 'var(--muted)', margin: '0 0 24px' }}>{authSub}</p>

          <label style={{ display: 'block', font: '600 12.5px var(--ui)', color: 'var(--muted)', marginBottom: 7 }}>Email address</label>
          <input
            type="email"
            placeholder="anna@example.de"
            style={{
              width: '100%',
              padding: '13px 14px',
              borderRadius: 11,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--text)',
              font: '400 14.5px var(--ui)',
              marginBottom: 16,
            }}
          />
          <label style={{ display: 'block', font: '600 12.5px var(--ui)', color: 'var(--muted)', marginBottom: 7 }}>Password</label>
          <input
            type="password"
            placeholder="••••••••"
            style={{
              width: '100%',
              padding: '13px 14px',
              borderRadius: 11,
              border: '1px solid var(--line)',
              background: 'var(--bg)',
              color: 'var(--text)',
              font: '400 14.5px var(--ui)',
              marginBottom: 24,
            }}
          />
          <button
            className="btnp"
            onClick={goDashboard}
            style={{ width: '100%', padding: 15, borderRadius: 12, background: 'var(--ind)', color: '#fff', font: '600 15px var(--ui)' }}
          >
            {authCta}
          </button>
          <p style={{ font: '400 12.5px/1.6 var(--ui)', color: 'var(--muted)', textAlign: 'center', margin: '18px 0 0' }}>
            By continuing you agree to our terms and privacy policy.
          </p>
        </div>
      </div>
    </div>
  );
}
