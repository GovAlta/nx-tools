export interface Schema {
  infra: string;
  // PAT for the GHCR pull secret. Passed programmatically by the pipeline
  // generator (prompted once, shared with setup-runner); when omitted, a
  // standalone run prompts for it. Deliberately not a CLI flag — never pass a
  // secret on the command line — so it's absent from schema.json.
  pat?: string;
}
