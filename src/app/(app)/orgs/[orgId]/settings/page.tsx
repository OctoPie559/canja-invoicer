import { redirect } from "next/navigation";

/** The settings area is categorized (see layout); land on the profile. */
export default async function OrgSettingsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  redirect(`/orgs/${orgId}/settings/profile`);
}
