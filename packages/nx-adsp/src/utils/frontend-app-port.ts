// Frontend app generators (vue-app, react-app, angular-app) have no --port option to source
// a real value from yet, so every consumer that needs to tag a paired frontend by convention
// (the `adsp:paired-frontend:` tag tooling reads to discover the pairing) has to agree on the
// same default. One exported constant, not a literal repeated at each call site — update this
// alongside the vue-app/react-app dev server default if frontends ever gain a real --port option
// to read instead.
export const DEFAULT_FRONTEND_APP_PORT = 4200
