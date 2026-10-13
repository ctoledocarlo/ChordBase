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
  keep = [],
}: {
  /** The page to search, e.g. "/". */
  action: string;
  q?: string;
  label: string;
  placeholder: string;
  disabled?: boolean;
  /** Other query values to carry along when searching (such as the filters), as [name, value]. */
  keep?: [string, string][];
}) {
  return (
    <form action={action} role="search" className="mt-5">
      {keep.map(([name, value], i) => (
        <input key={i} type="hidden" name={name} value={value} />
      ))}
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
