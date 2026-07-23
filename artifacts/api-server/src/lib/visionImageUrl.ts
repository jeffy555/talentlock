import { guessContentType, usesLocalObjectStorage } from "./localObjectStorage";
import { ObjectStorageService } from "./objectStorage";

const objectStorageService = new ObjectStorageService();

/** Image URL suitable for OpenAI vision — data URL when using local disk storage. */
export async function resolveVisionImageUrl(relativeKey: string): Promise<string> {
  if (usesLocalObjectStorage()) {
    const buffer = await objectStorageService.readPrivateObjectBuffer(relativeKey);
    if (!buffer || buffer.length === 0) {
      throw new Error("Storage object not found");
    }
    const mime = guessContentType(relativeKey);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  }
  return objectStorageService.getSignedReadUrlForKey(relativeKey, 15 * 60);
}

/** Fresh signed read URL for browser/admin preview (always HTTP URL). */
export async function resolveStorageReadUrl(relativeKey: string, ttlSec = 15 * 60): Promise<string> {
  return objectStorageService.getSignedReadUrlForKey(relativeKey, ttlSec);
}
