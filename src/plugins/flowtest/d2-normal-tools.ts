/** Reviewed JS sources + authored data embedded by Vite. No runtime experiments-directory dependency. */
import donor from '../../../experiments/step5/4/d1/f100-v1.json';
import proposal from '../../../experiments/step5/4/d2-p4-preparation/workload-proposal.json';
import driverSource from '../../../experiments/step5/4/d2-p4-runtime/normal-driver.cjs?raw';
import workloadSource from '../../../experiments/step5/4/d2-p4-runtime/workload-plan.cjs?raw';
import navigationSource from '../../../experiments/step5/4/d2-p4-native-prep/navigation.cjs?raw';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const normalDonorInput = () => clone(donor);
export const normalPresentation = () => clone(proposal.presentation);
export function createReviewedNormalTools(nodeRequire: any): any {
  const crypto = nodeRequire('node:crypto'), path = nodeRequire('node:path'), vm = nodeRequire('node:vm');
  const hash = (v: any) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
  if (hash(donor) !== '93507d4bca39de181c462158240b87691fea1b09588d10494ad9c6692425ec4e'
    || hash(proposal.presentation) !== '62e2bc156a0e59f39f67a64e94344af72ef44fdd0d806243bd30a22731e5f5ee') throw Error('normal input identity mismatch');
  const root = '/bundled-normal-d2', cache: Record<string, any> = {};
  // This is an authored-data reader, never an OS filesystem shim or an alternate source of business results.
  const data = new Map([
    [root + '/experiments/step5/4/d1/f100-v1.json', JSON.stringify(donor)],
    [root + '/experiments/step5/4/d2-p4-preparation/workload-proposal.json', JSON.stringify(proposal)],
  ]);
  const files: Record<string, { source: string; directory: string }> = {
    workload: { source: workloadSource, directory: root + '/experiments/step5/4/d2-p4-runtime' },
    driver: { source: driverSource, directory: root + '/experiments/step5/4/d2-p4-runtime' },
    navigation: { source: navigationSource, directory: root + '/experiments/step5/4/d2-p4-native-prep' },
  };
  function load(name: string): any {
    if (cache[name]) return cache[name];
    const item = files[name]; if (!item) throw Error('unknown bundled normal module');
    const module = { exports: {} };
    const require = (id: string) => {
      if (id === 'node:crypto') return crypto;
      if (id === 'node:path') return path;
      if (id === 'node:fs') return Object.freeze({ readFileSync(file: string, encoding: string) {
        if (encoding !== 'utf8' || !data.has(file)) throw Error('unbundled normal input path'); return data.get(file);
      } });
      if (id === '../d2-p4-runtime/workload-plan.cjs') return load('workload');
      throw Error('unsupported bundled normal dependency: ' + id);
    };
    const factory = vm.runInThisContext('(function(require,module,exports,__dirname){\n' + item.source + '\n})', { filename: 'bundled-normal/' + name + '.cjs' });
    factory(require, module, module.exports, item.directory); cache[name] = module.exports; return module.exports;
  }
  return Object.freeze({ ...load('driver'), ...load('navigation'), hash, donorHash: hash(donor), presentationHash: hash(proposal.presentation) });
}
