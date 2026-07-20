import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { listUserOrganizations } from "@/lib/services/organizations";
import { requireSession } from "@/lib/transport/session";

/**
 * The workspace IS the org: land inside it. No orgs yet → onboarding.
 * Org management lives in the sidebar switcher, not on a dashboard page.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const orgs = await listUserOrganizations(getDb(), session.user.id);
  // first-run (no org yet) → the guided onboarding wizard (issue 1);
  // invited users already have a membership and skip straight to their org
  redirect(orgs.length === 0 ? "/onboarding" : `/orgs/${orgs[0].id}`);
}
