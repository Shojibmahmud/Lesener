import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './lib/supabase';
import { loadContent } from './lib/content';
import { fetchProgress, recordFinish } from './lib/progress';
import { unlockedLevels } from './lib/levels';
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
import ContentLoading from './components/ContentLoading';
import ContentError from './components/ContentError';

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
  // The library. Every post, blurb, body, count, level label and translation on
  // screen comes from here — it is the only source there is, now that the
  // bundled copy has been deleted.
  const [content, setContent] = useState(null);
  // Tracked here rather than inferred from `content` being null, which cannot
  // tell "still arriving" from "never asked for" from "asked and failed".
  const [contentStatus, setContentStatus] = useState('idle');
  // Retry has to change something the fetch effect depends on, and neither the
  // user nor the recovery flag changes when a reader presses it.
  const [contentAttempt, setContentAttempt] = useState(0);
  // A recovery link carries a real session, so without holding the fetch back
  // the entire library would be loaded for somebody who will only ever see the
  // reset screen. Seeded from the URL rather than from the PASSWORD_RECOVERY
  // event, because the session lands first and by then the fetch has begun.
  const [recovering, setRecovering] = useState(startedInRecovery);
  // Post ids the reader has finished, read from reading_progress and kept in
  // step optimistically when they finish another (Decision 5 — the next load is
  // the authority, not this array). Empty is a truthful starting point: a reader
  // who has finished nothing has finished nothing.
  const [completed, setCompleted] = useState([]);
  // Whether the last Finish failed to reach the database. Decision 7: the modal
  // still opens, but it says so and the post stays unmarked.
  const [saveFailed, setSaveFailed] = useState(false);
  const [activePostId, setActivePostId] = useState(null);
  // Which level the dashboard is showing. Null means "whichever comes first",
  // resolved below rather than seeded by an effect — the library has not
  // arrived yet at this point, so there is no id to seed it with.
  const [selectedLevelId, setSelectedLevelId] = useState(null);
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
        setRecovering(true);
        setScreen('reset');
        setMenuOpen(false);
        setShowChangePassword(false);
        return;
      }

      if (event === 'SIGNED_OUT') {
        // A completed reset signs out globally, so this is also the point at
        // which a recovery ends and an ordinary session may begin again.
        setRecovering(false);
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

  // Asks the database for the library. Every content-bearing screen waits on
  // the answer now, so a failure here is something a reader sees rather than
  // something only the console knows about.
  //
  // Gated on a session rather than merely preferring one. `anon` holds no
  // privileges on the content tables, so a request made while signed out does
  // not return an empty library — it fails outright. The dependency is the user
  // id and not the user object because SIGNED_IN re-fires whenever the tab
  // regains focus, handing back an equal-but-fresh object each time.
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId || recovering) {
      setContent(null);
      setCompleted([]);
      setSelectedLevelId(null);
      setContentStatus('idle');
      return;
    }

    let cancelled = false;

    setContentStatus('loading');

    // Together, under one status. A dashboard drawn from the library before the
    // reader's history arrives would show every card unread for a moment and
    // then correct itself — which looks exactly like progress being lost.
    Promise.all([loadContent(), fetchProgress()])
      .then(([loaded, progress]) => {
        if (cancelled) return;
        setContent(loaded);
        // completed_at is what separates finishing a post from getting partway
        // through one. A row exists either way.
        setCompleted(progress.filter((row) => row.completed_at).map((row) => row.post_id));
        setContentStatus('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setContentStatus('error');
        // The reader sees a generic message; this is where the actual cause
        // stays available to whoever is debugging it.
        console.error('[lesener] content could not be loaded from the database.', error);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, recovering, contentAttempt]);

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

  const openPost = (postId) => {
    setScreen('reader');
    setActivePostId(postId);
    setSession([]);
    // A note left over from a previous post's failed save would otherwise
    // reappear over this one's modal.
    setSaveFailed(false);
  };
  const retryContent = () => setContentAttempt((n) => n + 1);
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

  // Decision 7: a failed write must not claim success. The post is marked only
  // once the row is actually in, because a badge that appears and then vanishes
  // on the next load is worse than one that never appeared. Pressing Finish
  // again retries.
  const finish = async (percentRead) => {
    const postId = activePostId;

    try {
      await recordFinish({ postId, percentRead });
      setCompleted((c) => (c.includes(postId) ? c : [...c, postId]));
      setSaveFailed(false);
    } catch (error) {
      setSaveFailed(true);
      // The reader is told only that it did not save; the cause stays here for
      // whoever is debugging it.
      console.error('[lesener] progress could not be saved.', error);
    }

    setShowModal(true);
  };
  const closeModal = () => setShowModal(false);
  const backToDash = () => {
    setScreen('dash');
    setShowModal(false);
  };

  // The level a reader is looking at. Falling back to the first by position
  // rather than storing it up front keeps "nothing chosen yet" and "chose the
  // first one" the same thing, which is what a reader signing in expects.
  // Memoised so it is the same array between renders — the lock map below is
  // keyed on it, and a fresh [] each time would recompute on every keystroke.
  const levels = useMemo(() => content?.levels ?? [], [content]);
  const level = levels.find((l) => l.id === selectedLevelId) ?? levels[0] ?? null;

  // Computed once, from data already on hand, and used by the switcher, the
  // locked-versus-empty decision and the unlock line alike — three answers that
  // must agree. The database remains the enforcer (Decision 6); this only
  // decides what to grey out.
  const unlocked = useMemo(
    () => unlockedLevels(levels, content?.postsByLevel ?? {}, completed),
    [levels, content?.postsByLevel, completed],
  );

  const selectLevel = (levelId) => {
    // Refused rather than merely discouraged. A disabled control can still be
    // reached by other means, and the dashboard should not render a level whose
    // posts the database will not hand over.
    if (unlocked.get(levelId)) setSelectedLevelId(levelId);
  };
  const posts = level ? content.postsByLevel[level.id] ?? [] : [];
  // The denormalised counter, not posts.length: a locked level reports how many
  // posts it holds without handing over a single one of them.
  const postCount = level?.post_count ?? 0;

  // No fallback to a first post. Nothing can open the reader without going
  // through a card, so a missing post here is a bug worth seeing, not a state
  // to paper over.
  const post = posts.find((p) => p.id === activePostId) ?? null;
  const done = completed.length;
  const pctLabel = (postCount > 0 ? Math.round((done / postCount) * 100) : 0) + '%';

  // Hold the painted background until the stored session has been read, so a
  // returning reader does not see Landing flash before the dashboard.
  if (!authReady) {
    return <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />;
  }

  // Signed in and the library is still on its way, or never arrived. Someone on
  // a recovery link is excluded: they hold a session but will only ever see the
  // reset screen, and nothing was ever fetched for them.
  const awaitingContent = Boolean(user) && !recovering;

  if (awaitingContent && (contentStatus === 'idle' || contentStatus === 'loading')) {
    return <ContentLoading />;
  }

  // Gated on 'error' specifically rather than on anything that is not 'ready'.
  // Folding the failure into the loading screen would leave a reader watching a
  // library that is never coming, with nothing to press.
  //
  // A library that arrives holding no levels at all counts as a failure too. It
  // is not the empty *level* case — that is a level with no posts in it, which
  // is legitimate and deferred — but a request that succeeded and returned
  // nothing to read, which leaves the dashboard with no level to name and no
  // count to render. Retry is the right offer for it.
  if (awaitingContent && (contentStatus === 'error' || (contentStatus === 'ready' && !level))) {
    return <ContentError onRetry={retryContent} />;
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
          level={level}
          levels={levels}
          unlocked={unlocked}
          selectLevel={selectLevel}
          posts={posts}
          postCount={postCount}
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

      {screen === 'reader' && post && (
        <Reader
          key={activePostId}
          post={post}
          level={level}
          dict={content.dictionary}
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
        <FinishModal doneCount={done} postCount={postCount} pctLabel={pctLabel} session={session} saveFailed={saveFailed} backToDash={backToDash} closeModal={closeModal} />
      )}

      {showChangePassword && <ChangePasswordModal email={user?.email} onClose={closeChangePassword} />}

      {/* TODO: erasing the account needs auth.admin.deleteUser, which the
          publishable key cannot call — it belongs behind an Edge Function.
          Until that exists this only signs out; nothing is deleted. */}
      {showDelete && <DeleteModal closeDelete={closeDelete} onConfirm={signOut} />}
    </div>
  );
}
