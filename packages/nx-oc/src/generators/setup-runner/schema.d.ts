export interface Schema {
  infra: string;
  // PAT (repo scope) used to register the runner with GitHub. Passed
  // programmatically by the pipeline generator (prompted once, shared with
  // setup-secrets); when omitted, a standalone run prompts for it. Deliberately
  // not a CLI flag — never pass a secret on the command line — so it's absent
  // from schema.json.
  pat?: string;
}
