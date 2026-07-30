const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function proxiedStorageUrl(absoluteUrl: string): string {
  try {
    const parsed = new URL(absoluteUrl, window.location.origin);
    const apiPathIndex = parsed.pathname.indexOf("/api/storage/");
    if (apiPathIndex >= 0) {
      return `${basePath}${parsed.pathname.slice(apiPathIndex)}${parsed.search}`;
    }
  } catch {
    // Use the original value when it is not a parseable storage URL.
  }
  return absoluteUrl;
}

export function openStorageDocument(url: string): Window | null {
  // Do not use noopener here: the blank popup must be navigated synchronously
  // from the click handler. Clear the opener immediately after navigation.
  const popup = window.open("about:blank", "_blank");
  if (!popup) return null;
  popup.location.href = proxiedStorageUrl(url);
  popup.opener = null;
  return popup;
}
