import type { Metadata } from "next";
import { Geist, Geist_Mono, Outfit, Bricolage_Grotesque } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const bricolageGrotesque = Bricolage_Grotesque({subsets:['latin'],variable:'--font-heading'});

const outfit = Outfit({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Canja",
  description:
    "Kenya-first invoicing and payments for freelancers and small teams",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("font-sans", outfit.variable, bricolageGrotesque.variable)}>
      <script
        src="https://ansera-cdn.syncra.co.ke/widget/v1/loader.js"
        data-agent-id="b1682af7-0ee2-492d-828d-5f1be08628c6"
        data-api-base="https://ansera-api.syncra.co.ke"
        async
      ></script>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
