// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";
import { readdirSync, readFileSync } from "fs";
import { join, relative } from "path";

const yargsFactory = jest.fn(() => {
  throw new Error("yargs must not be invoked when importing the tools entrypoint");
});
const hideBinFactory = jest.fn(() => {
  throw new Error("yargs/helpers must not be invoked when importing the tools entrypoint");
});

jest.mock("yargs", () => ({ __esModule: true, default: yargsFactory }));
jest.mock("yargs/helpers", () => ({ hideBin: hideBinFactory }));

import { configureAllTools, Domain } from "../../src/tools";

function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(fullPath);
    return entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

describe("tools entrypoint", () => {
  it("exports configureAllTools and Domain without running the CLI", () => {
    const exitSpy = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    expect(typeof configureAllTools).toBe("function");
    expect(Domain.SEARCH).toBeDefined();
    expect(yargsFactory).not.toHaveBeenCalled();
    expect(hideBinFactory).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it("has no module under src/ (other than index.ts) importing index.js", () => {
    const srcDir = join(__dirname, "../../src");
    const indexPath = join(srcDir, "index.ts");
    const offenders = listTsFiles(srcDir)
      .filter((file) => file !== indexPath)
      .filter((file) => /from\s+["'](\.\/|\.\.\/)+index(\.js)?["']|import\s*\(\s*["'](\.\/|\.\.\/)+index(\.js)?["']\s*\)/.test(readFileSync(file, "utf8")))
      .map((file) => relative(srcDir, file));

    expect(offenders).toEqual([]);
  });

  it("registers tools for enabled domains", () => {
    const server = new McpServer({ name: "test", version: "0" });
    const toolSpy = jest.spyOn(server, "registerTool");
    const legacySpy = jest.spyOn(server, "tool");

    expect(() =>
      configureAllTools(
        server,
        async () => "token",
        async () => ({}) as WebApi,
        () => "test-agent",
        new Set([Domain.SEARCH, Domain.REPOSITORIES]),
        "test-org"
      )
    ).not.toThrow();

    expect(toolSpy.mock.calls.length + legacySpy.mock.calls.length).toBeGreaterThan(0);
  });
});
