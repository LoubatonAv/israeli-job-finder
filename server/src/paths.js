import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT_DIR = path.resolve(__dirname, '../..');
export const DATA_DIR = path.join(ROOT_DIR, 'data');

export const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');
export const PROFILE_FILE = path.join(DATA_DIR, 'profile.json');
export const KEYWORDS_FILE = path.join(DATA_DIR, 'keywords.json');
export const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
export const ROLE_PROFILES_FILE = path.join(DATA_DIR, 'roleProfiles.json');
export const SCAN_AUDIT_FILE = path.join(DATA_DIR, 'scan-audit.json');
export const SCAN_PROGRESS_FILE = path.join(DATA_DIR, 'scan-progress.json');

export const SITE_SOURCES_FILE = path.join(DATA_DIR, 'siteSources.json');

export const GMAIL_TOKENS_FILE = path.join(DATA_DIR, 'gmail-tokens.json');
export const GMAIL_IMPORTS_FILE = path.join(DATA_DIR, 'gmail-imports.json');

export const GMAIL_AGENT_STATE_FILE = path.join(DATA_DIR, 'gmail-agent-state.json');
export const TRUSTED_JOB_SENDERS_FILE = path.join(DATA_DIR, 'trustedJobSenders.json');
