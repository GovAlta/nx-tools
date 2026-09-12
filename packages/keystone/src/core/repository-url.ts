// project-docs-ancestors: cli-designs:keystone-init

/**
 * The `owner/name` a git URL designates, in any of the forms git accepts, or null if it names none.
 *
 * Needed because `url.<base>.insteadOf` rewrites URLs globally and cannot be unset for a single
 * invocation — `-c url.X.insteadOf=` does not clear a rewrite, it sets the match prefix to the
 * empty string, which matches every URL. (Measured: that "neutralisation" redirected every fetch
 * to github.com.) So the rewrite cannot be prevented; what it resolves to can be checked.
 *
 * Transport is deliberately not part of the answer. A rewrite that sends the canonical HTTPS URL
 * to `git@<alias>:GovAlta-EMU/keystone.git` reaches the SAME repository, and that is how a
 * maintainer's machine authenticates — refusing it would make the fetch route unusable for exactly
 * the people who configured it. A rewrite naming a DIFFERENT repository is the actual hazard.
 */
/**
 * How many trailing characters of `text` are `ch`.
 *
 * A loop rather than a `/<ch>+$/` regex. CodeQL flagged the regex form as a polynomial
 * regular expression on uncontrolled data, and it is right: this input is a URL produced by the
 * machine's own git rewriting, so a long run of trailing slashes is attacker-influenceable and the
 * backtracking is quadratic. A scan from the end is linear and cannot backtrack at all.
 */
function trimTrailing(text: string, ch: string): string {
  let end = text.length;
  while (end > 0 && text[end - 1] === ch) {
    end -= 1;
  }
  return text.slice(0, end);
}

export function designatedRepository(url: string): string | null {
  // Slashes first, THEN the .git suffix: on `…/keystone.git/` the suffix does not match while a
  // trailing slash is still there, and the repository would read as `keystone.git`.
  let trimmed = trimTrailing(url.trim(), '/');
  if (trimmed.endsWith('.git')) {
    trimmed = trimmed.slice(0, -'.git'.length);
  }

  const path = pathOf(trimmed);
  if (!path) {
    return null;
  }
  const segments = path.split('/').filter(Boolean);
  return segments.length >= 2 ? segments.slice(-2).join('/') : null;
}

/**
 * The path portion of a git URL, in any of the forms git accepts.
 *
 * Hand-rolled regexes were the wrong tool twice over. They were the reason CodeQL reported two
 * polynomial-regex findings on this file — the optional-userinfo group followed by an unbounded
 * host class is exactly the ambiguity that backtracks — and Node already ships a URL parser, so
 * this was reinventing something proven while getting it wrong. The scp-like form is not a URL and
 * is genuinely the caller's to parse, so that half is string indexing with no quantifiers at all.
 */
function pathOf(url: string): string | null {
  const schemeEnd = url.indexOf('://');
  if (schemeEnd > 0) {
    try {
      // Parsed rather than matched: userinfo, port and host are the parser's problem, and it is a
      // linear-time one.
      return new URL(url).pathname;
    } catch {
      return null;
    }
  }

  // scp-like: [user@]host:path, with no scheme. The path begins after the FIRST colon that follows
  // an `@`, and a colon before any `@` is a port on a form we do not accept.
  const at = url.indexOf('@');
  if (at <= 0) {
    return null;
  }
  const colon = url.indexOf(':', at + 1);
  if (colon === -1 || colon === url.length - 1) {
    return null;
  }
  // A host cannot contain a slash, so anything with one before the colon is not this form.
  const host = url.slice(at + 1, colon);
  return host.length > 0 && !host.includes('/') ? url.slice(colon + 1) : null;
}

/** Whether an effective URL still designates the repository that was asked for. */
export function designates(url: string, repository: string): boolean {
  const designated = designatedRepository(url);
  return (
    designated !== null && designated.toLowerCase() === repository.toLowerCase()
  );
}
