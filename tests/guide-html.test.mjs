import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {renderGuideHtml} from '../scripts/render-guide-html.mjs';
import {PRODUCT_VERSION} from '../src/profile.mjs';

test('the packaged HTML guide is self-contained and every contents link resolves',()=>{
  const html=renderGuideHtml(fileURLToPath(new URL('../docs/oktonik-public.md',import.meta.url)),PRODUCT_VERSION);
  assert.match(html,new RegExp(`OKTONIK ${PRODUCT_VERSION.replace(/\./g,'\\.')}`));
  const ids=new Set([...html.matchAll(/ id="([^"]+)"/g)].map(m=>m[1]));
  const anchors=[...html.matchAll(/href="#([^"]+)"/g)].map(m=>m[1]);
  assert.ok(anchors.length>=15);for(const a of anchors)assert.ok(ids.has(a),a);
  assert.ok(!/<img[^>]+src="(?!data:)/.test(html),'images are inlined');
  assert.ok(!/\]\(|\*\*/.test(html.replace(/<code>.*?<\/code>/g,'')),'no raw Markdown left');
});
