import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PinInput = z.object({ pin: z.string().min(4).max(64) });

function toHex(buf: ArrayBuffer) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function derive(pin: string, saltHex: string) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

function randomSaltHex() {
  return toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
}

export const getLibraryLockStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("library_pin_hash")
      .eq("id", context.userId)
      .maybeSingle();
    return { hasPin: Boolean((data as { library_pin_hash?: string | null } | null)?.library_pin_hash) };
  });

export const setLibraryPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PinInput.parse(input))
  .handler(async ({ data, context }) => {
    const salt = randomSaltHex();
    const hash = await derive(data.pin, salt);
    const { error } = await context.supabase
      .from("profiles")
      .upsert(
        {
          id: context.userId,
          library_pin_hash: `${salt}:${hash}`,
          library_pin_updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    if (error) throw new Error("Could not save your library password.");
    return { ok: true as const };
  });

export const verifyLibraryPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PinInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("profiles")
      .select("library_pin_hash")
      .eq("id", context.userId)
      .maybeSingle();
    const stored = (row as { library_pin_hash?: string | null } | null)?.library_pin_hash;
    if (!stored) return { ok: false as const, reason: "not-set" as const };
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return { ok: false as const, reason: "invalid" as const };
    const candidate = await derive(data.pin, salt);
    // constant-time-ish compare
    let diff = candidate.length ^ hash.length;
    for (let i = 0; i < Math.min(candidate.length, hash.length); i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
    return diff === 0 ? { ok: true as const } : { ok: false as const, reason: "wrong" as const };
  });

// "Forgot password" for a signed-in user: clears the PIN so a new one can be set.
// Library documents themselves are never touched.
export const resetLibraryPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ library_pin_hash: null, library_pin_updated_at: null })
      .eq("id", context.userId);
    if (error) throw new Error("Could not reset your library password.");
    return { ok: true as const };
  });
