"use client";

import { useState, useTransition } from "react";

export function AdminActionCard({
  title,
  description,
  buttonLabel,
  action,
}: {
  title: string;
  description?: string;
  buttonLabel: string;
  action: () => Promise<string>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setMessage(null);
            setIsError(false);
            try {
              const result = await action();
              setMessage(result);
            } catch (error) {
              setIsError(true);
              setMessage(
                error instanceof Error ? error.message : String(error)
              );
            }
          })
        }
        className="mt-3 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {pending ? "Working…" : buttonLabel}
      </button>
      {message && (
        <p
          className={`mt-2 text-sm ${isError ? "text-red-600" : "text-slate-700"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
