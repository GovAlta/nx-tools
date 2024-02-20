import { AnalyzeCommitsContext, GenerateNotesContext } from 'semantic-release';
import { analyzeCommits as baseAnalyzeCommits } from '@semantic-release/commit-analyzer';
import { generateNotes as baseGenerateNotes } from '@semantic-release/release-notes-generator';
import { wrapPlugin } from './wrap-plugin';

const analyzeCommits = wrapPlugin<AnalyzeCommitsContext>(baseAnalyzeCommits);
const generateNotes = wrapPlugin<GenerateNotesContext>(baseGenerateNotes);

export { analyzeCommits, generateNotes };
