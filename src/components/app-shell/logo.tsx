import Image from "next/image";
import Link from "next/link";

/** Brand wordmark, theme-aware (color on light surfaces, white on dark). */
export function Logo({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      <Image
        src="/logo_assets/color-logo.png"
        alt="invoicer"
        width={256}
        height={256}
        className="w-28 h-8 dark:hidden"
        priority
      />
      <Image
        src="/logo_assets/logo-grayscale.png"
        alt="invoicer"
        width={256}
        height={256}
        className="hidden h-8 w-auto dark:block"
        priority
      />
    </Link>
  );
}
