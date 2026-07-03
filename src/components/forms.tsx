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

const initialState: ActionState = { error: null };

export function CreateOrgForm() {
  const [state, action, pending] = useActionState(
    createOrganizationAction,
    initialState,
  );
  return (
    <form action={action} className="space-y-3">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <input
        name="name"
        required
        placeholder="Organization name"
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <select
        name="type"
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm"
        defaultValue="personal"
      >
        <option value="personal">Personal</option>
        <option value="business">Business</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Creating…" : "Create organization"}
      </button>
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
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input
        name="email"
        type="email"
        required
        placeholder="teammate@example.com"
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
      />
      <select
        name="role"
        defaultValue="member"
        className="rounded border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="admin">Admin</option>
        <option value="member">Member</option>
        <option value="viewer">Viewer</option>
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Inviting…" : "Invite"}
      </button>
      {state.error && (
        <p className="w-full text-sm text-red-600">{state.error}</p>
      )}
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
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Joining…" : "Accept invitation"}
      </button>
    </form>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
      }}
      className="text-sm text-neutral-600 underline"
    >
      Sign out
    </button>
  );
}
