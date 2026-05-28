// Browser shim for `node:crypto` imports that the Anthropic SDK references at
// the top level (in particular randomUUID from agent-toolset code we never run).
// Maps to the platform's WebCrypto equivalent.

export const randomUUID = () => globalThis.crypto.randomUUID();
export default { randomUUID };
