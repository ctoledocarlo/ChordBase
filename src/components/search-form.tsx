/**
 * The search box at the top of every main page (each page in the navbar).
 * It reloads the page with `?q=...`, so it works the same everywhere.
 */
export function SearchForm({
  action,
  q = "",
  label,
  placeholder,
  disabled = false,
}: {
  /** The page to search, e.g. "/". */
  action: string;
  q?: string;
  label: string;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <form action={action} role="search" className="mt-5">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={label}
        disabled={disabled}
        className="field disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  );
}
