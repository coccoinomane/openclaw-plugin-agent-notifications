function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function loadDefaultSdk() {
  const [sessions, config] = await Promise.all([
    import("openclaw/plugin-sdk/session-discussion"),
    import("openclaw/plugin-sdk/config-contracts"),
  ]);
  return {
    buildControlUiSessionPath: sessions.buildControlUiSessionPath,
    resolveGatewayPublicOrigin: config.resolveGatewayPublicOrigin,
  };
}

function isBareHttpOrigin(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/";
  } catch {
    return false;
  }
}

// Read-only enrichment: never create, promote, or patch a child session.
// SDK imports are optional so an older host can still deliver text notices.
export function createSessionLinkResolver({ loadSdk = loadDefaultSdk, logger = console } = {}) {
  let sdkPromise;
  const getSdk = () => {
    if (!sdkPromise) sdkPromise = Promise.resolve().then(loadSdk).catch(() => {
      logger.warn?.("[subagent-launch-notice] session link SDK unavailable; keeping text notices");
      return null;
    });
    return sdkPromise;
  };

  return async (api, event) => {
    // Keep the existing visible-spawn receipt and rendering path unchanged.
    if (event.visible === true) return normalizeString(event.sessionUrl);
    const sessionKey = normalizeString(event.childSessionKey);
    if (!sessionKey) return "";

    try {
      // api.config is the registration snapshot; current() observes hot reloads.
      const config = typeof api.runtime?.config?.current === "function"
        ? await api.runtime.config.current()
        : api.config;
      if (config?.gateway?.controlUi?.enabled === false) return "";
      const authoredOrigin = normalizeString(config?.gateway?.publicOrigin);
      if (!isBareHttpOrigin(authoredOrigin)) return "";

      const sdk = await getSdk();
      if (typeof sdk?.buildControlUiSessionPath !== "function" ||
          typeof sdk?.resolveGatewayPublicOrigin !== "function") return "";
      const origin = sdk.resolveGatewayPublicOrigin(config);
      if (!isBareHttpOrigin(origin)) return "";
      const pathname = sdk.buildControlUiSessionPath({
        namespace: "chat",
        sessionKey,
        fallbackAgentId: normalizeString(event.agentId) || undefined,
        basePath: config?.gateway?.controlUi?.basePath,
        exactKey: true,
      });
      if (typeof pathname !== "string" || !pathname.startsWith("/")) return "";
      const url = new URL(origin);
      url.pathname = pathname;
      return url.toString();
    } catch {
      // Do not fall back to stale config, guess an origin, or print credentials.
      logger.warn?.("[subagent-launch-notice] session link unavailable; keeping text notice");
      return "";
    }
  };
}
