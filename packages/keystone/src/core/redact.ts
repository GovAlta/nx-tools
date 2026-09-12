// project-docs-ancestors: cli-designs:keystone-init

// Credentials in URL userinfo: https://user:token@host/… and https://token@host/…
// The scheme class is bounded too: unbounded `*` before a literal is the same shape as the header
// patterns above, and this input is no more trusted than theirs.
const URL_USERINFO = /([a-zA-Z][a-zA-Z0-9+.-]{0,31}:\/\/)([^/@\s]{1,512})@/g;
// Header-shaped values, which is how a CI runner supplies git credentials
// (http.extraheader: Authorization: Basic <base64>).
//
// TO END OF LINE, not one token. Matching `\S+` took only the scheme word — `Basic`, `Bearer` —
// and left the credential after it in place, which is the opposite of the point. The value may be
// `Basic <base64>`, `Bearer <token>` or a bare token, so the whole remainder goes.
// BOUNDED whitespace, not `\s*`. CodeQL flagged the unbounded form as a polynomial regular
// expression on uncontrolled data — this runs over git's own error output, which an attacker can
// influence, and two unbounded quantifiers around a literal backtrack quadratically. A header's
// padding is a few characters in any real input, so a cap costs nothing and removes the class.
const AUTH_HEADER =
  /((?:authorization|proxy-authorization)[ \t]{0,16}:[ \t]{0,16}).*/gi;
// A bare extraheader assignment, whose value is a header line and so has the same shape.
const EXTRAHEADER = /(extraheader[ \t]{0,16}=[ \t]{0,16}).*/gi;

export const REDACTED = '<redacted>';

/**
 * Remove credentials from text before it is relayed.
 *
 * This exists because of a claim that was wrong. An earlier version of the design argued that
 * nothing in this command's output could carry a credential, since the command reads none. But the
 * secret does not have to be in this process: the standard ways a credential reaches git put it
 * where git's OWN diagnostics echo it — a remote carrying userinfo, or an `http.extraheader`
 * Authorization value, which is exactly how a CI runner wires GitHub access. So any failure
 * relayed from git can carry a secret this command never held.
 *
 * A pure function over the text, which is what makes it the one part of
 * requirements:never-persist-or-emit-the-source-credential a test can pin exactly.
 */
export function redact(text: string): string {
  return text
    .replace(URL_USERINFO, (_m, scheme) => `${scheme}${REDACTED}@`)
    .replace(AUTH_HEADER, (_m, label) => `${label}${REDACTED}`)
    .replace(EXTRAHEADER, (_m, label) => `${label}${REDACTED}`);
}
