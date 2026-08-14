const DEFAULT_ENDPOINT = "http://127.0.0.1:8384";

export interface LamaClientOptions {
  endpoint?: string;
  signal?: AbortSignal;
}

export function getLamaEndpoint(explicit?: string): string {
  const configured = explicit || process.env.NEXT_PUBLIC_MARKSCAN_AI_URL || DEFAULT_ENDPOINT;
  return configured.replace(/\/+$/, "");
}

export async function requestLamaInpaint(
  image: File,
  mask: Blob,
  options: LamaClientOptions = {},
): Promise<Blob> {
  const form = new FormData();
  form.append("image", image, image.name);
  form.append("mask", mask, "gemini-mask.png");

  const response = await fetch(`${getLamaEndpoint(options.endpoint)}/v1/inpaint`, {
    method: "POST",
    body: form,
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`LaMa service returned ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    throw new Error("LaMa service returned a non-image response.");
  }
  return response.blob();
}

export async function checkLamaHealth(endpoint?: string): Promise<boolean> {
  try {
    const response = await fetch(`${getLamaEndpoint(endpoint)}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(1500),
    });
    return response.ok;
  } catch {
    return false;
  }
}
