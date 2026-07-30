import {
  BlobSASPermissions,
  BlobServiceClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

const FREELANCER_CONTAINER = "freelancer";
const EMPLOYER_CONTAINER = "employer";

export type AzureDocumentContainer = typeof FREELANCER_CONTAINER | typeof EMPLOYER_CONTAINER;

export function usesAzureObjectStorage(): boolean {
  return Boolean(process.env.AZURE_STORAGE_CONNECTION_STRING?.trim());
}

export function isAzureStorageKey(relativeKey: string): boolean {
  const key = relativeKey.replace(/^\/+/, "");
  return key.startsWith(`${FREELANCER_CONTAINER}/`) || key.startsWith(`${EMPLOYER_CONTAINER}/`);
}

function parseConnectionString(connectionString: string): {
  accountName: string;
  accountKey: string;
  blobEndpoint: string;
} {
  const parts = Object.fromEntries(
    connectionString
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const idx = part.indexOf("=");
        if (idx < 0) return [part, ""];
        return [part.slice(0, idx), part.slice(idx + 1)];
      }),
  ) as Record<string, string>;

  const accountName = parts.AccountName;
  const accountKey = parts.AccountKey;
  const protocol = parts.DefaultEndpointsProtocol || "https";
  const suffix = parts.EndpointSuffix || "core.windows.net";
  if (!accountName || !accountKey) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is missing AccountName or AccountKey");
  }
  return {
    accountName,
    accountKey,
    blobEndpoint: `${protocol}://${accountName}.blob.${suffix}`,
  };
}

function getCredential(): {
  service: BlobServiceClient;
  sharedKey: StorageSharedKeyCredential;
  accountName: string;
} {
  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING?.trim();
  if (!connectionString) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }
  const { accountName, accountKey, blobEndpoint } = parseConnectionString(connectionString);
  const sharedKey = new StorageSharedKeyCredential(accountName, accountKey);
  const service = new BlobServiceClient(blobEndpoint, sharedKey);
  return { service, sharedKey, accountName };
}

export function parseAzureStorageKey(relativeKey: string): {
  container: AzureDocumentContainer;
  blobName: string;
} {
  const normalized = relativeKey.replace(/^\/+/, "");
  const slash = normalized.indexOf("/");
  if (slash <= 0) {
    throw new Error(`Invalid Azure storage key: ${relativeKey}`);
  }
  const container = normalized.slice(0, slash);
  const blobName = normalized.slice(slash + 1);
  if (
    (container !== FREELANCER_CONTAINER && container !== EMPLOYER_CONTAINER) ||
    !blobName ||
    blobName.includes("..")
  ) {
    throw new Error(`Invalid Azure storage key: ${relativeKey}`);
  }
  return { container, blobName };
}

/** Safe folder segment: `42` or `42-jane-doe` */
export function buildAzureUserFolder(userId: number, displayName?: string | null): string {
  const slug = (displayName ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug ? `${userId}-${slug}` : String(userId);
}

export function buildAzureDocumentKey(params: {
  container: AzureDocumentContainer;
  userId: number;
  displayName?: string | null;
  documentType: string;
  filename: string;
}): string {
  const folder = buildAzureUserFolder(params.userId, params.displayName);
  return `${params.container}/${folder}/${params.documentType}/${params.filename}`;
}

export function isValidAzureDocumentKey(params: {
  storagePath: string;
  container: AzureDocumentContainer;
  userId: number;
  documentType: string;
}): boolean {
  const { storagePath, container, userId, documentType } = params;
  if (storagePath.includes("..") || storagePath.includes("//")) return false;
  const prefix = `${container}/${userId}`;
  // folder is either `{userId}` or `{userId}-{slug}`
  const re = new RegExp(
    `^${container}/${userId}(?:-[a-z0-9-]+)?/${documentType}/[^/]+$`,
  );
  return storagePath.startsWith(prefix) && re.test(storagePath);
}

export async function azureObjectExists(relativeKey: string): Promise<boolean> {
  const { service } = getCredential();
  const { container, blobName } = parseAzureStorageKey(relativeKey);
  return service.getContainerClient(container).getBlockBlobClient(blobName).exists();
}

export async function readAzureObject(relativeKey: string): Promise<Buffer> {
  const { service } = getCredential();
  const { container, blobName } = parseAzureStorageKey(relativeKey);
  const download = await service
    .getContainerClient(container)
    .getBlockBlobClient(blobName)
    .download(0);
  if (!download.readableStreamBody) {
    throw new Error("Azure blob download returned no body");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of download.readableStreamBody) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export async function writeAzureObject(
  relativeKey: string,
  data: Buffer,
  contentType: string,
): Promise<void> {
  const { service } = getCredential();
  const { container, blobName } = parseAzureStorageKey(relativeKey);
  await service
    .getContainerClient(container)
    .getBlockBlobClient(blobName)
    .uploadData(data, {
      blobHTTPHeaders: { blobContentType: contentType || "application/octet-stream" },
    });
}

export async function deleteAzureObject(relativeKey: string): Promise<void> {
  const { service } = getCredential();
  const { container, blobName } = parseAzureStorageKey(relativeKey);
  await service
    .getContainerClient(container)
    .getBlockBlobClient(blobName)
    .deleteIfExists();
}

/** Time-limited SAS URL for AI review / admin preview (OpenAI can fetch this). */
export async function createAzureSasUrl(
  relativeKey: string,
  method: "GET" | "PUT",
  ttlSec: number,
): Promise<string> {
  const { sharedKey, accountName, service } = getCredential();
  const { container, blobName } = parseAzureStorageKey(relativeKey);
  const startsOn = new Date(Date.now() - 60_000);
  const expiresOn = new Date(Date.now() + ttlSec * 1000);
  const permissions =
    method === "PUT"
      ? BlobSASPermissions.parse("cw")
      : BlobSASPermissions.parse("r");

  const sas = generateBlobSASQueryParameters(
    {
      containerName: container,
      blobName,
      permissions,
      startsOn,
      expiresOn,
    },
    sharedKey,
  ).toString();

  const blobClient = service.getContainerClient(container).getBlockBlobClient(blobName);
  // Prefer client URL (includes encoded blob path) + SAS
  void accountName;
  return `${blobClient.url}?${sas}`;
}
