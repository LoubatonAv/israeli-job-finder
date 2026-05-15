import { findJobs } from './findJobs.js';

const result = await findJobs({ useMock: true });
console.log(`Mock jobs loaded. New: ${result.newJobs}, total: ${result.totalJobs}`);
