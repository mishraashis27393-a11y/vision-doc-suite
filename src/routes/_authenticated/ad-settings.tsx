import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeDollarSign, Gift } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { adsRemoved, isProduction, loadAdIds, saveAdIds, setAdsRemoved, showRewardedAd, TEST_AD_IDS, type AdIds } from "@/lib/ads";

export const Route = createFileRoute("/_authenticated/ad-settings")({
  head: () => ({
    meta: [
      { title: "AdMob Settings — D.Cr Library" },
      { name: "description", content: "Configure Google AdMob app ID, banner, interstitial and rewarded ad units." },
      { property: "og:title", content: "AdMob Settings — D.Cr Library" },
      { property: "og:description", content: "Manage monetization ad units for the Android build." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdSettingsPage,
});

const FIELDS: { key: keyof AdIds; label: string }[] = [
  { key: "appId", label: "AdMob App ID" },
  { key: "banner", label: "Banner ad unit ID" },
  { key: "interstitial", label: "Interstitial ad unit ID" },
  { key: "rewarded", label: "Rewarded ad unit ID" },
];

function AdSettingsPage() {
  const [ids, setIds] = useState<AdIds>(TEST_AD_IDS);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    setIds(loadAdIds());
    setRemoved(adsRemoved());
  }, []);

  const save = () => {
    saveAdIds(ids);
    toast.success("Ad units saved");
  };

  const watchRewarded = async () => {
    const earned = await showRewardedAd();
    toast[earned ? "success" : "message"](
      earned ? "Reward unlocked" : "Rewarded ads play in the Android build",
    );
  };

  return (
    <AppShell title="Monetization" subtitle="Google AdMob ad units">
      <div className="surface-card flex items-start gap-3 p-4">
        <BadgeDollarSign className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {isProduction()
            ? "Production build — the IDs below are live."
            : "Development build — Google test ad units are used automatically, whatever you save here."}
        </p>
      </div>

      <div className="surface-card mt-4 space-y-4 p-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={f.key} className="text-xs">
              {f.label}
            </Label>
            <Input
              id={f.key}
              value={ids[f.key]}
              onChange={(e) => setIds({ ...ids, [f.key]: e.target.value })}
              placeholder={TEST_AD_IDS[f.key]}
              className="rounded-xl text-xs"
            />
          </div>
        ))}
        <Button className="w-full rounded-full" onClick={save}>
          Save ad units
        </Button>
      </div>

      <div className="surface-card mt-4 flex items-center justify-between p-4">
        <Label htmlFor="remove-ads" className="text-sm">
          Ad-free mode
        </Label>
        <Switch
          id="remove-ads"
          checked={removed}
          onCheckedChange={(v) => {
            setRemoved(v);
            setAdsRemoved(v);
          }}
        />
      </div>

      <Button variant="outline" className="mt-4 w-full rounded-full" onClick={watchRewarded}>
        <Gift className="mr-2 h-4 w-4" /> Test rewarded ad
      </Button>
    </AppShell>
  );
}