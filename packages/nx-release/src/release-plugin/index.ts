import { 
  analyzeCommits as baseAnalyzeCommits 
} from '@semantic-release/commit-analyzer';
import { 
  generateNotes as baseGenerateNotes 
} from '@semantic-release/release-notes-generator';
import { wrapPlugin } from './wrap-plugin';

const analyzeCommits = wrapPlugin(baseAnalyzeCommits);
const generateNotes = wrapPlugin(baseGenerateNotes);

export { 
  analyzeCommits,
  generateNotes 
}
