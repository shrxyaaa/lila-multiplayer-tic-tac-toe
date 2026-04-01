function MiniX() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <line x1="7" y1="7" x2="33" y2="33" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
      <line x1="33" y1="7" x2="7" y2="33" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" />
    </svg>
  );
}

function MiniO() {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <circle cx="20" cy="20" r="13" stroke="currentColor" strokeWidth="5.5" />
    </svg>
  );
}

function MiniBoardLogo({ className = "" }) {
  const cells = ["x", "o", "x", "o", "x", "o", "o", "x", "o"];
  const merged = `mini-board-logo ${className}`.trim();

  return (
    <div className={merged} aria-hidden="true">
      {cells.map((cell, idx) => (
        <span key={idx} className={`mini-cell mini-${cell}`}>
          {cell === "x" ? <MiniX /> : <MiniO />}
        </span>
      ))}
    </div>
  );
}

export default MiniBoardLogo;
