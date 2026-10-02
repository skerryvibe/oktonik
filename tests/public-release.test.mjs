import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseMetadata} from '../scripts/release-metadata.mjs';
import {PRODUCT_VERSION} from '../src/profile.mjs';
const json=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
test('catalog and release metadata target Public only and reject the wrong version',()=>{
  const c=json('../catalog-entry.json');
  const r=releaseMetadata(c,PRODUCT_VERSION,`v${PRODUCT_VERSION}`);
  assert.equal(r.download_url,`https://github.com/skerryvibe/oktonik/releases/download/v${PRODUCT_VERSION}/oktonik-module.tar.gz`);
  assert.throws(()=>releaseMetadata(c,PRODUCT_VERSION,'v0.1.0-lab.10'));
  assert.throws(()=>releaseMetadata({...c,id:'oktonik-lab'},PRODUCT_VERSION,`v${PRODUCT_VERSION}`));
  assert.equal(json('../package.json').version,PRODUCT_VERSION);
});
test('Public help has nonempty topics and safe ASCII lines within the conservative display budget',()=>{
  const help=json('../docs/help-public.json');
  function check(node) {
    assert.ok(node.title);
    if(node.children){assert.ok(node.children.length);node.children.forEach(check);}
    else {assert.ok(node.lines.length);for(const line of node.lines){assert.match(line,/^[\x20-\x7e]*$/);assert.ok(line.length<=20,line);}}
  }
  assert.ok(help.children);check(help);
});
