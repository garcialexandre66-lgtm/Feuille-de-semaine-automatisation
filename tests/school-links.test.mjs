import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../static/school-links.js',import.meta.url),'utf8');
const context=vm.createContext({URLSearchParams,Date,Set});vm.runInContext(source.slice(0,source.indexOf('let pendingSchoolDates')),context);
const parse=hash=>vm.runInContext('datesFromSchoolLink('+JSON.stringify(hash)+')',context);
test('school links decode only dates, sort and deduplicate without reading query parameters',()=>{
 assert.equal(parse('#other=value'),null);assert.equal(parse('#ecole=20280229,20280228,20280229').join(','),'2028-02-28,2028-02-29');
});
test('invalid or oversized calendars are rejected before changing any state',()=>{
 for(const hash of ['#ecole=','#ecole=20260229','#ecole=20281301','#ecole=20280431','#ecole=bad','#ecole='+Array(401).fill('20280229').join(','),'#ecole='+'0'.repeat(12001)])assert.throws(()=>parse(hash));
});
