import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "Canja — Invoices that actually get paid",
  description:
    "Professional invoices, M-Pesa payments, and one clear record of every shilling — built for Kenyan freelancers and small teams.",
};

export default function Home() {
  return <LandingPage />;
}
