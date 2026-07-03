import { createAuthClient } from "better-auth/react";

/** Client-side auth API. Any role/plan logic here is UX only, never trusted. */
export const authClient = createAuthClient();
