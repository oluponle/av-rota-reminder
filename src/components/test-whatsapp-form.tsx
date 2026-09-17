"use client";

import { useActionState } from "react";
import { sendTestWhatsAppMessage } from "@/lib/actions/admin";

interface FormState {
  message: string | null;
  isError: boolean;
}

export function TestWhatsAppForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (_prevState, formData) => {
      try {
        const result = await sendTestWhatsAppMessage(formData);
        return { message: result, isError: false };
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : String(error),
          isError: true,
        };
      }
    },
    { message: null, isError: false }
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900">
        Send a test WhatsApp
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Sends a fixed test message to any UK number, to verify Twilio and the
        WhatsApp sandbox end-to-end.
      </p>
      <form
        action={formAction}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="block text-sm">
          <span className="sr-only">Phone number</span>
          <input
            name="phone"
            required
            placeholder="07960357473"
            className="w-44 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send test"}
        </button>
      </form>
      {state.message && (
        <p
          className={`mt-2 text-sm ${state.isError ? "text-red-600" : "text-slate-700"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
