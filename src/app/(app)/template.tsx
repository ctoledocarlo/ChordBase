/** Re-created on every move between pages, so each one fades in (see .page-enter). */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
