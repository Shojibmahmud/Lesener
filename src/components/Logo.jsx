export default function Logo({ onClick, size = 19 }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          background: 'var(--ind)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          font: '800 14px var(--ui)',
        }}
      >
        L
      </div>
      <span style={{ font: `600 ${size}px var(--serif)`, letterSpacing: '-.01em' }}>Lesener</span>
    </Tag>
  );
}
