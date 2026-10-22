import { apiFetch, apiUrl } from "./api/client";

/** The API's OAuth "connect" routes — the only places the /connect page
 * will send a browser to. */
const CONNECT_TARGET =
  /^\/(email-accounts|calendar-accounts|integrations)\/connect\/(google|microsoft|slack|teams|hubspot)$/;

/**
 * A link that starts a Connect flow. It points at the app's own /connect
 * page, which swaps in a 60-second connect ticket just before redirecting
 * (see startConnect) — the access token never appears in a URL, the
 * browser history or a server log.
 */
export function connectLink(
  apiPath: string,
  params: Record<string, string> = {},
): string {
  return `/connect?${new URLSearchParams({ to: apiPath, ...params }).toString()}`;
}

/** Called by the /connect page: fetches a ticket and redirects the browser
 * to the API's connect route with it. Refuses any other target. */
export async function startConnect(search: URLSearchParams): Promise<void> {
  const to = search.get("to") ?? "";
  if (!CONNECT_TARGET.test(to)) {
    throw new Error("Unknown connect target");
  }

  const { ticket } = await apiFetch<{ ticket: string }>("/auth/connect-ticket", {
    method: "POST",
  });
  const params = new URLSearchParams(search);
  params.delete("to");
  params.set("ticket", ticket);
  window.location.replace(`${apiUrl(to)}?${params.toString()}`);
}
