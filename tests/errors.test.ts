import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeError } from "../src/errors.js";

describe("describeError", () => {
  it("prints the message and follows the cause chain", () => {
    const tls = Object.assign(new Error("self signed certificate"), { code: "SELF_SIGNED_CERT_IN_CHAIN" });
    const err = new Error("Connection error.", { cause: tls });
    expect(describeError(err)).toBe(
      "Error: Connection error.\n  caused by: self signed certificate (SELF_SIGNED_CERT_IN_CHAIN)",
    );
  });

  it("falls back to the name and code when a message is empty", () => {
    const refused = Object.assign(new AggregateError([], ""), { code: "ECONNREFUSED" });
    const err = new TypeError("fetch failed", { cause: refused });
    expect(describeError(err)).toBe("Error: fetch failed\n  caused by: AggregateError (ECONNREFUSED)");
  });

  it("lists the fields of a validation error", () => {
    const err = z.object({ maxConcurrency: z.number() }).safeParse({ maxConcurrency: Number.NaN }).error;
    const text = describeError(err);
    expect(text).toContain("maxConcurrency");
    expect(text).not.toContain('"code"');
  });

  it("prints a thrown value that is not an error", () => {
    expect(describeError("boom")).toBe("Error: boom");
  });

  it("strips control characters so a message cannot drive the terminal or CI", () => {
    const err = new Error("bad \u001b]0;PWNED\u0007 value\r\n::error title=x::y\u2028z");
    expect(describeError(err)).toBe("Error: bad ]0;PWNED value\n::error title=x::yz");
  });

  it("includes the stack when debugging", () => {
    const text = describeError(new Error("boom"), true);
    expect(text).toContain("boom");
    expect(text).toMatch(/^\s+at /m);
  });

  it("stops on a cause loop", () => {
    const err = new Error("a");
    (err as Error & { cause: unknown }).cause = err;
    expect(describeError(err)).toBe("Error: a");
  });
});
