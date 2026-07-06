"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { ActionState } from "@/app/actions/organizations";
import {
  acceptInvitationAction,
  createOrganizationAction,
  inviteMemberAction,
} from "@/app/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: ActionState = { error: null };

function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <Alert variant="destructive" className="w-full">
      <AlertDescription>{error}</AlertDescription>
    </Alert>
  );
}

export function CreateOrgForm() {
  const [state, action, pending] = useActionState(
    createOrganizationAction,
    initialState,
  );
  return (
    <form action={action} className="space-y-3">
      <FormError error={state.error} />
      <div className="space-y-2">
        <Label htmlFor="org-name">Organization name</Label>
        <Input id="org-name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-type">Type</Label>
        <Select name="type" defaultValue="personal">
          <SelectTrigger id="org-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="personal">Personal</SelectItem>
            <SelectItem value="business">Business</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create organization"}
      </Button>
    </form>
  );
}

export function InviteMemberForm({
  organizationId,
}: {
  organizationId: string;
}) {
  const [state, action, pending] = useActionState(
    inviteMemberAction.bind(null, organizationId),
    initialState,
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <div className="space-y-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          placeholder="teammate@example.com"
          className="w-56"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="invite-role">Role</Label>
        <Select name="role" defaultValue="member">
          <SelectTrigger id="invite-role" className="w-32 mb-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
            <SelectItem value="viewer">Viewer</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Inviting…" : "Invite"}
      </Button>
      <FormError error={state.error} />
    </form>
  );
}

export function AcceptInvitationButton({
  invitationId,
}: {
  invitationId: string;
}) {
  const [state, action, pending] = useActionState(
    async (): Promise<ActionState> => acceptInvitationAction(invitationId),
    initialState,
  );
  return (
    <form action={action} className="space-y-2">
      <FormError error={state.error} />
      <Button type="submit" disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </Button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
    >
      Sign out
    </Button>
  );
}
