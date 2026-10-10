import { describe, expect, it } from "vitest";
import { classifyActionError, actionErrorMessage } from "@/lib/client/action-errors";
import { str } from "@/lib/strings";

describe("classifyActionError", () => {
  it("network: the request never got an answer", () => {
    expect(classifyActionError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyActionError(new TypeError("Load failed"))).toBe("network"); // Safari
    expect(classifyActionError(new TypeError("NetworkError when attempting to fetch resource."))).toBe("network");
    expect(classifyActionError(new Error("timeout"))).toBe("network");
    expect(classifyActionError(new Error("anything"), false)).toBe("network"); // offline
  });

  it("stale: the app on this device is older than the server", () => {
    const chunk = new Error("Loading chunk 123 failed.");
    chunk.name = "ChunkLoadError";
    expect(classifyActionError(chunk)).toBe("stale");
    expect(classifyActionError(new TypeError("Failed to fetch dynamically imported module: /x.js"))).toBe("stale");
    expect(classifyActionError(new Error('Server Action "abc" was not found on the server.'))).toBe("stale");
  });

  it("server: the server answered with an error (what Next throws for a 500)", () => {
    const err = Object.assign(new Error("An error occurred in the Server Components render."), { digest: "2724874361" });
    expect(classifyActionError(err)).toBe("server");
    expect(classifyActionError("weird")).toBe("server");
  });

  it("only network problems say 'couldn't reach the server'", () => {
    expect(actionErrorMessage("network")).toBe(str.workout.actionFailed);
    expect(actionErrorMessage("server")).toBe(str.errors.server);
    expect(actionErrorMessage("stale")).toBe(str.errors.staleApp);
  });
});
