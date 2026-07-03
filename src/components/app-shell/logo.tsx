import Image from "next/image";
import Link from "next/link";

/** Brand wordmark, theme-aware (color on light surfaces, white on dark). */
export function Logo({ href = "/dashboard" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      <Image
        src="/logo_assets/wordmark-color.png"
        alt="invoicer"
        width={120}
        height={32}
        className="h-7 w-auto dark:hidden"
        priority
      />
      <Image
        src="/logo_assets/wordmark-white.png"
        alt="invoicer"
        width={120}
        height={32}
        className="hidden h-7 w-auto dark:block"
        priority
      />
    </Link>
  );
}
