import Image from "next/image";
import Link from "next/link";

/** Brand wordmark, theme-aware (color on light surfaces, white on dark). */
export function Logo({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      <Image
        src="/logo_assets/wordmark-color.png"
        alt="Canja"
        width={256}
        height={256}
        className="w-28 h-8 dark:hidden group-data-[collapsible=icon]:hidden"
        priority
      />
      <Image
        src="/logo_assets/logo-grayscale.png"
        alt="Canja"
        width={256}
        height={256}
        className="hidden h-8 w-auto dark:block group-data-[collapsible=icon]:dark:hidden"
        priority
      />
      {/* Compact mark shown only when the rail collapses to icons */}
      <Image
        src="/logo_assets/icon-color.png"
        alt="Canja"
        width={64}
        height={64}
        className="hidden size-6.5 group-data-[collapsible=icon]:block"
        priority
      />
    </Link>
  );
}
