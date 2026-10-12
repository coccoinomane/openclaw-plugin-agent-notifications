import { buildNoticeMessage } from "./notice-message.js";
import { createSessionLinkResolver } from "./session-link.js";

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

// Dependencies are injected for regression tests without invoking message send.
export function createLaunchNotifier(api, {
  resolveConfig, resolveRequesterRoute, isNestedRequester, markSentOnce, sendNotice,
  resolveSessionLink = createSessionLinkResolver({ logger: api.logger || console }),
}) {
  return async (event, ctx) => {
    const config = resolveConfig(api);
    if (event.visible === true && !config.notifyVisible) return;
    const route = await resolveRequesterRoute(event, ctx);
    const channel = normalizeString(route.channel).toLowerCase();
    const target = normalizeString(route.to);
    if (!channel || !target) return;
    if (!config.channels.has(channel) && !config.channels.has("*")) return;
    if (!config.includeNested && isNestedRequester(ctx)) return;

    const sessionUrl = await resolveSessionLink(api, event);
    const message = buildNoticeMessage(config, { ...event, sessionUrl }, ctx, route);
    if (!message) return;

    const key = normalizeString(event.runId) || normalizeString(event.childSessionKey);
    if (!markSentOnce(key, event)) return;

    sendNotice({
      channel,
      accountId: normalizeString(route.accountId),
      target,
      threadId: route.threadId,
      message,
      silent: config.silent,
    });
  };
}
