// Only the server child can use this bridge. Downloads share the desktop
// session's system proxy and certificate handling instead of Node's HTTP stack.
function allowedImageUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.port || url.username || url.password || url.search || url.hash) return false;
    if (url.hostname === "images.ygoprodeck.com") return /^\/images\/cards(?:_small|_cropped)?\/\d+\.jpg$/.test(url.pathname);
    return url.hostname === "cdn.233.momobako.com"
      && /^\/ygoimg\/(?:sc|jp)\/(?:metadata|\d+\.webp(?:!half)?)$/.test(url.pathname);
  } catch { return false; }
}

function attachCardImageNetwork(child, fetchImage) {
  const pending = new Map();
  const send = message => {
    if (child.connected) child.send(message, () => {});
  };
  async function onMessage(message) {
    if (message?.type === "card-image-cancel") {
      pending.get(message.id)?.abort();
      return;
    }
    if (message?.type !== "card-image-fetch" || typeof message.id !== "string" || pending.has(message.id)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    pending.set(message.id, controller);
    try {
      if (!allowedImageUrl(message.url)) throw new Error("Unsupported card image source");
      const response = await fetchImage(message.url, { signal: controller.signal, credentials: "omit" });
      const chunks = [];
      let length = 0;
      if (response.body) {
        for await (const chunk of response.body) {
          length += chunk.length;
          if (length > 4 * 1024 * 1024) {
            controller.abort();
            throw new Error("Card image response exceeds 4 MiB");
          }
          chunks.push(Buffer.from(chunk));
        }
      }
      send({ type: "card-image-result", id: message.id, status: response.status,
        contentType: response.headers.get("content-type"), bytes: Buffer.concat(chunks) });
    } catch (error) {
      send({ type: "card-image-result", id: message.id, error: `${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}` });
    } finally {
      clearTimeout(timer);
      pending.delete(message.id);
    }
  }
  function dispose() {
    child.off("message", onMessage);
    for (const controller of pending.values()) controller.abort();
    pending.clear();
    child.off("disconnect", dispose);
    child.off("exit", dispose);
  }
  child.on("message", onMessage);
  child.once("disconnect", dispose);
  child.once("exit", dispose);
  return dispose;
}

module.exports = { allowedImageUrl, attachCardImageNetwork };
