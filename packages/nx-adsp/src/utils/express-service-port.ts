// express-service has no --port option to source a real value from yet, so every consumer that
// needs to reach a paired backend by convention (a frontend's nginx/dev-server proxy, the
// `adsp:proxy-service:` tag the sandbox executor reads) has to agree on the same default. One
// exported constant, not a literal repeated at each call site — update this alongside
// environment.ts.__tmpl__'s own `PORT: num({ default: ... })` if express-service ever gains a
// real --port option to read instead.
export const DEFAULT_EXPRESS_SERVICE_PORT = 3333;
