"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions/auth";

interface LoginState {
  error: string | null;
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    async (_prevState, formData) => {
      try {
        const ok = await login(formData);
        return ok ? { error: null } : { error: "Incorrect password." };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
    { error: null }
  );

  return (
    <div className="mx-auto mt-16 max-w-sm rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-slate-900">
        AV Rota Reminder
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Enter the admin password to continue.
      </p>
      <form action={formAction} className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="sr-only">Password</span>
          <input
            type="password"
            name="password"
            required
            autoFocus
            placeholder="Password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Log in"}
        </button>
      </form>
      {state.error && (
        <p className="mt-3 text-sm text-red-600">{state.error}</p>
      )}
    </div>
  );
}
