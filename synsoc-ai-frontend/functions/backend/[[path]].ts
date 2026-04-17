const DEFAULT_BACKEND_ORIGIN = 'https://synsoc-api-production.up.railway.app';

/**
 * Cloudflare Pages Function proxy for preserving same-origin frontend API calls.
 *
 * Proxies /backend/* -> Railway backend while forwarding method, headers,
 * query string, and request body so SSE and long-running stream endpoints work.
 */
export const onRequest = async (context: any): Promise<Response> => {
  const backendOrigin = (context.env?.BACKEND_ORIGIN || DEFAULT_BACKEND_ORIGIN).replace(/\/+$/, '');
  const incomingUrl = new URL(context.request.url);
  const proxiedPath = incomingUrl.pathname.replace(/^\/backend/, '') || '/';
  const targetUrl = `${backendOrigin}${proxiedPath}${incomingUrl.search}`;

  const requestHeaders = new Headers(context.request.headers);

  const requestInit: RequestInit = {
    method: context.request.method,
    headers: requestHeaders,
    redirect: 'follow',
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
  };

  const upstreamResponse = await fetch(targetUrl, requestInit);
  const responseHeaders = new Headers(upstreamResponse.headers);

  // Ensure clients and intermediaries do not cache streamed API responses.
  responseHeaders.set('Cache-Control', 'no-store');

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
};
