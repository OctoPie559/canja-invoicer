/**
 * File storage port (ARCHITECTURE.md §1.1): services depend on this
 * interface, never on a provider. Cloudflare R2 in production (S3 API,
 * public bucket behind a custom domain); an in-memory adapter in tests
 * and a clear error in dev until R2 env vars are configured.
 */

export interface StoredFile {
  /** object key, e.g. "orgs/<orgId>/branding/logo-<id>.png" */
  key: string;
  /** publicly fetchable URL (email clients/PDF viewers need no auth) */
  publicUrl: string;
}

export interface FileStorage {
  put(params: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredFile>;
  delete(key: string): Promise<void>;
  publicUrl(key: string): string;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "File storage is not configured — set the R2_* environment variables",
    );
    this.name = "StorageNotConfiguredError";
  }
}
