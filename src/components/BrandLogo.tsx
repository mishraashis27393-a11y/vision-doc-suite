import logo from "@/assets/logo-am.png";
import { cn } from "@/lib/utils";

/** AM monogram brand mark for Ashish Mishra — Vision Doc Suite. */
export function BrandLogo({ className, size = 40 }: { className?: string; size?: number }) {
  return (
    <img
      src={logo}
      alt="Ashish Mishra — Vision Doc Suite logo"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}

/** Logo plus the two-line brand name. */
export function BrandLock({
  className,
  size = 40,
  tone = "default",
}: {
  className?: string;
  size?: number;
  tone?: "default" | "invert";
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandLogo size={size} />
      <div className="min-w-0 leading-tight">
        <p className={cn("truncate text-[11px] font-semibold", tone === "invert" ? "opacity-80" : "text-muted-foreground")}>
          Ashish Mishra
        </p>
        <p className="truncate text-sm font-extrabold tracking-tight">Vision Doc Suite</p>
      </div>
    </div>
  );
}
