import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { persistGmailImport } from "./src/gmailImportPersistence.js";

const tempDir = await fs.mkdtemp(
  path.join(os.tmpdir(), "israel-job-finder-gmail-import-"),
);

try {
  const jobsFile = path.join(tempDir, "jobs.json");
  const stateFile = path.join(tempDir, "gmail-agent-state.json");
  const importedJobs = [{ id: "gmail-test-job", source: "Gmail" }];
  const nextState = { processedMessageIds: ["gmail-test-message"] };
  let stateWriteCalled = false;

  await persistGmailImport({
    jobsFile,
    jobs: importedJobs,
    agentState: nextState,
    writeAgentState: async (state) => {
      stateWriteCalled = true;
      const persistedJobs = JSON.parse(await fs.readFile(jobsFile, "utf8"));
      assert.deepEqual(
        persistedJobs,
        importedJobs,
        "jobs must be persisted before Gmail agent state",
      );
      await fs.writeFile(stateFile, JSON.stringify(state), "utf8");
    },
  });

  assert.equal(stateWriteCalled, true);
  assert.deepEqual(
    JSON.parse(await fs.readFile(stateFile, "utf8")),
    nextState,
  );

  stateWriteCalled = false;
  await assert.rejects(
    persistGmailImport({
      jobsFile: tempDir,
      jobs: importedJobs,
      agentState: nextState,
      writeAgentState: async () => {
        stateWriteCalled = true;
      },
    }),
  );
  assert.equal(
    stateWriteCalled,
    false,
    "Gmail messages must not be marked processed when saving jobs fails",
  );

  console.log("Gmail import persistence regression test passed.");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
