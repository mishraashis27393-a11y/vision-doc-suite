import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/AppShell";
import { cn } from "@/lib/utils";
import { getLibraryLockStatus, setLibraryPin, verifyLibraryPin, resetLibraryPin } from "@/lib/library-lock.functions";

const SESSION_KEY = "dcr-library-unlocked";

function strengthOf(value: string) {
  if (!value) return { score: 0, label: "", tone: "bg-muted" };
  const digitsOnly = /^\d+$/.test(value);
  let score = 0;
  if (value.length >= 4) score++;
  if (value.length >= 8) score++;
  if (/[A-Za-z]/.test(value) && /\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value) || value.length >= 12) score++;
  if (digitsOnly && value.length <= 6) score = Math.min(score, 2);
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  const tones = ["bg-destructive", "bg-destructive", "bg-warning", "bg-brand", "bg-success"];
  return { score, label: labels[score] ?? "", tone: tones[score] ?? "bg-muted" };
}

export function LibraryLock({ children }: { children: React.ReactNode }) {
  const status = useServerFn(getLibraryLockStatus);
  const savePin = useServerFn(setLibraryPin);
  const checkPin = useServerFn(verifyLibraryPin);
  const clearPin = useServerFn(resetLibraryPin);

  const [state, setState] = useState<"loading" | "create" | "enter" | "open">("loading");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState("");

  const strength = useMemo(() => strengthOf(pin), [pin]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (sessionStorage.getItem(SESSION_KEY) === "1") {
        setState("open");
        return;
      }
      try {
        const { hasPin } = await status({});
        if (active) setState(hasPin ? "enter" : "create");
      } catch {
        if (active) setState("open"); // never block access if the check fails
      }
    })();
    return () => {
      active = false;
    };
  }, [status]);

  const unlock = () => {
    sessionStorage.setItem(SESSION_KEY, "1");
    setPin("");
    setConfirm("");
    setError("");
    setState("open");
  };

  const create = async () => {
    if (busy) return;
    if (pin.length < 4) {
      setError("Use at least 4 characters (or a 4–6 digit PIN).");
      return;
    }
    if (pin !== confirm) {
      setError("Both entries must match.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await savePin({ data: { pin } });
      toast.success("Library lock enabled.");
      unlock();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not set the password. Please try again.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!pin || busy) return;
    setError("");
    setBusy(true);
    try {
      const res = await checkPin({ data: { pin } });
      if (res.ok) unlock();
      else if (res.reason === "not-set") setState("create");
      else {
        setError("Incorrect Password/PIN");
        toast.error("Incorrect Password/PIN");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not verify the password.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (busy) return;
    if (
      !window.confirm(
        "Reset your library lock?\n\nBecause you are signed in, your saved documents and designs are kept safe — only the lock is removed and you'll set a new password or PIN right away.",
      )
    )
      return;
    setBusy(true);
    try {
      await clearPin({});
      setPin("");
      setConfirm("");
      setError("");
      setState("create");
      toast.success("Password reset. Set a new one.");
    } catch {
      setError("Could not reset the password.");
      toast.error("Could not reset the password.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "open") return <>{children}</>;

  if (state === "loading") {
    return (
      <AppShell title="My Library">
        <p className="py-16 text-center text-sm text-muted-foreground">Checking your library lock…</p>
      </AppShell>
    );
  }

  const creating = state === "create";

  return (
    <AppShell title="Private Library" subtitle={creating ? "Set a password to protect your documents" : "Enter your password to continue"}>
      <div className="surface-card animate-rise mx-auto mt-6 max-w-sm space-y-4 p-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft">
          {creating ? <ShieldCheck className="h-6 w-6 text-brand-ink" /> : <Lock className="h-6 w-6 text-brand-ink" />}
        </span>
        <p className="text-sm text-muted-foreground">
          {creating
            ? "Your library is private. Create a password or a 4–6 digit PIN — only a salted hash is stored, never the value itself."
            : "Your saved documents and designs are locked."}
        </p>

        <div className="space-y-3 text-left">
          <div className="space-y-1.5">
            <Label htmlFor="pin">{creating ? "New password / PIN" : "Password / PIN"}</Label>
            <div className="relative">
              <Input
                id="pin"
                type={reveal ? "text" : "password"}
                inputMode="text"
                className="pr-10"
                autoComplete={creating ? "new-password" : "current-password"}
                maxLength={64}
                value={pin}
                disabled={busy}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && (creating ? create() : verify())}
              />
              <button
                type="button"
                aria-label={reveal ? "Hide password" : "Show password"}
                onClick={() => setReveal((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-accent"
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {creating && pin.length > 0 && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={cn("h-1 flex-1 rounded-full", i < strength.score ? strength.tone : "bg-muted")}
                    />
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">Strength: {strength.label}</p>
              </div>
            )}
          </div>
          {creating && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type={reveal ? "text" : "password"}
                maxLength={64}
                autoComplete="new-password"
                value={confirm}
                disabled={busy}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
            </div>
          )}
          {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
        </div>

        <Button className="w-full rounded-full" disabled={busy} onClick={creating ? create : verify}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy
            ? creating
              ? "Securing your library…"
              : "Checking…"
            : creating
              ? "Enable lock & open library"
              : "Unlock library"}
        </Button>

        {!creating && (
          <button className="text-xs font-semibold text-brand-ink underline-offset-2 hover:underline" onClick={forgot} disabled={busy}>
            Forgot password?
          </button>
        )}
      </div>
    </AppShell>
  );
}
