/**
 * Stands in for Node's `crypto` module inside the app bundle.
 *
 * tweetnacl probes for `require('crypto')` at load time to seed a random generator. HerdCare only
 * ever *verifies* licence signatures, and Ed25519 verification (and signing) is deterministic, so
 * no random source is needed on the phone at all — only key generation needs one, and that happens
 * on the issuing machine.
 *
 * Without this, whether `crypto` resolves is left to whatever the bundler happens to do with a
 * Node builtin, and a resolution failure would be a crash at launch rather than a caught error.
 * An empty object makes tweetnacl skip installing a generator, which is exactly what we want.
 */
module.exports = {};
