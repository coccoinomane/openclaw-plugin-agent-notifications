function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

// Session entries from OpenClaw 2026.9 nest routing under `delivery`
// (`route`, `context`, `origin`); older entries keep `deliveryContext`,
// `origin`, `route` and `last*` at the top level. Hook-provided requester
// data always wins.
export function resolveRouteFromEntry(requester, entry) {
  const direct = asObject(requester);
  const session = asObject(entry);
  const delivery = asObject(session.delivery);
  const contexts = [asObject(delivery.context), asObject(session.deliveryContext)];
  const origins = [asObject(delivery.origin), asObject(session.origin)];
  const routes = [asObject(delivery.route), asObject(session.route)];

  const first = (...values) => values.map(normalizeString).find(Boolean) || "";
  const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");

  return {
    channel: first(
      direct.channel,
      ...contexts.map((context) => context.channel),
      ...routes.map((route) => route.channel),
      session.lastChannel,
      ...origins.map((origin) => origin.provider),
      ...origins.map((origin) => origin.surface),
    ),
    accountId: first(
      direct.accountId,
      ...contexts.map((context) => context.accountId),
      ...origins.map((origin) => origin.accountId),
      ...routes.map((route) => route.accountId),
      session.lastAccountId,
    ),
    to: first(
      direct.to,
      ...contexts.map((context) => context.to),
      ...origins.map((origin) => origin.to),
      ...routes.map((route) => asObject(route.target).to),
      session.lastTo,
    ),
    threadId: firstDefined(
      direct.threadId,
      ...contexts.map((context) => context.threadId),
      ...origins.map((origin) => origin.threadId),
      ...routes.map((route) => asObject(route.thread).id),
      session.lastThreadId,
    ),
  };
}
