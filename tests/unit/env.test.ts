import { spawn } from "node:child_process";
import path from "node:path";
import { describe, it, expect } from "vitest";

describe("env.ts", () => {
  it("throws at import when required vars are missing", async () => {
    const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");
    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(
        tsxBin,
        [
          "-e",
          "import('./src/env.ts').then(()=>process.exit(0)).catch(()=>process.exit(7))",
        ],
        {
          cwd: process.cwd(),
          env: {
            PATH: process.env.PATH ?? "",
            HOME: process.env.HOME ?? "/root",
            NODE_ENV: "test",
          },
        },
      );
      child.on("close", resolve);
    });
    expect(code).not.toBe(0);
  });
});
