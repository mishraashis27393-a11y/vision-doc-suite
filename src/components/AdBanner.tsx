import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { adsRemoved, initAds, isNativeAds, showBannerAd } from "@/lib/ads";
import { cn } from "@/lib/utils";

/**
 * Renders the AdMob banner. On the native Android wrapper the real SDK banner
 * is shown; on the web we render a lightweight house placeholder of the same
 * height so layouts stay identical.
 */
export function AdBanner({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  const [native, setNative] = useState(false);

  useEffect(() => {
    if (adsRemoved()) return;
    setVisible(true);
    setNative(isNativeAds());
    initAds().then(() => showBannerAd());
  }, []);

  if (!visible || native) return null;

  return (
    <div
      className={cn(
        "flex h-[52px] items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 text-[11px] text-muted-foreground",
        className,
      )}
      aria-label="Advertisement"
    >
      <Sparkles className="h-3.5 w-3.5" />
      Ad space — real AdMob banner shows in the Android build
    </div>
  );
}