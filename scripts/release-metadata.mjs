import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {PRODUCT_VERSION} from '../src/profile.mjs';

export function releaseMetadata(catalog,version,tag) {
  assert.equal(tag,`v${version}`,'Tag must match Public version');
  for(const field of ['id','name','description','author','component_type','github_repo','default_branch','asset_name','min_host_version'])assert.ok(typeof catalog[field]==='string'&&catalog[field]);
  assert.equal(catalog.id,'oktonik');assert.equal(catalog.component_type,'tool');
  assert.equal(catalog.subcategory,'performance');
  assert.ok(catalog.tags.every(t=>['chord','bass','polyphonic'].includes(t)));
  assert.equal(catalog.asset_name,'oktonik-module.tar.gz');
  assert.match(catalog.github_repo,/^[\w.-]+\/[\w.-]+$/);
  return {version,download_url:`https://github.com/${catalog.github_repo}/releases/download/${tag}/${catalog.asset_name}`,name:catalog.name,description:catalog.description};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  const root=fileURLToPath(new URL('../',import.meta.url));
  const catalog=JSON.parse(readFileSync(root+'catalog-entry.json','utf8'));
  const metadata=releaseMetadata(catalog,PRODUCT_VERSION,process.argv[2]||`v${PRODUCT_VERSION}`);
  const bytes=readFileSync(root+'dist/'+catalog.asset_name);
  writeFileSync(root+'dist/release-next.json',JSON.stringify(metadata,null,2)+'\n');
  writeFileSync(root+'dist/SHA256SUMS',createHash('sha256').update(bytes).digest('hex')+'  '+catalog.asset_name+'\n');
  console.log('Prepared release-next.json; live release.json was NOT changed.');
}
