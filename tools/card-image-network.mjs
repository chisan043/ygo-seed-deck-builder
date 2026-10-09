import crypto from "node:crypto";

export function createCardImageFetch(channel = process, nativeFetch = globalThis.fetch) {
  if (typeof channel.send !== "function") return nativeFetch;
  const pending = new Map();
  channel.on("message", message => {
    if (message?.type !== "card-image-result") return;
    const job = pending.get(message.id);
    if (!job) return;
    if (message.error) job.finish(new Error(message.error));
    else job.finish(null, new Response(message.status === 204 || message.status === 304 ? null : message.bytes,
      { status: message.status, headers: { "content-type": message.contentType || "application/octet-stream" } }));
  });
  channel.once("disconnect", () => {
    for (const job of pending.values()) job.finish(new Error("Desktop card image network disconnected"));
  });
  return (url, { signal } = {}) => new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    if (!channel.connected) { reject(new Error("Desktop card image network disconnected")); return; }
    const id = crypto.randomUUID();
    const cancel = () => {
      if (channel.connected) channel.send({ type: "card-image-cancel", id }, () => {});
    };
    const timer = setTimeout(() => { cancel(); finish(new Error("Desktop card image download timed out")); }, 30000);
    const abort = () => { cancel(); finish(signal.reason); };
    function finish(error, response) {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      pending.delete(id);
      if (error) reject(error);
      else resolve(response);
    }
    pending.set(id, { finish });
    signal?.addEventListener("abort", abort, { once: true });
    channel.send({ type: "card-image-fetch", id, url: String(url) }, error => { if (error) finish(error); });
  });
}
