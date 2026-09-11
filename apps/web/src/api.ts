const storageKey = "spi.preview.auth-key";
const personaStorageKey = "spi.preview.persona-email";

export function getPreviewAuthKey() {
  return sessionStorage.getItem(storageKey) ?? "";
}

export function setPreviewAuthKey(value: string) {
  const key = value.trim();
  if (key) sessionStorage.setItem(storageKey, key);
  else sessionStorage.removeItem(storageKey);
}

export function getPreviewPersonaEmail() {
  return sessionStorage.getItem(personaStorageKey) ?? "";
}

export function setPreviewPersonaEmail(value: string) {
  const email = value.trim();
  if (email) sessionStorage.setItem(personaStorageKey, email);
  else sessionStorage.removeItem(personaStorageKey);
}

export function installAuthenticatedFetch() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
      window.location.origin,
    );
    const key = getPreviewAuthKey();
    const persona = getPreviewPersonaEmail();
    if (
      key &&
      url.origin === window.location.origin &&
      url.pathname.startsWith("/api/")
    ) {
      if (input instanceof Request) {
        const authored = new Request(input, init);
        const headers = new Headers(authored.headers);
        headers.set("Authorization", `Bearer ${key}`);
        if (persona) headers.set("X-Preview-As-Email", persona);
        return nativeFetch(new Request(authored, { headers }));
      }
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${key}`);
      if (persona) headers.set("X-Preview-As-Email", persona);
      return nativeFetch(input, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
}
