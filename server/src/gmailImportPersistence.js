import { writeJson } from "./fileStore.js";

export async function persistGmailImport({
  jobsFile,
  jobs,
  agentState,
  writeAgentState,
}) {
  await writeJson(jobsFile, jobs);
  return writeAgentState(agentState);
}
