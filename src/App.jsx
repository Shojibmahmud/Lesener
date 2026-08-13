import { useState, useEffect, useCallback, useRef } from 'react';
import { POSTS } from './data';
import { supabase } from './lib/supabase';
import { linkError, startedInRecovery } from './lib/recovery';
import Landing from './components/Landing';
import AuthScreen from './components/AuthScreen';
import NewPassword from './components/NewPassword';
import Dashboard from './components/Dashboard';
import Reader from './components/Reader';
import VocabBank from './components/VocabBank';
import FinishModal from './components/FinishModal';
import DeleteModal from './components/DeleteModal';
import ChangePasswordModal from './components/ChangePasswordModal';

const THEME_KEY = 'lesener-theme';

export default function App() {
  const [theme, setThemeState] = useState('light');
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  // A recovery link grants a real session, so without seeding the screen from
  // the URL up front the dashboard would flash before PASSWORD_RECOVERY lands.
  const [screen, setScreen] = useState(startedInRecovery ? 'reset' : linkError ? 'auth' : 'landing');
  const [authTab, setAuthTab] = useState(linkError ? 'in' : 'up');
  const [authForgot, setAuthForgot] = useState(Boolean(linkError));
  const [authMessage, setAuthMessage] = useState(linkError ? { kind: 'error', text: linkError } : null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [completed, setCompleted] = useState([1, 2, 3, 4, 5, 6, 7]);
  const [active, setActive] = useState(8);
  const [saved, setSaved] = useState([
    { de: 'Herausforderung', en: 'challenge', post: 'Post 1: Der Alltag in Berlin' },
    { de: 'gleichzeitig', en: 'simultaneously', post: 'Post 1: Der Alltag in Berlin' },
    { de: 'Zusammenhang', en: 'context', post: 'Post 1: Der Alltag in Berlin' },
  ]);
  const [session, setSession] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  // Finishing a reset signs out globally, which fires the same SIGNED_OUT event
  // as pressing Log out. This is how the listener tells the two apart.
  const resetCompleted = useRef(false);

  // A reset link that failed lands someone on the auth screen holding an
  // explanation — while they may still be signed in from before. Without this
  // the session check below would read that screen as "signed out and idling"
  // and forward them to the dashboard, silently binning the explanation.
  const unreadLinkError = useRef(Boolean(linkError));

  const setTheme = useCallback((t) => {
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* localStorage unavailable — theme just won't persist */
    }
    setThemeState(t);
  }, []);

  useEffect(() => {
    let t = 'light';
    try {
      t = localStorage.getItem(THEME_KEY) || 'light';
    } catch {
      /* localStorage unavailable — fall back to light */
    }
    setTheme(t);
  }, [setTheme]);

  // supabase-js fires INITIAL_SESSION on subscribe, so this covers restoring a
  // stored session on reload as well as every later sign-in and sign-out.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, authSession) => {
      setUser(authSession?.user ?? null);
      setAuthReady(true);

      // Fired instead of SIGNED_IN when the page was opened from a recovery
      // link. The session it carries belongs to whoever the link was sent to —
      // which may not be who was signed in a moment ago.
      if (event === 'PASSWORD_RECOVERY') {
        setScreen('reset');
        setMenuOpen(false);
        setShowChangePassword(false);
        return;
      }

      if (event === 'SIGNED_OUT') {
        setMenuOpen(false);
        setShowModal(false);
        setShowDelete(false);
        setShowChangePassword(false);
        setSession([]);

        if (resetCompleted.current) {
          resetCompleted.current = false;
          setAuthTab('in');
          setAuthForgot(false);
          setAuthMessage({ kind: 'notice', text: 'Password updated. Sign in with your new password.' });
          setScreen('auth');
          return;
        }

        setScreen('landing');
        return;
      }

      // SIGNED_IN re-fires when the tab regains focus, so only move someone who
      // is still sitting on a signed-out screen — never yank them out of a post,
      // and never off the reset screen before they have chosen a password.
      if (authSession && !unreadLinkError.current) {
        setScreen((s) => (s === 'landing' || s === 'auth' ? 'dash' : s));
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const dark = theme === 'dark';
  const toggleTheme = () => setTheme(dark ? 'light' : 'dark');

  // Any deliberate move away means the explanation has been read, so the normal
  // "you have a session, go to the dashboard" behaviour can resume.
  const dismissLinkError = () => {
    unreadLinkError.current = false;
  };

  const goLanding = () => {
    dismissLinkError();
    setScreen('landing');
    setMenuOpen(false);
    setShowDelete(false);
  };
  // The SIGNED_OUT branch of the auth listener does the navigating and clears
  // the per-user state, so there is nothing to do here on the way back.
  const signOut = () => {
    setMenuOpen(false);
    supabase.auth.signOut();
  };
  const openAuth = (tab) => {
    dismissLinkError();
    setAuthTab(tab);
    setAuthForgot(false);
    setAuthMessage(null);
    setScreen('auth');
  };
  // Landing stays reachable while signed in (the logo goes there), so its two
  // CTAs must not send someone with a live session back through the form.
  const goSignIn = () => (user ? goDashboard() : openAuth('in'));
  const goSignUp = () => (user ? goDashboard() : openAuth('up'));
  const goDashboard = () => {
    dismissLinkError();
    setScreen('dash');
    setShowModal(false);
    setMenuOpen(false);
  };
  const goVocab = () => {
    setScreen('vocab');
    setMenuOpen(false);
  };

  // The new password is saved by now; signing out globally drops every other
  // device too, and the listener above turns that into the Sign in screen.
  const completeReset = () => {
    resetCompleted.current = true;
    supabase.auth.signOut();
  };
  const requestFreshLink = () => {
    setAuthTab('in');
    setAuthForgot(true);
    setAuthMessage(null);
    setScreen('auth');
  };

  const openPost = (n) => {
    setScreen('reader');
    setActive(n);
    setSession([]);
  };
  const reviewPost = () => setScreen('vocab');

  const askDelete = () => {
    setShowDelete(true);
    setMenuOpen(false);
  };
  const closeDelete = () => setShowDelete(false);
  const askChangePassword = () => {
    setShowChangePassword(true);
    setMenuOpen(false);
  };
  const closeChangePassword = () => setShowChangePassword(false);
  const toggleMenu = (e) => {
    e.stopPropagation();
    setMenuOpen((m) => !m);
  };

  const saveWord = (entry) => {
    setSaved((s) => [...s, entry]);
    setSession((s) => [...s, entry]);
  };
  const removeWord = (de, post) => {
    setSaved((s) => s.filter((x) => !(x.de === de && x.post === post)));
  };

  const finish = () => {
    setShowModal(true);
    setCompleted((c) => (c.includes(active) ? c : [...c, active]));
  };
  const closeModal = () => setShowModal(false);
  const backToDash = () => {
    setScreen('dash');
    setShowModal(false);
  };

  const post = POSTS.find((p) => p.n === active) || POSTS[0];
  const done = completed.length;
  const pctLabel = Math.round((done / 10) * 100) + '%';

  // Hold the painted background until the stored session has been read, so a
  // returning reader does not see Landing flash before the dashboard.
  if (!authReady) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {screen === 'landing' && (
        <Landing dark={dark} toggleTheme={toggleTheme} goSignIn={goSignIn} goSignUp={goSignUp} />
      )}

      {screen === 'auth' && (
        <AuthScreen
          // AuthScreen seeds its own view and message from these once, so a
          // later expired link or reset confirmation needs a fresh instance.
          key={`${authForgot}-${authMessage?.text ?? ''}`}
          dark={dark}
          toggleTheme={toggleTheme}
          goLanding={goLanding}
          authTab={authTab}
          setSignUp={() => setAuthTab('up')}
          setSignIn={() => setAuthTab('in')}
          initialForgot={authForgot}
          initialMessage={authMessage}
        />
      )}

      {screen === 'reset' && (
        <NewPassword
          dark={dark}
          toggleTheme={toggleTheme}
          goLanding={goLanding}
          email={user?.email}
          onComplete={completeReset}
          onExpired={requestFreshLink}
        />
      )}

      {screen === 'dash' && (
        <Dashboard
          dark={dark}
          toggleTheme={toggleTheme}
          email={user?.email}
          savedCount={saved.length}
          doneCount={done}
          pctLabel={pctLabel}
          completed={completed}
          menuOpen={menuOpen}
          toggleMenu={toggleMenu}
          goVocab={goVocab}
          signOut={signOut}
          askDelete={askDelete}
          askChangePassword={askChangePassword}
          openPost={openPost}
          reviewPost={reviewPost}
        />
      )}

      {screen === 'reader' && (
        <Reader
          key={active}
          post={post}
          saved={saved}
          session={session}
          onSaveWord={saveWord}
          onFinish={finish}
          goDashboard={goDashboard}
          dark={dark}
          toggleTheme={toggleTheme}
        />
      )}

      {screen === 'vocab' && (
        <VocabBank dark={dark} toggleTheme={toggleTheme} saved={saved} goDashboard={goDashboard} onRemove={removeWord} />
      )}

      {showModal && (
        <FinishModal doneCount={done} pctLabel={pctLabel} session={session} backToDash={backToDash} closeModal={closeModal} />
      )}

      {showChangePassword && <ChangePasswordModal email={user?.email} onClose={closeChangePassword} />}

      {/* TODO: erasing the account needs auth.admin.deleteUser, which the
          publishable key cannot call — it belongs behind an Edge Function.
          Until that exists this only signs out; nothing is deleted. */}
      {showDelete && <DeleteModal closeDelete={closeDelete} onConfirm={signOut} />}
    </div>
  );
}
