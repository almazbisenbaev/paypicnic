import { z } from "zod";
import { AppError } from "./errors";

export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError("Expected JSON.", 415);
  const origin = request.headers.get("origin");
  // Next may normalize request.url to localhost while the browser uses 127.0.0.1.
  // Compare the browser origin to the incoming Host header (preserved by proxies).
  const host = request.headers.get("host") || new URL(request.url).host;
  if (origin && new URL(origin).host !== host)
    throw new AppError("Cross-origin requests are not supported.", 403);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Request body is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new AppError("Request is too large.", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new AppError("Invalid JSON.");
  }
}

export const tokenBody = z.object({ token: z.string().max(4096) });
export const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export function apiError(error: unknown): Response {
  if (error instanceof z.ZodError)
    return json(
      { error: error.issues[0]?.message ?? "Check the payment details." },
      400,
    );
  if (error instanceof AppError)
    return json({ error: error.message }, error.status);
  // Do not echo provider URLs, credentials, internal stack traces or RPC bodies.
  return json(
    {
      error:
        "Solana devnet is unavailable or busy. Wait a moment and check again. No payment has been marked successful.",
    },
    503,
  );
}
