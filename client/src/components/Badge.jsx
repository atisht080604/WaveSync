export function Badge({ children, className }) {
  return (
    <span className={`inline-flex items-center rounded-full bg-[rgba(0,210,180,0.1)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--accent-primary)] ${className}`}>
      {children}
    </span>
  );
}
