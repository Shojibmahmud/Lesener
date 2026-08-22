import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from './lib/supabase';
import { loadContent } from './lib/content';
import { fetchProgress, recordFinish } from './lib/progress';
import { fetchSavedWords, saveWord as persistWord, deleteSavedWord } from './lib/vocab';
import { fetchProfile, updateProfileTheme } from './lib/profile';
import { unlockedLevels } from './lib/levels';
import { linkError, startedInRecovery } from './lib/recovery';
import { THEME_KEY } from './utils';
import Landing from './components/Landing';
import AuthScreen from './components/AuthScreen';
import NewPassword from './components/NewPassword';
import Dashboard from './components/Dashboard';
import Reader from './components/Reader';
import VocabBank from './components/VocabBank';
import FinishModal from './components/FinishModal';
import DeleteModal from './components/DeleteModal';
import ChangePasswordModal from './components/ChangePasswordModal';
import EditNameModal from './components/EditNameModal';
import ContentLoading from './components/ContentLoading';
import ContentError from './components/ContentError';

// Read synchronously so the very first render already agrees with the attribute
// index.html stamped before paint. Seeding to 'light' and correcting in an effect
// would paint one frame showing the light glyph over an already-dark page -- a
// flash fix that moved the bug rather than removing it.
//
// Validated rather than trusted: getItem returns whatever is in the store, and a
// hand-edited 'blue' would otherwise reach setAttribute and leave `dark` false
// over a page rendered in the light palette.
function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'light';
  } catch {
    return 'light';
  }
}

export default function App() {
  const [theme, setThemeState] = useState(readStoredTheme);
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
  // Every word this reader has kept, as stored rows — { id, post_id, post_label,
  // term, surface_form, translation }. Empty is the truthful starting point: the
  // three literals that used to sit here belonged to nobody and survived no
  // reload, while claiming "Saved 3" on a brand-new account.
  const [saved, setSaved] = useState([]);
  // Who is reading. Loaded with the library so the dashboard is never drawn
  // before it knows whose it is.
  const [profile, setProfile] = useState(null);
  // Whether the last save, or the last removal, failed to reach the database.
  // Decision 3: the write is awaited, so nothing appears or disappears that a
  // reload would contradict — but silence would leave a failure looking exactly
  // like a mis-tap, so each is surfaced where it happened.
  const [saveWordFailed, setSaveWordFailed] = useState(false);
  const [removeWordFailed, setRemoveWordFailed] = useState(false);
  const [session, setSession] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showEditName, setShowEditName] = useState(false);

  // Finishing a reset signs out globally, which fires the same SIGNED_OUT event
  // as pressing Log out. This is how the listener tells the two apart.
  const resetCompleted = useRef(false);

  // A reset link that failed lands someone on the auth screen holding an
  // explanation — while they may still be signed in from before. Without this
  // the session check below would read that screen as "signed out and idling"
  // and forward them to the dashboard, silently binning the explanation.
  const unreadLinkError = useRef(Boolean(linkError));

  // Read by the profile effect below, which must not depend on `theme`: that
  // would re-fetch the library, the progress, the saved words and the profile on
  // every toggle. Without the ref it would close over a stale one instead, and
  // nothing lints for that -- .oxlintrc.json carries no exhaustive-deps rule.
  const themeRef = useRef(theme);

  // Applies a theme without telling the account. Used by the mount effect and by
  // the reconciliation, because neither is a choice the reader just made, and
  // writing the account's own value back to it would be a round trip that can
  // only ever confirm what is already there.
  //
  // Deliberately not called applyTheme-and-save: the account write lives in
  // chooseTheme alone. A flag argument would fail silently -- the screen would
  // still change, localStorage would still update, and the only symptom would
  // appear on a different device the next day.
  const applyTheme = useCallback((t) => {
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* localStorage unavailable — theme just won't persist */
    }
    themeRef.current = t;
    setThemeState(t);
  }, []);

  // The account's answer wins where it has one -- that is the whole feature. It is
  // null on every account made before this existed, and adopting the device's
  // current theme into it is what stops any account staying null after one
  // sign-in. Nothing visible happens in that branch: the only evidence it ran is
  // the row itself.
  const reconcileTheme = useCallback(
    (readerProfile) => {
      // No row means nothing to reconcile against and nothing to write to -- an
      // update would reach the database and come back "nothing was updated" for a
      // reader who has done nothing wrong.
      if (!readerProfile) return;

      const device = themeRef.current;

      if (readerProfile.theme) {
        if (readerProfile.theme !== device) applyTheme(readerProfile.theme);
        return;
      }

      updateProfileTheme(device).catch((error) => {
        console.error('[lesener] theme could not be saved to your account.', error);
      });
    },
    [applyTheme],
  );

  // index.html already stamped the attribute before the first paint and useState
  // seeded from the same read, so on a normal load this changes nothing. It runs
  // anyway for two cases it is the only cover for: the attribute is still correct
  // if that inline script is ever removed, and a device with nothing stored gets
  // its default written down rather than staying empty until the first toggle.
  useEffect(() => {
    applyTheme(readStoredTheme());
  }, [applyTheme]);

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
        setShowEditName(false);
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
        setShowEditName(false);
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

      // Noticing an account that was deleted somewhere else.
      //
      // A JWT is stateless. Deleting the account revokes the stored sessions so
      // this device can never renew — but the token it already holds keeps
      // working until it expires, and PostgREST goes on answering with it.
      // Measured 2026-08-20 against a token whose account had just been
      // deleted: /rest/v1/levels returned 200 with the whole library and
      // /rest/v1/profiles returned []. So without this check the other device
      // does not sit harmlessly on a stale screen — it renders a fully working
      // dashboard, nameless, with every post unread. Exactly the thing that is
      // not allowed to appear.
      //
      // INITIAL_SESSION covers the tab being reloaded; SIGNED_IN covers it
      // being brought back to the front, which re-fires the event. Together
      // they are every moment this app learns a session exists.
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && authSession) {
        supabase.auth
          .getUser()
          .then(({ error }) => {
            // Only an answer from the server counts. A deleted account replies
            // 403 `user_not_found` (measured, same date); a reader in a tunnel
            // gets a fetch failure carrying no status, and must not be signed
            // out by it. Hence a status test rather than `if (error)`.
            if (error?.status === 401 || error?.status === 403) {
              supabase.auth.signOut({ scope: 'local' });
            }
          })
          // supabase-js normally reports a failure as `error` rather than by
          // throwing, but it does throw when fetch itself does. Swallowing that
          // is the correct handling — a reader who cannot reach the server is
          // exactly the one who must not be signed out — but without this the
          // rejection escapes as an unhandled promise, printing a red error in
          // the console during the one situation the check exists to survive
          // quietly. Measured: one unhandled rejection per dropped request.
          .catch(() => {});
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
      setSaved([]);
      setProfile(null);
      setSelectedLevelId(null);
      setContentStatus('idle');
      return;
    }

    let cancelled = false;

    setContentStatus('loading');

    // Together, under one status. A dashboard drawn from the library before the
    // reader's history arrives would show every card unread for a moment and
    // then correct itself — which looks exactly like progress being lost.
    Promise.all([loadContent(), fetchProgress(), fetchSavedWords(), fetchProfile()])
      .then(([loaded, progress, savedWords, readerProfile]) => {
        if (cancelled) return;
        // Before setContent, and that ordering is load-bearing: React batches this
        // into the same render that sets contentStatus 'ready', so a reader whose
        // account disagrees with their device sees the change happen on the loading
        // screen rather than as a repaint under a dashboard they were already
        // looking at.
        reconcileTheme(readerProfile);
        setContent(loaded);
        // completed_at is what separates finishing a post from getting partway
        // through one. A row exists either way.
        setCompleted(progress.filter((row) => row.completed_at).map((row) => row.post_id));
        setSaved(savedWords);
        setProfile(readerProfile);
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
  }, [userId, recovering, contentAttempt, reconcileTheme]);

  const dark = theme === 'dark';

  // The reader's own choice, and the only thing in the app that writes the theme
  // to the account. Not awaited: the toggle has to feel instant, the local half
  // has already succeeded, and a failure costs the reader nothing they can see on
  // the device in front of them. Contrast saveWord and finish below, which are
  // awaited because they create data the reader would otherwise believe exists.
  const chooseTheme = (t) => {
    applyTheme(t);

    // A recovery session holds a real user id but is not an ordinary session --
    // no library, no progress, no words and no profile are loaded for it -- so it
    // does not get to write a preference into an account this app instance has
    // never read.
    if (!userId || recovering) return;

    updateProfileTheme(t).catch((error) => {
      console.error('[lesener] theme could not be saved to your account.', error);
    });
  };
  const toggleTheme = () => chooseTheme(dark ? 'light' : 'dark');

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
  // The account is already gone by the time this runs, so the scope is not a
  // preference. A bare signOut() posts to /logout with a token naming a user
  // who no longer exists; 'local' drops the stored session without asking the
  // server about an account it has already erased, and stops supabase-js
  // refreshing against a dead token afterwards.
  //
  // The listener's SIGNED_OUT branch does the navigating, as it does for an
  // ordinary sign-out — there is no separate route out of a deleted account.
  const finishDelete = () => {
    supabase.auth.signOut({ scope: 'local' });
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
    setRemoveWordFailed(false);
  };
  const goVocab = () => {
    setScreen('vocab');
    setMenuOpen(false);
    // Entering the bank afresh; a note about a removal that failed last time is
    // no longer about anything the reader can see.
    setRemoveWordFailed(false);
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
    setSaveWordFailed(false);
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
  const askEditName = () => {
    setShowEditName(true);
    setMenuOpen(false);
  };
  const closeEditName = () => setShowEditName(false);
  const toggleMenu = (e) => {
    e.stopPropagation();
    setMenuOpen((m) => !m);
  };

  // Awaited, not optimistic. The word joins the bank and the session sidebar
  // only once its row is actually in — a word that appears and then vanishes on
  // the next load is the failure this whole approach exists to avoid.
  //
  // The heading is composed here, from the post already in scope, and stored
  // with the word. It is a snapshot, never refreshed: the bank prefers the live
  // title and reads this only once the post can no longer be found. `post_id`
  // remains the identity, so this is not the display-string coupling that
  // keyed the literals this replaced.
  const saveWord = async ({ surfaceForm, translation }) => {
    if (!post) return;

    try {
      const row = await persistWord({
        postId: post.id,
        postLabel: 'Post ' + post.position + ': ' + post.title,
        surfaceForm,
        translation,
      });
      setSaved((s) => [...s, row]);
      setSession((s) => [...s, row]);
      setSaveWordFailed(false);
    } catch (error) {
      setSaveWordFailed(true);
      // The reader is told only that it did not save; the cause stays here for
      // whoever is debugging it.
      console.error('[lesener] word could not be saved.', error);
    }
  };

  // By id, because that is what identifies a row. The old signature took the
  // word and its heading string, which could only ever match by coincidence.
  const removeWord = async (id) => {
    try {
      await deleteSavedWord(id);
      setSaved((s) => s.filter((w) => w.id !== id));
      setRemoveWordFailed(false);
    } catch (error) {
      setRemoveWordFailed(true);
      console.error('[lesener] word could not be removed.', error);
    }
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

  // Every post the reader can currently see, keyed by id, as the heading the
  // bank groups under. Built from the library rather than stored with the word,
  // so correcting a post's title reaches the bank on the next load. A word
  // whose post is missing here — deleted, or unpublished and therefore withheld
  // by RLS — falls back to the heading stored on the word itself.
  const postLabels = useMemo(() => {
    const labels = new Map();
    Object.values(content?.postsByLevel ?? {}).forEach((list) =>
      list.forEach((p) => labels.set(p.id, 'Post ' + p.position + ': ' + p.title)),
    );
    return labels;
  }, [content?.postsByLevel]);

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
          profile={profile}
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
          askEditName={askEditName}
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
          saveWordFailed={saveWordFailed}
          onFinish={finish}
          goDashboard={goDashboard}
          dark={dark}
          toggleTheme={toggleTheme}
        />
      )}

      {screen === 'vocab' && (
        <VocabBank
          dark={dark}
          toggleTheme={toggleTheme}
          saved={saved}
          postLabels={postLabels}
          goDashboard={goDashboard}
          onRemove={removeWord}
          removeFailed={removeWordFailed}
        />
      )}

      {showModal && (
        <FinishModal doneCount={done} postCount={postCount} pctLabel={pctLabel} session={session} saveFailed={saveFailed} backToDash={backToDash} closeModal={closeModal} />
      )}

      {showChangePassword && <ChangePasswordModal email={user?.email} onClose={closeChangePassword} />}

      {/* The greeting behind this updates from `profile`, so handing the stored
          row straight back is what makes the change visible without a refetch. */}
      {showEditName && (
        <EditNameModal profile={profile} onSaved={setProfile} onClose={closeEditName} />
      )}

      {/* The modal owns the deletion itself and tells the reader it happened.
          All that is left for App is what follows the acknowledgement. */}
      {showDelete && <DeleteModal closeDelete={closeDelete} onConfirm={finishDelete} />}
    </div>
  );
}
