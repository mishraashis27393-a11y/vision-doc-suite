import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/AppShell";
import { getLibraryLockStatus, setLibraryPin, verifyLibraryPin, resetLibraryPin } from "@/lib/library-lock.functions";

const SESSION_KEY = "dcr-library-unlocked";

export function LibraryLock({ children }: { children: React.ReactNode }) {
  const status = useServerFn(getLibraryLockStatus);
  const savePin = useServerFn(setLibraryPin);
  const checkPin = useServerFn(verifyLibraryPin);
  const clearPin = useServerFn(resetLibraryPin);

  const [state, setState] = useState<"loading" | "create" | "enter" | "open">("loading");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

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
    setState("open");
  };

  const create = async () => {
    if (pin.length < 4) return toast.error("Use at least 4 characters.");
    if (pin !== confirm) return toast.error("Both entries must match.");
    setBusy(true);
    try {
      await savePin({ data: { pin } });
      toast.success("Library lock enabled.");
      unlock();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not set the password.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!pin) return;
    setBusy(true);
    try {
      const res = await checkPin({ data: { pin } });
      if (res.ok) unlock();
      else if (res.reason === "not-set") setState("create");
      else toast.error("Wrong password. Try again.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify the password.");
    } finally {
      setBusy(false);
    }
  };

  const forgot = async () => {
    if (!window.confirm("Reset your library password? Your documents stay safe — you'll set a new password now.")) return;
    setBusy(true);
    try {
      await clearPin({});
      setPin("");
      setConfirm("");
      setState("create");
      toast.success("Password reset. Set a new one.");
    } catch {
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
            ? "Your library is private. Create a password or PIN — it is stored securely and never in plain text."
            : "Your saved documents and designs are locked."}
        </p>

        <div className="space-y-3 text-left">
          <div className="space-y-1.5">
            <Label htmlFor="pin">{creating ? "New password / PIN" : "Password / PIN"}</Label>
            <Input
              id="pin"
              type="password"
              inputMode="text"
              autoComplete={creating ? "new-password" : "current-password"}
              maxLength={64}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (creating ? create() : verify())}
            />
          </div>
          {creating && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                maxLength={64}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
            </div>
          )}
        </div>

        <Button className="w-full rounded-full" disabled={busy} onClick={creating ? create : verify}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {creating ? "Enable lock & open library" : "Unlock library"}
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
