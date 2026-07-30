export const CLERK_FRONTEND_API_PROXY_PATH = "/auth-runtime";

export function shouldProxyClerkFrontendApi(publishableKey?: string) {
  return publishableKey?.startsWith("pk_live_") ?? false;
}

export function clerkFrontendApiProxyUrl(
  publishableKey?: string,
  configuredProxyUrl?: string,
) {
  return shouldProxyClerkFrontendApi(publishableKey)
    && configuredProxyUrl === CLERK_FRONTEND_API_PROXY_PATH
    ? configuredProxyUrl
    : undefined;
}
