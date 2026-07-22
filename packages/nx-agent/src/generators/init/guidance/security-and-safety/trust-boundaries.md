**Trust boundaries.** Validate input where it actually crosses from untrusted to trusted — user
input, an external API response, a webhook payload. Don't re-validate the same data at every
internal layer once it's already inside a boundary you trust; that's clutter, not safety.
