import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const preset = args.length === 2 && args[0] === '--preset' ? args[1] : undefined;
if (!preset || !['small', 'demo', 'stress'].includes(preset)) throw new Error('Usage: npm run build:scenario -- --preset small|demo|stress');
const backend = process.cwd();
const root = resolve(backend, '..');
const fixture = preset === 'small' ? join(backend, 'src/default-scenario.json') : join(root, `data/scenarios/generated/${preset}.json`);
execFileSync(process.env.PYTHON ?? 'python3', [join(root, 'data/scenarios/validate.py'), fixture], { stdio: 'inherit' });
const raw = readFileSync(fixture);
const data = JSON.parse(raw.toString());
if (preset !== 'small' && (data.schema_version !== 3 || data.generation?.preset !== preset)) throw new Error('Regenerate this preset with the current v3 generator');
const output = join(backend, '.test-output', preset);
// Stage just this fixture; the tracked Small fixture and normal build stay intact.
const stage = join(output, 'project');
const modulePath = join(stage, 'backend');
mkdirSync(modulePath, { recursive: true });
cpSync(join(backend, 'src'), join(modulePath, 'src'), { recursive: true, filter: path => !path.endsWith('.test.ts') });
for (const name of ['package.json', 'tsconfig.json']) copyFileSync(join(backend, name), join(modulePath, name));
if (!existsSync(join(modulePath, 'node_modules'))) symlinkSync(join(backend, 'node_modules'), join(modulePath, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
mkdirSync(join(stage, 'data/scenarios'), { recursive: true });
copyFileSync(fixture, join(stage, 'data/scenarios/nationwide-v1.json'));
execFileSync('spacetime', ['build', '--module-path', modulePath], { stdio: 'inherit' });
copyFileSync(join(modulePath, 'dist/bundle.js'), join(output, 'bundle.js'));
const levels = new Map(data.zones.map((z: { id: string; level: string }) => [z.id, z.level]));
const manifest = {
  preset, scenarioId: data.scenario_id, schemaVersion: data.schema_version, generation: data.generation ?? null,
  fixtureSha256: createHash('sha256').update(raw).digest('hex'),
  bundleSha256: createHash('sha256').update(readFileSync(join(output, 'bundle.js'))).digest('hex'),
  expected: { disasters: data.disasters.length, zones: data.zones.length, households: data.households.length,
    neighborhood: data.households.filter((h: { zone_id: string }) => levels.get(h.zone_id) === 'neighborhood').length,
    regional: data.households.filter((h: { zone_id: string }) => levels.get(h.zone_id) === 'region').length,
    teams: data.response_teams.length, requests: data.help_requests.length, impactLayers: data.impact_layers?.length ?? 0,
    tasks: data.households.filter((h: { last_contact_at: string | null }) => h.last_contact_at === null).length, assignments: 0 },
};
writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Built ${preset}: ${output}/bundle.js (${manifest.expected.households} households). Publish only to a separate local test database.`);
