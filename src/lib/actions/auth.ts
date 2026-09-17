"use server";

import { revalidatePath } from "next/cache";
import {
  createSession,
  destroySession,
  verifyPassword,
} from "@/lib/auth/session";

/** Returns true and starts a session on a correct password; false (never a
 *  thrown error with detail) on an incorrect one, so nothing about the
 *  password is ever echoed back to the browser. */
export async function login(formData: FormData): Promise<boolean> {
  const password = String(formData.get("password") ?? "");

  if (!verifyPassword(password)) {
    return false;
  }

  await createSession();
  revalidatePath("/");
  return true;
}

export async function logout(): Promise<void> {
  await destroySession();
  revalidatePath("/");
}
