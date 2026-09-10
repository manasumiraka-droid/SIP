const storageKey = "spi.preview.auth-key";

export function getPreviewAuthKey() {
  return sessionStorage.getItem(storageKey) ?? "";
}

export function setPreviewAuthKey(value: string) {
  const key = value.trim();
  if (key) sessionStorage.setItem(storageKey, key);
  else sessionStorage.removeItem(storageKey);
}

export function installAuthenticatedFetch() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      window.location.origin,
    );
    const key = getPreviewAuthKey();
    if (
      key &&
      url.origin === window.location.origin &&
      url.pathname.startsWith("/api/")
    ) {
      const headers = new Headers(
        input instanceof Request ? input.headers : init.headers,
      );
      headers.set("Authorization", `Bearer ${key}`);
      return nativeFetch(input, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
}
