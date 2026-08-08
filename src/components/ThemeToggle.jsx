export default function ThemeToggle({ dark, onToggle, style }) {
  return (
    <button
      className="btng"
      onClick={onToggle}
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        border: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 15,
        color: 'var(--muted)',
        ...style,
      }}
    >
      {dark ? '☀' : '☾'}
    </button>
  );
}
