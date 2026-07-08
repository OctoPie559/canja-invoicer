"use client";

import { useActionState, useState } from "react";
import { ImagePlus, Package } from "lucide-react";
import {
  removeProductImageAction,
  uploadProductImageAction,
} from "@/app/actions/products";
import type { ActionState } from "@/app/actions/organizations";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Catalog image slot on the product workspace (Item information section). */
export function ProductImage({
  organizationId,
  productId,
  productName,
  imageUrl,
  canEdit,
}: {
  organizationId: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    uploadProductImageAction.bind(null, organizationId, productId),
    { error: null },
  );

  const preview = imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- R2-hosted
    <img
      src={imageUrl}
      alt={productName}
      className="h-24 w-24 rounded-md border object-cover"
    />
  ) : (
    <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed text-muted-foreground">
      <Package className="size-8" />
    </div>
  );

  if (!canEdit) return preview;

  return (
    <div className="flex items-end gap-2">
      {preview}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Product image"
          >
            <ImagePlus />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-sm">
          <form action={action} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Image — {productName}</DialogTitle>
            </DialogHeader>
            {state.error && (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            )}
            <Input
              type="file"
              name="image"
              accept="image/png,image/jpeg"
              required
            />
            <p className="text-xs text-muted-foreground">
              PNG or JPEG, up to 512 KB. Shown in your catalog — invoices
              print line descriptions, not images.
            </p>
            <div className="flex items-center justify-between gap-2">
              {imageUrl ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={async () => {
                    await removeProductImageAction(organizationId, productId);
                    setOpen(false);
                  }}
                >
                  Remove image
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
    </div>
  );
}
