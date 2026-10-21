// Preloaded (node --import) into every eval and audit run: any network attempt is reported and fails the case.
import dns from 'node:dns';
import net from 'node:net';

const block = (what) => () => {
  process.stderr.write(`NETWORK BLOCKED: ${what}\n`);
  throw new Error(`reasontrail evals: network is not allowed (${what})`);
};
net.Socket.prototype.connect = block('socket connect');
dns.lookup = block('dns lookup');
dns.promises.lookup = block('dns lookup');
globalThis.fetch = block('fetch');
