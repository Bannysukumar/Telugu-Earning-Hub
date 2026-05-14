import { Link } from "wouter";
import { cn } from "@/lib/utils";
// Imported so Vite emits a stable URL (root-based). Using `/logo.jpeg` from `public/`
// breaks when BASE_URL is relative (`./`) because the browser resolves it per route.
import brandLogoUrl from "@/assets/brand-logo.jpeg";

/** Display name (hyphenated brand). */
export const SITE_NAME = "Telugu-Earning-Hub";

/** Root-relative path in `public/` (duplicate of bundled asset) for favicon/meta if needed. */
export const LOGO_PUBLIC_PATH = "logo.jpeg";

/** Resolved URL from bundled `src/assets/brand-logo.jpeg`. */
export function brandLogoSrc(): string {
  return brandLogoUrl;
}

type BrandMarkProps = {
  href?: string;
  className?: string;
  logoClassName?: string;
  showText?: boolean;
  textClassName?: string;
};

/** Logo image + optional site name (used in headers / sidebars). */
export function BrandMark({
  href = "/",
  className,
  logoClassName,
  showText = true,
  textClassName,
}: BrandMarkProps) {
  const inner = (
    <>
      <img
        src={brandLogoUrl}
        alt={SITE_NAME}
        className={cn("h-10 w-10 object-contain shrink-0 rounded-lg", logoClassName)}
        width={40}
        height={40}
      />
      {showText ? (
        <span
          className={cn(
            "font-display font-bold tracking-tight text-gradient leading-none",
            "text-lg sm:text-xl md:text-2xl",
            textClassName,
          )}
        >
          {SITE_NAME}
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cn("flex items-center gap-2 group", className)}>
        {inner}
      </Link>
    );
  }

  return <div className={cn("flex items-center gap-2", className)}>{inner}</div>;
}
