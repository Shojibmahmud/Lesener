import { useState, useEffect, useCallback } from 'react';
import { POSTS } from './data';
import Landing from './components/Landing';
import AuthScreen from './components/AuthScreen';
import Dashboard from './components/Dashboard';
import Reader from './components/Reader';
import VocabBank from './components/VocabBank';
import FinishModal from './components/FinishModal';
import DeleteModal from './components/DeleteModal';

const THEME_KEY = 'lesener-theme';

export default function App() {
  const [theme, setThemeState] = useState('light');
  const [screen, setScreen] = useState('landing');
  const [authTab, setAuthTab] = useState('up');
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

  const dark = theme === 'dark';
  const toggleTheme = () => setTheme(dark ? 'light' : 'dark');

  const goLanding = () => {
    setScreen('landing');
    setMenuOpen(false);
    setShowDelete(false);
  };
  const goSignIn = () => {
    setScreen('auth');
    setAuthTab('in');
  };
  const goSignUp = () => {
    setScreen('auth');
    setAuthTab('up');
  };
  const goDashboard = () => {
    setScreen('dash');
    setShowModal(false);
    setMenuOpen(false);
  };
  const goVocab = () => {
    setScreen('vocab');
    setMenuOpen(false);
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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {screen === 'landing' && (
        <Landing dark={dark} toggleTheme={toggleTheme} goSignIn={goSignIn} goSignUp={goSignUp} />
      )}

      {screen === 'auth' && (
        <AuthScreen
          dark={dark}
          toggleTheme={toggleTheme}
          goLanding={goLanding}
          authTab={authTab}
          setSignUp={() => setAuthTab('up')}
          setSignIn={() => setAuthTab('in')}
          goDashboard={goDashboard}
        />
      )}

      {screen === 'dash' && (
        <Dashboard
          dark={dark}
          toggleTheme={toggleTheme}
          savedCount={saved.length}
          doneCount={done}
          pctLabel={pctLabel}
          completed={completed}
          menuOpen={menuOpen}
          toggleMenu={toggleMenu}
          goVocab={goVocab}
          goLanding={goLanding}
          askDelete={askDelete}
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

      {showDelete && <DeleteModal closeDelete={closeDelete} goLanding={goLanding} />}
    </div>
  );
}
