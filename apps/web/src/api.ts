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
      if (input instanceof Request) {
        // Build from the Request so its method/body/mode survive, then layer
        // the caller's init over it with the auth header merged in.
        const authored = new Request(input, init);
        const headers = new Headers(authored.headers);
        headers.set("Authorization", `Bearer ${key}`);
        return nativeFetch(new Request(authored, { headers }));
      }
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${key}`);
      return nativeFetch(input, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
}
