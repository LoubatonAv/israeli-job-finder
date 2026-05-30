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
