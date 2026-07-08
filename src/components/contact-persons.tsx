"use client";

import { useActionState, useState } from "react";
import { Camera, Pencil, Plus, Trash2 } from "lucide-react";
import type { ActionState } from "@/app/actions/organizations";
import {
  createContactAction,
  deleteContactAction,
  updateContactAction,
} from "@/app/actions/contacts";
import {
  removeContactPhotoAction,
  uploadContactPhotoAction,
} from "@/app/actions/contacts";
import { contactDisplayName } from "@/lib/format/contact";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
const SALUTATIONS = ["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."];

export interface ContactView {
  id: string;
  version: number;
  salutation: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  workPhone: string | null;
  mobile: string | null;
  designation: string | null;
  department: string | null;
  isPrimary: boolean;
  /** resolved public URL; null = no photo or storage unconfigured */
  photoUrl?: string | null;
}


function ContactFormFields({ contact }: { contact?: ContactView }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="ct-salutation">Salutation</Label>
        <Select name="salutation" defaultValue={contact?.salutation ?? undefined}>
          <SelectTrigger id="ct-salutation" className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {SALUTATIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="hidden sm:block" />
      <div className="space-y-2">
        <Label htmlFor="ct-first">First name</Label>
        <Input id="ct-first" name="firstName" required defaultValue={contact?.firstName ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ct-last">Last name</Label>
        <Input id="ct-last" name="lastName" defaultValue={contact?.lastName ?? ""} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="ct-email">Email address</Label>
        <Input id="ct-email" name="email" type="email" defaultValue={contact?.email ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ct-work">Work phone</Label>
        <Input id="ct-work" name="workPhone" type="tel" placeholder="+2547…" defaultValue={contact?.workPhone ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ct-mobile">Mobile</Label>
        <Input id="ct-mobile" name="mobile" type="tel" placeholder="+2547…" defaultValue={contact?.mobile ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ct-designation">Designation</Label>
        <Input id="ct-designation" name="designation" defaultValue={contact?.designation ?? ""} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ct-department">Department</Label>
        <Input id="ct-department" name="department" defaultValue={contact?.department ?? ""} />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="isPrimary"
          defaultChecked={contact?.isPrimary ?? false}
          className="size-4 accent-primary"
        />
        Primary contact person
      </label>
    </div>
  );
}

function ContactDialog({
  organizationId,
  customerId,
  contact,
  trigger,
}: {
  organizationId: string;
  customerId: string;
  contact?: ContactView;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const boundAction = contact
    ? updateContactAction.bind(null, organizationId, customerId)
    : createContactAction.bind(null, organizationId, customerId);
  const [state, action, pending] = useActionState(
    async (prev: ActionState, formData: FormData) => {
      const result = await boundAction(prev, formData);
      if (!result.error) setOpen(false);
      return result;
    },
    initialState,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">
            {contact ? "Edit contact person" : "Add contact person"}
          </DialogTitle>
        </DialogHeader>
        <form action={action} className="space-y-4">
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          {contact && (
            <>
              <input type="hidden" name="id" value={contact.id} />
              <input type="hidden" name="version" value={contact.version} />
            </>
          )}
          <ContactFormFields contact={contact} />
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** CONTACT PERSONS section of the customer overview (per design ref). */
export function ContactPersons({
  organizationId,
  customerId,
  contacts,
  canEdit,
}: {
  organizationId: string;
  customerId: string;
  contacts: ContactView[];
  canEdit: boolean;
}) {
  const [deleteError, setDeleteError] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
          Contact persons
        </h3>
        {canEdit && (
          <ContactDialog
            organizationId={organizationId}
            customerId={customerId}
            trigger={
              <Button size="icon-xs" aria-label="Add contact person">
                <Plus />
              </Button>
            }
          />
        )}
      </div>
      {deleteError && (
        <Alert variant="destructive">
          <AlertDescription>{deleteError}</AlertDescription>
        </Alert>
      )}
      {contacts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No contact persons found.
        </p>
      ) : (
        <ul className="space-y-3">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex items-start gap-3">
              <Avatar className="size-8">
                {contact.photoUrl && (
                  <AvatarImage
                    src={contact.photoUrl}
                    alt={contactDisplayName(contact)}
                  />
                )}
                <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
                  {contact.firstName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <span className="truncate">{contactDisplayName(contact)}</span>
                  {contact.isPrimary && <Badge variant="secondary">primary</Badge>}
                </p>
                {contact.designation && (
                  <p className="truncate text-xs text-muted-foreground">
                    {[contact.designation, contact.department]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {contact.email && (
                  <p className="truncate text-xs text-muted-foreground">
                    {contact.email}
                  </p>
                )}
                {(contact.mobile ?? contact.workPhone) && (
                  <p className="truncate text-xs text-muted-foreground">
                    {contact.mobile ?? contact.workPhone}
                  </p>
                )}
              </div>
              {canEdit && (
                <span className="flex shrink-0 items-center gap-1">
                  <ContactPhotoDialog
                    organizationId={organizationId}
                    customerId={customerId}
                    contact={contact}
                  />
                  <ContactDialog
                    organizationId={organizationId}
                    customerId={customerId}
                    contact={contact}
                    trigger={
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label="Edit contact person"
                      >
                        <Pencil />
                      </Button>
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Delete contact person"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      const result = await deleteContactAction(
                        organizationId,
                        customerId,
                        contact.id,
                        contact.version,
                      );
                      setDeleteError(result.error);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContactPhotoDialog({
  organizationId,
  customerId,
  contact,
}: {
  organizationId: string;
  customerId: string;
  contact: ContactView;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    uploadContactPhotoAction.bind(null, organizationId, customerId, contact.id),
    initialState,
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="Profile photo">
          <Camera />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <form action={action} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              Photo — {contactDisplayName(contact)}
            </DialogTitle>
          </DialogHeader>
          {state.error && (
            <Alert variant="destructive">
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              {contact.photoUrl && (
                <AvatarImage
                  src={contact.photoUrl}
                  alt={contactDisplayName(contact)}
                />
              )}
              <AvatarFallback className="bg-primary/10 text-lg font-semibold text-primary">
                {contact.firstName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="space-y-2">
              <Input
                type="file"
                name="photo"
                accept="image/png,image/jpeg"
                required
              />
              <p className="text-xs text-muted-foreground">
                PNG or JPEG, up to 512 KB.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            {contact.photoUrl ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  await removeContactPhotoAction(
                    organizationId,
                    customerId,
                    contact.id,
                  );
                  setOpen(false);
                }}
              >
                Remove photo
              </Button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Uploading…" : "Upload"}
              </Button>
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
