"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "./api";
import { btn, ErrorNote, field, label } from "./ui";

// The clearing house operator signs in here, on any page. AppProvider opens it and runs the waiting action after it.
export function OperatorSignIn({ open, onClose, onSignedIn }: { open: boolean; onClose: () => void; onSignedIn: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open) dialog.current?.close();
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/finance/session", { password });
      setPassword("");
      onSignedIn();
    } catch (e) {
      setError(e as Error);
    }
    setBusy(false);
  }

  // Escape, Cancel and a successful sign-in all end here.
  function closed() {
    setPassword("");
    setError(null);
    onClose();
  }

  return (
    <dialog
      ref={dialog}
      onClose={closed}
      aria-labelledby="operator-sign-in-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-zinc-900/40"
    >
      <form onSubmit={submit} className="space-y-4">
        <h2 id="operator-sign-in-title" className="text-lg font-semibold">Sign in as the clearing house operator</h2>
        <p className="text-sm text-zinc-600">Running clearing and moving PayPal Sandbox money need the operator password. Anyone can look at every view without it.</p>
        <label className={`${label} block`}>
          Operator password
          <input type="password" autoComplete="current-password" autoFocus required maxLength={256} className={`${field} mt-1 w-full`} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <ErrorNote error={error} />}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={btn.secondary} onClick={() => dialog.current?.close()}>Cancel</button>
          <button className={btn.primary} disabled={busy || !password}>{busy ? "Signing in..." : "Sign in"}</button>
        </div>
      </form>
    </dialog>
  );
}
