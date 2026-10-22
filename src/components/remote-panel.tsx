"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { getRemotePin, startRemote, stopRemote } from "@/app/(app)/setlists/remote-actions";
import { qrMatrix, qrPath } from "@/lib/qr";
import { pinWords } from "@/lib/remote-token";
import { useToast } from "./toast";

/** A QR code for a link, black on white whatever the theme, since a camera wants the contrast. */
function QrCode({ text }: { text: string }) {
  const { size, path } = useMemo(() => {
    const matrix = qrMatrix(text);
    return { size: matrix.length, path: qrPath(matrix) };
  }, [text]);
  const quiet = 3;
  return (
    <svg role="img" aria-label="QR code that opens the remote" viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`} className="mx-auto block w-48 max-w-full rounded-md bg-white" shapeRendering="crispEdges">
      <path d={path} fill="#000" />
    </svg>
  );
}

/**
 * Switching on the phone remote. While it is on, the PIN is shown here; anyone with the link and the PIN can join
 * from their own phone (no login, as many phones as they like). A new PIN, or switching it off, turns every phone away.
 */
export function RemotePanel({ setlistId }: { setlistId: string }) {
  const toast = useToast();
  const [pin, setPin] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void getRemotePin(setlistId).then((res) => {
      if (!current) return;
      setPin(res.pin);
      setError(res.error ?? null);
      setLoaded(true);
    });
    return () => {
      current = false;
    };
  }, [setlistId]);

  // The address is only known in the browser.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const url = origin ? `${origin}/r/${setlistId}` : "";

  async function start(renew = false) {
    setBusy(true);
    setError(null);
    const res = await startRemote(setlistId, renew);
    setBusy(false);
    setPin(res.pin);
    if (res.error) setError(res.error);
    else if (renew) toast("New PIN. Phones that joined need to enter it.", { tone: "success" });
  }

  async function stop() {
    setBusy(true);
    const res = await stopRemote(setlistId);
    setBusy(false);
    if (res.error) return setError(res.error);
    setPin(null);
    toast("Remote switched off.", { tone: "success" });
  }

  if (!loaded) return <p className="text-sm text-muted">Checking…</p>;

  return (
    <div data-tour="setlist-remote" className="space-y-3">
      {!pin ? (
        <>
          <p className="text-sm text-muted">
            Let the band control the setlist from their own phones: next and previous song, their own notes, the key and the checklist. They join with a PIN and don&apos;t need to log in.
          </p>
          <button type="button" className="btn btn-primary w-full" onClick={() => void start()} disabled={busy}>
            {busy ? "Starting…" : "Start the phone remote"}
          </button>
        </>
      ) : (
        <>
          <div className="rounded-lg border border-line p-3 text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">PIN</p>
            <p className="mt-1 select-all font-mono text-4xl font-semibold tracking-widest" aria-label={`PIN ${pin.split("").join(" ")}`}>
              {pinWords(pin)}
            </p>
          </div>
          {url && <QrCode text={url} />}
          <p className="text-center text-xs text-muted">Scan the code with a phone camera, then type the PIN. Any number of phones can join.</p>
          <div className="grid gap-2">
            <button
              type="button"
              className="btn w-full"
              onClick={() =>
                void navigator.clipboard?.writeText(url).then(
                  () => toast("Remote link copied. The PIN is not part of it.", { tone: "success" }),
                  () => toast(url),
                )
              }
            >
              Copy the link
            </button>
            <button type="button" className="btn w-full" onClick={() => void start(true)} disabled={busy}>
              New PIN
            </button>
            <button type="button" className="btn w-full hover:!text-[#dc2626]" onClick={() => void stop()} disabled={busy}>
              Switch the remote off
            </button>
          </div>
          <p className="text-xs text-muted">A new PIN or switching it off sends every phone back to the PIN screen.</p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
