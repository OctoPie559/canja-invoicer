import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  StorageNotConfiguredError,
  type FileStorage,
  type StoredFile,
} from "./port";

/**
 * Cloudflare R2 adapter (S3-compatible API). The bucket is public behind
 * R2_PUBLIC_BASE_URL (a custom domain through Cloudflare) so logos resolve
 * in emails, PDFs, and the hosted view without auth. Zero egress fees make
 * this the cheap path for image-heavy reads.
 */
class R2Storage implements FileStorage {
  private readonly client: S3Client;

  constructor(
    accountId: string,
    accessKeyId: string,
    secretAccessKey: string,
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
  ) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async put(params: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<StoredFile> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
        // immutable keys (content-addressed by id) → cache hard
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    return { key: params.key, publicUrl: this.publicUrl(params.key) };
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  }
}

/** Throws on any use; lets the app boot without R2 configured. */
class UnconfiguredStorage implements FileStorage {
  async put(): Promise<StoredFile> {
    throw new StorageNotConfiguredError();
  }
  async delete(): Promise<void> {
    throw new StorageNotConfiguredError();
  }
  publicUrl(): string {
    throw new StorageNotConfiguredError();
  }
}

let storage: FileStorage | null = null;

export function getFileStorage(): FileStorage {
  if (storage) return storage;
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  storage =
    accountId && accessKeyId && secretAccessKey && bucket && publicBaseUrl
      ? new R2Storage(accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl)
      : new UnconfiguredStorage();
  return storage;
}
