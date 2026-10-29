import { afterEach, describe, expect, it } from "vitest";
import { pluginIdFromStack, registerBlobOwner, unregisterBlobOwner } from "./blobOwners";

const url = "blob:http://localhost/abc-123";

afterEach(() => unregisterBlobOwner(url));

describe("blobOwners", () => {
  it("attributes a stack that names a registered plugin blob URL", () => {
    registerBlobOwner(url, "notepad");
    expect(pluginIdFromStack(`Error: boom\n    at save (${url}:10:5)\n    at onClick (http://localhost/app.js:1:1)`)).toBe("notepad");
  });

  it("returns undefined for host-only stacks, missing stacks and unloaded plugins", () => {
    expect(pluginIdFromStack("Error: boom\n    at x (http://localhost/app.js:1:1)")).toBeUndefined();
    expect(pluginIdFromStack(undefined)).toBeUndefined();
    registerBlobOwner(url, "notepad");
    unregisterBlobOwner(url);
    expect(pluginIdFromStack(`at f (${url}:1:1)`)).toBeUndefined();
  });
});
