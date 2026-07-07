"use client";

import { useActionState } from "react";
import { Upload } from "lucide-react";
import {
  updateBrandingAction,
  uploadLogoAction,
} from "@/app/actions/branding";
import type { ActionState } from "@/app/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface BrandingValues {
  version: number;
  legalName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  country: string | null;
  kraPin: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  accentColor: string | null;
  /** public URL when a logo exists and storage is configured */
  logoUrl: string | null;
}

export function BrandingLogoForm({
  organizationId,
  logoUrl,
}: {
  organizationId: string;
  logoUrl: string | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    uploadLogoAction.bind(null, organizationId),
    { error: null },
  );

  return (
    <form action={action} className="space-y-3">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-4">
        {logoUrl ? (
          // R2-hosted, unoptimizable by Next on purpose (external host)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Organization logo"
            className="h-14 w-auto rounded border bg-white p-1"
          />
        ) : (
          <div className="flex h-14 w-28 items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
            No logo yet
          </div>
        )}
        <div className="space-y-2">
          <Input type="file" name="logo" accept="image/png,image/jpeg" required />
          <Button type="submit" size="sm" disabled={pending}>
            <Upload />
            {pending ? "Uploading…" : "Upload logo"}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        PNG or JPEG, up to 512 KB. Appears on invoices, emails, and the
        hosted view — already-issued documents keep the logo they were
        issued with.
      </p>
    </form>
  );
}

export function BrandingDetailsForm({
  organizationId,
  branding,
}: {
  organizationId: string;
  branding: BrandingValues;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateBrandingAction.bind(null, organizationId),
    { error: null },
  );

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="version" value={branding.version} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="b-legal">Legal / trading name</Label>
          <Input
            id="b-legal"
            name="legalName"
            defaultValue={branding.legalName ?? ""}
            placeholder="Shown on documents"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-pin">KRA PIN</Label>
          <Input id="b-pin" name="kraPin" defaultValue={branding.kraPin ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-a1">Address line 1</Label>
          <Input
            id="b-a1"
            name="addressLine1"
            defaultValue={branding.addressLine1 ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-a2">Address line 2</Label>
          <Input
            id="b-a2"
            name="addressLine2"
            defaultValue={branding.addressLine2 ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-city">City</Label>
          <Input id="b-city" name="city" defaultValue={branding.city ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-country">Country</Label>
          <Input
            id="b-country"
            name="country"
            defaultValue={branding.country ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-email">Billing email</Label>
          <Input
            id="b-email"
            name="contactEmail"
            type="email"
            defaultValue={branding.contactEmail ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-phone">Phone</Label>
          <Input
            id="b-phone"
            name="contactPhone"
            type="tel"
            placeholder="+2547…"
            defaultValue={branding.contactPhone ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="b-accent">Accent color</Label>
          <div className="flex items-center gap-2">
            <Input
              id="b-accent"
              name="accentColor"
              defaultValue={branding.accentColor ?? ""}
              placeholder="#103B05"
              className="w-32 font-mono"
            />
            <span
              className="size-6 rounded border"
              style={{ backgroundColor: branding.accentColor ?? "#103B05" }}
            />
          </div>
        </div>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save branding"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Applied to future documents; issued invoices keep their snapshot.
      </p>
    </form>
  );
}
