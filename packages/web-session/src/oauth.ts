// The website's half of OAuth for MCP clients (#9). When Claude or another MCP client asks a
// member to connect, Better Auth sends the browser to the site's sign-in page, then to its consent
// page, each with a signed query. These helpers read that query and pass it back explicitly, to
// /oauth2/continue and /oauth2/consent only. Those are the only endpoints the server accepts it
// on (apps/api/src/oauth-server.ts): a sign-in carrying an authorization is refused, because the
// Discord callback would otherwise finish it with the session's one-time token attached.

/** An OAuth authorization waiting on this page. */
export interface PendingAuthorization {
  clientId: string;
  scopes: string[];
  /** The signed query, passed back unchanged as `oauth_query`. */
  query: string;
}

/** A client's public details, for the consent screen. */
export interface OAuthClientInfo {
  name?: string;
  uri?: string;
  logoUri?: string;
}

/**
 * The authorization pending in a page's query (the sign-in and consent pages), or null. The
 * query must be passed back exactly as received: its signature covers every parameter.
 */
export function pendingAuthorization(search: string): PendingAuthorization | null {
  const query = search.startsWith('?') ? search.slice(1) : search;
  const params = new URLSearchParams(query);
  const clientId = params.get('client_id');
  if (!clientId || !params.get('sig')) return null;
  const scopes = (params.get('scope') ?? '').split(' ').filter(Boolean);
  return { clientId, scopes, query };
}

/** The slice of Better Auth's client `$fetch` these calls use, so tests can pass a fake. */
export type AuthFetch = (
  path: string,
  options: { method: 'GET' | 'POST'; body?: unknown; query?: Record<string, string> },
) => Promise<{ data: unknown; error: { message?: string; status?: number } | null }>;

export interface OAuthActions {
  /** The pending authorization on this page, or null when there isn't one. */
  pending(): PendingAuthorization | null;
  /**
   * On the sign-in page, once signed in: continue as this member. Navigates to the consent page,
   * or straight back to the client if they already consented.
   */
  continue(): Promise<void>;
  /** On the consent page: accept or deny. Navigates back to the client either way. */
  consent(accept: boolean): Promise<void>;
  /** The client's public name and links, for the consent screen. Needs a signed-in member. */
  client(clientId: string): Promise<OAuthClientInfo | null>;
}

const nextUrl = (data: unknown): string => {
  const url = (data as { url?: unknown } | null)?.url;
  if (typeof url !== 'string' || !url)
    throw new Error('The authorization server sent no next step');
  return url;
};

const fail = (error: { message?: string; status?: number }) =>
  new Error(error.message || `The authorization server refused (${error.status ?? 'error'})`);

export function oauthActions(
  authFetch: AuthFetch,
  location: { search(): string; assign(url: string): void },
): OAuthActions {
  const pending = () => pendingAuthorization(location.search());
  const require = () => {
    const p = pending();
    if (!p) throw new Error('No authorization is waiting on this page');
    return p;
  };
  return {
    pending,
    async continue() {
      const { query } = require();
      const { data, error } = await authFetch('/oauth2/continue', {
        method: 'POST',
        body: { selected: true, oauth_query: query },
      });
      if (error) throw fail(error);
      location.assign(nextUrl(data));
    },
    async consent(accept) {
      const { query } = require();
      const { data, error } = await authFetch('/oauth2/consent', {
        method: 'POST',
        body: { accept, oauth_query: query },
      });
      if (error) throw fail(error);
      location.assign(nextUrl(data));
    },
    async client(clientId) {
      const { data, error } = await authFetch('/oauth2/public-client', {
        method: 'GET',
        query: { client_id: clientId },
      });
      if (error || !data) return null;
      const c = data as { client_name?: string; client_uri?: string; logo_uri?: string };
      return {
        ...(c.client_name ? { name: c.client_name } : {}),
        ...(c.client_uri ? { uri: c.client_uri } : {}),
        ...(c.logo_uri ? { logoUri: c.logo_uri } : {}),
      };
    },
  };
}
