import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const usage = 'Usage: npm --prefix backend run seed -- --database NAME [--server http://127.0.0.1:3100]\nUse run reseed to replace operational data while preserving memberships and activity history.';

try {
  const { values } = parseArgs({ options: {
    database: { type: 'string' },
    server: { type: 'string', default: 'http://127.0.0.1:3100' },
    reset: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  } });
  if (values.help) {
    console.log(usage);
  } else {
    if (!values.database || !/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(values.database)) {
      throw new Error('Provide an explicit database name with --database NAME.');
    }
    const server = new URL(values.server);
    if (!['http:', 'https:'].includes(server.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(server.hostname) || server.username || server.password || server.pathname !== '/' || server.search || server.hash) {
      throw new Error('--server must be a local HTTP(S) origin, such as http://127.0.0.1:3100.');
    }
    const args = ['call', values.database, values.reset ? 'reset_demo' : 'seed_demo'];
    if (values.reset) args.push(JSON.stringify('RESET SYNTHETIC DEMO'));
    args.push('--server', server.origin);
    console.log(`${values.reset ? 'Reseeding' : 'Seeding'} ${values.database} on ${server.origin}`);
    const result = spawnSync('spacetime', args, { stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  }
} catch (error) {
  console.error(error.message);
  console.error(usage);
  process.exitCode = 1;
}
