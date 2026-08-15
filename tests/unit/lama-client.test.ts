import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkLamaHealth,
  getLamaEndpoint,
  parseRetryAfter,
  requestLamaInpaint,
} from "@/lib/inpainter/lama-client";

describe("lama-client module", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("parseRetryAfter", () => {
    it("parses numeric seconds into milliseconds", () => {
      expect(parseRetryAfter("3", 10000)).toBe(3000);
      expect(parseRetryAfter("0", 10000)).toBe(0);
      expect(parseRetryAfter("1.5", 10000)).toBe(1500);
    });

    it("caps numeric seconds to maxBackoffMs", () => {
      expect(parseRetryAfter("15", 5000)).toBe(5000);
    });

    it("parses HTTP date strings relative to current time", () => {
      const now = Math.floor(Date.now() / 1000) * 1000;
      vi.spyOn(Date, "now").mockReturnValue(now);
      const futureDate = new Date(now + 4000).toUTCString();
      expect(parseRetryAfter(futureDate, 10000)).toBe(4000);
    });

    it("returns null for missing or invalid header values", () => {
      expect(parseRetryAfter(null, 5000)).toBeNull();
      expect(parseRetryAfter("", 5000)).toBeNull();
      expect(parseRetryAfter("invalid-header", 5000)).toBeNull();
    });
  });

  describe("getLamaEndpoint", () => {
    it("trims trailing slashes", () => {
      expect(getLamaEndpoint("http://localhost:8384///")).toBe("http://localhost:8384");
    });
  });

  describe("checkLamaHealth", () => {
    it("returns true when endpoint responds 200 OK", async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });

      const healthy = await checkLamaHealth("http://127.0.0.1:8384");
      expect(healthy).toBe(true);
    });

    it("returns false when endpoint fails or errors", async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Network down"));

      const healthy = await checkLamaHealth("http://127.0.0.1:8384");
      expect(healthy).toBe(false);
    });
  });

  describe("requestLamaInpaint", () => {
    const dummyImage = new File([new Uint8Array([1, 2, 3])], "test.png", { type: "image/png" });
    const dummyMask = new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" });
    const expectedOutput = new Blob([new Uint8Array([7, 8, 9])], { type: "image/png" });

    it("succeeds on first attempt when service returns 200 OK with image content", async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ "content-type": "image/png" }),
        blob: async () => expectedOutput,
      });

      const result = await requestLamaInpaint(dummyImage, dummyMask, {
        endpoint: "http://127.0.0.1:8384",
      });

      expect(result).toBe(expectedOutput);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("retries on transient 429 and succeeds on subsequent attempt using Retry-After", async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "0.05" }),
          text: async () => "Rate limit exceeded",
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "image/png" }),
          blob: async () => expectedOutput,
        });

      const result = await requestLamaInpaint(dummyImage, dummyMask, {
        endpoint: "http://127.0.0.1:8384",
        initialBackoffMs: 10,
        maxRetries: 2,
      });

      expect(result).toBe(expectedOutput);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("retries on transient 503 error with exponential backoff", async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          headers: new Headers(),
          text: async () => "Service Unavailable",
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "image/png" }),
          blob: async () => expectedOutput,
        });

      const result = await requestLamaInpaint(dummyImage, dummyMask, {
        endpoint: "http://127.0.0.1:8384",
        initialBackoffMs: 10,
        maxRetries: 2,
      });

      expect(result).toBe(expectedOutput);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("retries on transient 502 and 504 errors", async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          ok: false,
          status: 502,
          headers: new Headers(),
          text: async () => "Bad Gateway",
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 504,
          headers: new Headers(),
          text: async () => "Gateway Timeout",
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ "content-type": "image/png" }),
          blob: async () => expectedOutput,
        });

      const result = await requestLamaInpaint(dummyImage, dummyMask, {
        endpoint: "http://127.0.0.1:8384",
        initialBackoffMs: 5,
        maxRetries: 3,
      });

      expect(result).toBe(expectedOutput);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it("never retries permanent 4xx validation errors (413, 422, 400)", async () => {
      (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 422,
        headers: new Headers(),
        text: async () => "Mask does not contain any selected pixels",
      });

      await expect(
        requestLamaInpaint(dummyImage, dummyMask, {
          endpoint: "http://127.0.0.1:8384",
          maxRetries: 3,
        }),
      ).rejects.toThrow("LaMa service returned 422: Mask does not contain any selected pixels");

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("immediately throws and halts retries when AbortSignal is triggered", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        requestLamaInpaint(dummyImage, dummyMask, {
          endpoint: "http://127.0.0.1:8384",
          signal: controller.signal,
          maxRetries: 3,
        }),
      ).rejects.toThrow();

      expect(fetch).toHaveBeenCalledTimes(0);
    });

    it("halts retries if signal is aborted during backoff delay", async () => {
      const controller = new AbortController();

      (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
        setTimeout(() => controller.abort(), 10);
        return {
          ok: false,
          status: 429,
          headers: new Headers({ "retry-after": "5" }),
          text: async () => "Rate limit exceeded",
        };
      });

      await expect(
        requestLamaInpaint(dummyImage, dummyMask, {
          endpoint: "http://127.0.0.1:8384",
          signal: controller.signal,
          maxBackoffMs: 5000,
          maxRetries: 3,
        }),
      ).rejects.toThrow();

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("processes a 5-image sequential batch reliably even under transient service throttling", async () => {
      let callCount = 0;
      // Simulate a server where every even request gets a transient 429 before succeeding
      (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
        callCount++;
        if (callCount % 2 === 1 && callCount <= 6) {
          return {
            ok: false,
            status: 429,
            headers: new Headers({ "retry-after": "0.01" }),
            text: async () => "Rate limit exceeded",
          };
        }
        return {
          ok: true,
          headers: new Headers({ "content-type": "image/png" }),
          blob: async () => expectedOutput,
        };
      });

      const results: Blob[] = [];
      for (let i = 0; i < 5; i++) {
        const file = new File([new Uint8Array([i])], `image-${i}.png`, { type: "image/png" });
        const blob = await requestLamaInpaint(file, dummyMask, {
          endpoint: "http://127.0.0.1:8384",
          initialBackoffMs: 5,
          maxRetries: 3,
        });
        results.push(blob);
      }

      expect(results).toHaveLength(5);
      results.forEach((blob) => expect(blob).toBe(expectedOutput));
    });
  });
});
