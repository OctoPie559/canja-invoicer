"use client";

import { useActionState } from "react";
import { updateOrganizationNameAction } from "@/app/actions/settings";
import type { ActionState } from "@/app/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OrgProfileForm({
  organizationId,
  name,
}: {
  organizationId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateOrganizationNameAction.bind(null, organizationId),
    { error: null },
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            name="name"
            defaultValue={name}
            className="w-72"
            minLength={2}
            maxLength={120}
            required
          />
        </div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Shown across the app and on your documents. Renaming is recorded in
        the audit trail.
      </p>
    </form>
  );
}
