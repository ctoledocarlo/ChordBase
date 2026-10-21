"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type FormEvent } from "react";
import { parseChord, pitchClass } from "@/lib/chords";
import { SORTS, activeFilterCount, defaultSort, filtersToParams, type SongFacets, type SongFilters } from "@/lib/song-filters";
import { OPEN_SIDEBAR_EVENT, SidebarPortal } from "./sidebar-portal";
import { Group } from "./song-settings";

/** Keys in the order of the scale (C, C#, D ...), majors before minors. */
function sortKeys(keys: string[]): string[] {
  const rank = (k: string) => {
    const chord = parseChord(k);
    return chord ? pitchClass(chord.root) * 2 + (/^m(?!aj|a)/.test(chord.quality) ? 1 : 0) : 100;
  };
  return [...keys].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** On phones the filters live in the drawer; this button sits by the search box and opens it, with a count of what is applied. */
export function FiltersButton({ count }: { count: number }) {
  return (
    <button type="button" className="btn flex-none lg:hidden" onClick={() => window.dispatchEvent(new Event(OPEN_SIDEBAR_EVENT))}>
      Filters{count > 0 ? ` (${count})` : ""}
    </button>
  );
}

/**
 * The filters for the song list, in the sidebar. Choosing something reloads the list straight
 * away; the tempo boxes apply when you leave them or press Enter.
 */
export function SongFilterPanel({ filters, facets }: { filters: SongFilters; facets: SongFacets }) {
  const router = useRouter();
  const keys = useMemo(() => sortKeys(facets.keys), [facets.keys]);
  const active = activeFilterCount(filters);
  // A fresh form whenever the filters change, so the boxes always show what is applied.
  const formKey = filtersToParams(filters, 1).toString();

  function apply(form: HTMLFormElement) {
    const params = new URLSearchParams();
    const data = new FormData(form);
    const q = String(data.get("q") ?? "");
    for (const [name, value] of data) {
      // The usual order for what's on screen (best match while searching, else title) isn't written into the address.
      if (typeof value === "string" && value.trim() !== "" && !(name === "sort" && value === defaultSort(q))) {
        params.append(name, value.trim());
      }
    }
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

  return (
    <SidebarPortal>
      <form
        key={formKey}
        data-tour="songs-filters"
        onSubmit={(e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          apply(e.currentTarget);
        }}
        onChange={(e) => {
          const field = e.target as unknown as HTMLInputElement;
          if (field.type !== "number") apply(field.form!);
        }}
        className="space-y-6"
      >
        <input type="hidden" name="q" value={filters.q} />

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Filters{active > 0 ? ` (${active})` : ""}</h2>
          {(active > 0 || filters.sort !== defaultSort(filters.q)) && (
            <Link href={filters.q ? `/?q=${encodeURIComponent(filters.q)}` : "/"} className="text-sm text-muted underline hover:text-foreground">
              Clear all
            </Link>
          )}
        </div>

        <Group title="Sort by">
          <select name="sort" defaultValue={filters.sort} className="field field-sm">
            {SORTS.filter((s) => s.value !== "relevance" || filters.q !== "").map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </Group>

        {keys.length > 0 && (
          <Group title="Key">
            <div className="flex flex-wrap gap-1.5">
              {keys.map((k) => (
                <label key={k} className="cursor-pointer">
                  <input type="checkbox" name="key" value={k} defaultChecked={filters.keys.includes(k)} className="peer sr-only" />
                  <span className="inline-block min-w-9 rounded-md border border-line px-2 py-1 text-center font-mono text-sm peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent hover:bg-hover peer-checked:hover:bg-foreground">
                    {k}
                  </span>
                </label>
              ))}
            </div>
          </Group>
        )}

        <Group title="Major or minor">
          <select name="mode" defaultValue={filters.mode} className="field field-sm">
            <option value="">Either</option>
            <option value="major">Major keys</option>
            <option value="minor">Minor keys</option>
          </select>
        </Group>

        {facets.artists.length > 0 && (
          <Group title="Artist">
            <select name="artist" defaultValue={filters.artist} className="field field-sm">
              <option value="">Any artist</option>
              {facets.artists.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Group>
        )}

        <Group title="Tempo (BPM)">
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="tempo_min"
              min={20}
              max={300}
              defaultValue={filters.tempoMin ?? ""}
              placeholder="From"
              aria-label="Slowest tempo"
              onBlur={(e) => apply(e.currentTarget.form!)}
              className="field field-sm min-w-0"
            />
            <span className="text-muted">to</span>
            <input
              type="number"
              name="tempo_max"
              min={20}
              max={300}
              defaultValue={filters.tempoMax ?? ""}
              placeholder="To"
              aria-label="Fastest tempo"
              onBlur={(e) => apply(e.currentTarget.form!)}
              className="field field-sm min-w-0"
            />
          </div>
        </Group>

        {facets.tags.length > 0 && (
          <Group title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {facets.tags.map((t) => (
                <label key={t} className="cursor-pointer">
                  <input type="checkbox" name="tag" value={t} defaultChecked={filters.tags.includes(t)} className="peer sr-only" />
                  <span className="inline-block rounded-full border border-line px-2.5 py-1 text-xs peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-accent hover:bg-hover peer-checked:hover:bg-foreground">
                    #{t}
                  </span>
                </label>
              ))}
            </div>
          </Group>
        )}

        {facets.timeSignatures.length > 1 && (
          <Group title="Time signature">
            <select name="ts" defaultValue={filters.timeSig} className="field field-sm">
              <option value="">Any</option>
              {facets.timeSignatures.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Group>
        )}

        {facets.capos.length > 1 && (
          <Group title="Usual capo">
            <select name="capo" defaultValue={filters.capo ?? ""} className="field field-sm">
              <option value="">Any</option>
              {facets.capos.map((c) => (
                <option key={c} value={c}>
                  {c === 0 ? "No capo" : `Fret ${c}`}
                </option>
              ))}
            </select>
          </Group>
        )}
      </form>
    </SidebarPortal>
  );
}
