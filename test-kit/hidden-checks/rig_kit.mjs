// Hidden test rig for the toolkit job. Usage: node rig_kit.mjs <build_dir>  -> JSON array of {id, ok, detail} on the last line
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const dir = process.argv[2]; const out = [];
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const throws = fn => { try { fn(); return false; } catch { return true; } };
async function mod(name, cases) {
  let m, err;
  try { m = await import(pathToFileURL(path.join(dir, 'src', name + '.js')).href); } catch (e) { err = String(e).slice(0, 160); }
  for (const [id, fn] of cases) {
    if (!m) { out.push({ id, ok: false, detail: 'import failed: ' + err }); continue; }
    try { const r = await fn(m); const ok = r === true; out.push({ id, ok, detail: ok ? '' : String(r === false ? 'wrong result' : JSON.stringify(r)).slice(0, 200) }); }
    catch (e) { out.push({ id, ok: false, detail: 'threw ' + String(e).slice(0, 160) }); }
  }
}
const is = (got, want) => eq(got, want) || { got, want };
const all = (...xs) => { for (const x of xs) if (x !== true) return x; return true; };

await mod('csv', [
  ['CSV1', m => is(m.parseCsv('a,b,c\n1,2,3\n'), [['a', 'b', 'c'], ['1', '2', '3']])],
  ['CSV2', m => all(is(m.parseCsv('a,"b,c",d'), [['a', 'b,c', 'd']]), is(m.parseCsv('"he said ""hi""",x'), [['he said "hi"', 'x']]))],
  ['CSV3', m => is(m.parseCsv('a,"line1\nline2",c\r\nd,e,f'), [['a', 'line1\nline2', 'c'], ['d', 'e', 'f']])],
  ['CSV4', m => all(is(m.parseCsv(''), []), is(m.parseCsv('a,,c'), [['a', '', 'c']]), is(m.parseCsv('a,b,\n'), [['a', 'b', '']]))],
  ['CSV5', m => all(is(m.parseCsv(' a , b '), [[' a ', ' b ']]), is(m.parseCsv('a;b;"c;d"', { delimiter: ';' }), [['a', 'b', 'c;d']]))],
  ['CSV6', m => is(m.parseCsv('a\n\nb'), [['a'], [''], ['b']])],
  ['CSV7', m => throws(() => m.parseCsv('x,"abc')) || 'unterminated quote did not throw'],
  ['CSV8', m => is(m.toCsv([['a', 'b,c'], ['d"e', 'f\ng']]), 'a,"b,c"\n"d""e","f\ng"')],
  ['CSV9', m => all(is(m.toCsv([[1, null, true, undefined]]), '1,,true,'), is(m.toCsv([['a b', ' c']]), 'a b, c'))],
  ['CSV10', m => { const rows = [['x', 'a "q" b', 'l1\r\nl2'], ['', ',', '""'], ['plain', ' sp ', '3']]; return is(m.parseCsv(m.toCsv(rows)), rows); }],
]);
await mod('semver', [
  ['SEM1', m => { const p = m.parse('1.2.3-alpha.1+build.5'); return all(is([p.major, p.minor, p.patch], [1, 2, 3]), is(p.prerelease, ['alpha', 1]), is(p.build, ['build', '5'])); }],
  ['SEM2', m => all(throws(() => m.parse('1.2')) || '1.2 accepted', throws(() => m.parse('01.2.3')) || '01.2.3 accepted', throws(() => m.parse('1.2.3.4')) || '1.2.3.4 accepted', throws(() => m.parse('a.b.c')) || 'a.b.c accepted')],
  ['SEM3', m => is([m.compare('1.0.0', '2.0.0'), m.compare('2.1.0', '2.0.9'), m.compare('1.10.0', '1.9.0'), m.compare('1.2.3', '1.2.3')], [-1, 1, 1, 0])],
  ['SEM4', m => { const o = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0']; const s = [...o].reverse().sort(m.compare); return is(s, o); }],
  ['SEM5', m => is([m.compare('1.0.0+a', '1.0.0+b'), m.compare('1.0.0-rc.1', '1.0.0-beta.11'), m.compare('1.0.0-1', '1.0.0-a')], [0, 1, -1])],
  ['SEM6', m => is(['1.2.3', '2.0.0', '1.1.9', '1.9.9'].map(v => m.satisfies(v, '^1.2.0')), [true, false, false, true])],
  ['SEM7', m => is([m.satisfies('0.2.5', '^0.2.3'), m.satisfies('0.3.0', '^0.2.3'), m.satisfies('0.0.3', '^0.0.3'), m.satisfies('0.0.4', '^0.0.3')], [true, false, true, false])],
  ['SEM8', m => is([m.satisfies('1.2.9', '~1.2.3'), m.satisfies('1.3.0', '~1.2.3'), m.satisfies('1.2.2', '~1.2.3'), m.satisfies('1.2.9', '~1.2'), m.satisfies('1.3.0', '~1.2')], [true, false, false, true, false])],
  ['SEM9', m => is([m.satisfies('1.5.0', '>=1.2.0 <2.0.0'), m.satisfies('2.0.0', '>=1.2.0 <2.0.0'), m.satisfies('1.3.0', '<=1.3.0'), m.satisfies('1.3.1', '<=1.3.0'), m.satisfies('1.2.3', '>1.2.3')], [true, false, true, false, false])],
  ['SEM10', m => is([m.satisfies('2.1.0', '1.x || >=2.1.0'), m.satisfies('2.0.5', '1.x || >=2.1.0'), m.satisfies('1.7.0', '1.x || >=2.1.0')], [true, false, true])],
  ['SEM11', m => is([m.satisfies('3.4.5', '*'), m.satisfies('1.2.7', '1.2.x'), m.satisfies('1.3.0', '1.2.x'), m.satisfies('1.9.9', '1'), m.satisfies('2.0.0', '1'), m.satisfies('1.2.3', '=1.2.3'), m.satisfies('1.2.3', '1.2.3'), m.satisfies('1.2.4', '1.2.3')], [true, true, false, true, false, true, true, false])],
]);
const D = s => new Date(s); const iso = d => (d instanceof Date ? d.toISOString() : String(d));
const cr = (m, e, f, want) => { const got = iso(m.nextRun(e, D(f))); return got === want || { expr: e, from: f, got, want }; };
await mod('cron', [
  ['CRON1', m => cr(m, '*/15 * * * *', '2026-03-10T10:07:30Z', '2026-03-10T10:15:00.000Z')],
  ['CRON2', m => cr(m, '0 9 * * 1-5', '2026-03-13T09:00:00Z', '2026-03-16T09:00:00.000Z')],
  ['CRON3', m => all(cr(m, '30 2 1 * *', '2026-01-31T12:00:00Z', '2026-02-01T02:30:00.000Z'), cr(m, '0 0 1 1 *', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00.000Z'))],
  ['CRON4', m => cr(m, '0 0 29 2 *', '2026-03-01T00:00:00Z', '2028-02-29T00:00:00.000Z')],
  ['CRON5', m => cr(m, '0 12 13 * 5', '2026-03-01T00:00:00Z', '2026-03-06T12:00:00.000Z')],
  ['CRON6', m => all(cr(m, '5,35 8-10 * * *', '2026-06-01T10:35:00Z', '2026-06-02T08:05:00.000Z'), cr(m, '10-20/5 14 * * *', '2026-05-05T14:12:00Z', '2026-05-05T14:15:00.000Z'))],
  ['CRON7', m => all(cr(m, '59 23 31 12 *', '2026-12-31T23:58:59Z', '2026-12-31T23:59:00.000Z'), cr(m, '0 0 31 * *', '2026-04-01T00:00:00Z', '2026-05-31T00:00:00.000Z'))],
  ['CRON8', m => cr(m, '0 */6 * * 0', '2026-03-07T23:00:00Z', '2026-03-08T00:00:00.000Z')],
  ['CRON9', m => all(throws(() => m.nextRun('60 * * * *', D('2026-01-01T00:00:00Z'))) || 'minute 60 accepted', throws(() => m.nextRun('* * *', D('2026-01-01T00:00:00Z'))) || '3 fields accepted', throws(() => m.nextRun('a b c d e', D('2026-01-01T00:00:00Z'))) || 'letters accepted', throws(() => m.nextRun('* * * * 9', D('2026-01-01T00:00:00Z'))) || 'dow 9 accepted')],
  ['CRON10', m => cr(m, '* * * * *', '2026-07-04T05:06:00.000Z', '2026-07-04T05:07:00.000Z')],
]);
await mod('lru', [
  ['LRU1', m => { const c = new m.LruCache({ capacity: 2 }); c.set('a', 1); c.set('b', 2); return is([c.get('a'), c.get('b'), c.get('z'), c.size, c.has('a')], [1, 2, undefined, 2, true]); }],
  ['LRU2', m => { const c = new m.LruCache({ capacity: 2 }); c.set('a', 1); c.set('b', 2); c.set('c', 3); return is([c.has('a'), c.has('b'), c.has('c'), c.size], [false, true, true, 2]); }],
  ['LRU3', m => { const c = new m.LruCache({ capacity: 2 }); c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3); return is([c.has('a'), c.has('b'), c.has('c')], [true, false, true]); }],
  ['LRU4', m => { const c = new m.LruCache({ capacity: 2 }); c.set('a', 1); c.set('b', 2); c.has('a'); c.set('c', 3); return is([c.has('a'), c.has('b')], [false, true]); }],
  ['LRU5', m => { const c = new m.LruCache({ capacity: 2 }); c.set('a', 1); c.set('b', 2); c.set('a', 9); c.set('c', 3); return is([c.get('a'), c.has('b'), c.size], [9, false, 2]); }],
  ['LRU6', m => { const c = new m.LruCache({ capacity: 3 }); c.set('a', 1); c.set('b', 2); c.set('c', 3); c.get('a'); return is(c.keys(), ['b', 'c', 'a']); }],
  ['LRU7', m => { let t = 0; const c = new m.LruCache({ capacity: 5, ttlMs: 100, now: () => t }); c.set('a', 1); t = 60; const g = c.get('a'); t = 99; const h = c.has('a'); t = 100; return is([g, h, c.get('a'), c.has('a'), c.size, c.keys()], [1, true, undefined, false, 0, []]); }],
  ['LRU8', m => { let t = 0; const c = new m.LruCache({ capacity: 5, ttlMs: 100, now: () => t }); c.set('a', 1); t = 80; c.set('a', 2); c.set('b', 3); t = 150; return is([c.get('a'), c.size, (t = 185, c.has('a')), c.has('b'), c.size], [2, 2, false, false, 0]); }],
  ['LRU9', m => { const c = new m.LruCache({ capacity: 2 }); c.set('a', 1); return is([c.delete('a'), c.delete('a'), c.size, (c.set('x', 1), c.set('y', 2), c.clear(), c.size), c.keys()], [true, false, 0, 0, []]); }],
  ['LRU10', m => all(throws(() => new m.LruCache({ capacity: 0 })) || 'capacity 0 accepted', throws(() => new m.LruCache({ capacity: 1.5 })) || 'capacity 1.5 accepted', throws(() => new m.LruCache({ capacity: -1 })) || 'capacity -1 accepted')],
]);
function lcsLen(a, b) { const n = a.length, k = b.length; const t = Array.from({ length: n + 1 }, () => new Array(k + 1).fill(0)); for (let i = 1; i <= n; i++) for (let j = 1; j <= k; j++) t[i][j] = a[i - 1] === b[j - 1] ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]); return t[n][k]; }
function dcheck(m, a, b) {
  const d = m.diffLines(a, b); const A = a === '' ? [] : a.split('\n'), B = b === '' ? [] : b.split('\n');
  if (!Array.isArray(d) || d.some(x => !['equal', 'add', 'remove'].includes(x.type))) return { bad: 'shape', d };
  if (!eq(d.filter(x => x.type !== 'add').map(x => x.line), A)) return { bad: 'equal+remove != a', a, b };
  if (!eq(d.filter(x => x.type !== 'remove').map(x => x.line), B)) return { bad: 'equal+add != b', a, b };
  const e = d.filter(x => x.type === 'equal').length; return e === lcsLen(A, B) || { bad: 'not minimal', equal: e, lcs: lcsLen(A, B), a, b };
}
let seed = 7; const rnd = n => (seed = (seed * 1103515245 + 12345) % 2147483648) % n;
await mod('diff', [
  ['DIF1', m => dcheck(m, 'a\nb\nc', 'a\nb\nc')],
  ['DIF2', m => dcheck(m, 'a\nb\nc', 'a\nx\nc')],
  ['DIF3', m => all(dcheck(m, '', 'a\nb'), dcheck(m, 'a\nb', ''), is(m.diffLines('', ''), []))],
  ['DIF4', m => dcheck(m, 'the\nquick\nbrown\nfox\njumps', 'the\nbrown\ndog\njumps\nhigh')],
  ['DIF5', m => dcheck(m, 'a\nb\na\nb\na', 'b\na\nb\na\nb')],
  ['DIF6', m => { for (let k = 0; k < 25; k++) { const g = () => Array.from({ length: 3 + rnd(12) }, () => 'l' + rnd(5)).join('\n'); const r = dcheck(m, g(), g()); if (r !== true) return r; } return true; }],
  ['DIF7', m => is(m.diffLines('x', 'y'), [{ type: 'remove', line: 'x' }, { type: 'add', line: 'y' }])],
  ['DIF8', m => is(m.stats(m.diffLines('a\nb\nc\nd', 'a\nc\ne\nf')), { added: 2, removed: 2, unchanged: 2 })],
]);
await mod('template', [
  ['TPL1', m => all(is(m.render('Hi {{name}}!', { name: 'Ana' }), 'Hi Ana!'), is(m.render('{{ user.name }}/{{user.age}}', { user: { name: 'B', age: 0 } }), 'B/0'))],
  ['TPL2', m => all(is(m.render('{{x}}', { x: '<b>&"\'' }), '&lt;b&gt;&amp;&quot;&#39;'), is(m.render('{{{x}}}', { x: '<b>&' }), '<b>&'))],
  ['TPL3', m => all(is(m.render('[{{missing}}][{{a.b.c}}][{{n}}]', { n: null }), '[][][]'))],
  ['TPL4', m => is([true, 0, [], 'x', '', [1], null].map(v => m.render('{{#if ok}}yes{{else}}no{{/if}}', { ok: v })), ['yes', 'no', 'no', 'yes', 'no', 'yes', 'no'])],
  ['TPL5', m => all(is(m.render('a{{#if a}}A{{/if}}b', {}), 'ab'), is(m.render('{{#if u.on}}{{u.n}}{{/if}}', { u: { on: 1, n: 'N' } }), 'N'))],
  ['TPL6', m => is(m.render('{{#each items}}{{@index}}:{{this}};{{/each}}', { items: ['a', 'b'] }), '0:a;1:b;')],
  ['TPL7', m => is(m.render('{{#each people}}{{name}} ({{role}}) {{/each}}', { people: [{ name: 'A' }, { name: 'B', role: 'x' }], role: 'guest' }), 'A (guest) B (x) ')],
  ['TPL8', m => all(is(m.render('{{#each rows}}{{#if on}}[{{n}}]{{else}}({{n}}){{/if}}{{/each}}', { rows: [{ on: true, n: 1 }, { on: false, n: 2 }] }), '[1](2)'), is(m.render('{{#each rows}}{{#each xs}}{{this}}{{/each}}|{{/each}}', { rows: [{ xs: [1, 2] }, { xs: [3] }] }), '12|3|'))],
  ['TPL9', m => all(is(m.render('{{#each items}}x{{/each}}', { items: [] }), ''), is(m.render('{{#each nope}}x{{/each}}-', {}), '-'))],
  ['TPL10', m => all(throws(() => m.render('{{#if a}}x', { a: 1 })) || 'unclosed if accepted', throws(() => m.render('x{{/if}}', {})) || 'stray /if accepted', throws(() => m.render('{{#each a}}{{#if b}}{{/each}}{{/if}}', { a: [1] })) || 'crossed blocks accepted')],
]);
const near = (a, b) => typeof a === 'number' && Math.abs(a - b) < 1e-9 || { got: a, want: b };
await mod('expr', [
  ['EXP1', m => all(near(m.evaluate('1 + 2 * 3'), 7), near(m.evaluate('(1 + 2) * 3'), 9), near(m.evaluate('7 / 2'), 3.5), near(m.evaluate('10 % 4'), 2))],
  ['EXP2', m => all(near(m.evaluate('8 / 4 / 2'), 1), near(m.evaluate('2 - 3 - 4'), -5), near(m.evaluate('2 ^ 3 ^ 2'), 512))],
  ['EXP3', m => all(near(m.evaluate('-2 ^ 2'), -4), near(m.evaluate('2 ^ -1'), 0.5), near(m.evaluate('2 * -3'), -6), near(m.evaluate('(-2) ^ 2'), 4))],
  ['EXP4', m => all(near(m.evaluate('x * (y + 1)', { x: 2, y: 3 }), 8), near(m.evaluate('rate_1 * 2 + _b', { rate_1: 1.5, _b: 1 }), 4))],
  ['EXP5', m => all(near(m.evaluate('max(1, min(5, 3), 2)'), 3), near(m.evaluate('abs(-4.5)'), 4.5), near(m.evaluate('sqrt(16) + round(2.5)'), 7), near(m.evaluate('min(4, 2, 8) ^ 2'), 4))],
  ['EXP6', m => all(near(m.evaluate(' 3.25*4 '), 13), near(m.evaluate('0.1 + 0.2'), 0.1 + 0.2), near(m.evaluate('2*(3+(4-1))^2'), 72))],
  ['EXP7', m => { const bad = ['3 +', '(1 + 2', '2 3', '', '1 + * 2', ')', '1 +/ 2']; for (const s of bad) { try { m.evaluate(s); return 'accepted: ' + JSON.stringify(s); } catch (e) { if (!(e instanceof m.ExprError)) return 'not ExprError for ' + JSON.stringify(s); } } return true; }],
  ['EXP8', m => { for (const s of ['1 / 0', '5 % 0', 'foo + 1', 'nope(1)']) { try { m.evaluate(s, {}); return 'accepted: ' + s; } catch (e) { if (!(e instanceof m.ExprError)) return 'not ExprError for ' + s; } } return (new m.ExprError('x') instanceof Error) || 'ExprError is not an Error'; }],
]);
const gm = (m, list) => { for (const [p, s, w] of list) { const g = m.match(p, s); if (g !== w) return { pattern: p, path: s, got: g, want: w }; } return true; };
await mod('glob', [
  ['GLB1', m => gm(m, [['*.js', 'app.js', true], ['*.js', 'src/app.js', false], ['src/*.js', 'src/app.js', true], ['*', 'a/b', false], ['a*c', 'abc', true], ['a*c', 'ac', true], ['a*c', 'ab/c', false]])],
  ['GLB2', m => gm(m, [['file?.txt', 'file1.txt', true], ['file?.txt', 'file10.txt', false], ['file?.txt', 'file.txt', false], ['a?b', 'a/b', false]])],
  ['GLB3', m => gm(m, [['src/**/*.js', 'src/app.js', true], ['src/**/*.js', 'src/a/b/app.js', true], ['src/**/*.js', 'lib/app.js', false], ['a/**/b', 'a/b', true], ['a/**/b', 'a/x/y/b', true], ['a/**/b', 'a/x/y/c', false]])],
  ['GLB4', m => gm(m, [['**/*.md', 'README.md', true], ['**/*.md', 'docs/x/y.md', true], ['**/b', 'b', true], ['**/b', 'x/y/b', true], ['**/b', 'x/yb', false]])],
  ['GLB5', m => gm(m, [['a/**', 'a/b', true], ['a/**', 'a/b/c', true], ['a/**', 'a', false], ['**', 'a/b/c', true], ['**', 'x', true]])],
  ['GLB6', m => gm(m, [['[abc].txt', 'b.txt', true], ['[abc].txt', 'd.txt', false], ['[a-c]x', 'bx', true], ['[a-c]x', 'dx', false], ['[!a-c]x', 'dx', true], ['[!a-c]x', 'ax', false], ['a[!b]c', 'a/c', false]])],
  ['GLB7', m => gm(m, [['*.{png,jpg}', 'pic.jpg', true], ['*.{png,jpg}', 'pic.gif', false], ['src/{lib,test}/**/*.js', 'src/test/unit/a.js', true], ['src/{lib,test}/**/*.js', 'src/docs/a.js', false], ['{a,b*}.c', 'bxx.c', true]])],
  ['GLB8', m => gm(m, [['a.b', 'aXb', false], ['a.b', 'a.b', true], ['a+(b)', 'a+(b)', true], ['a+(b)', 'aab', false], ['A.js', 'a.js', false], ['x$^|y', 'x$^|y', true], ['abc', 'abcd', false], ['abc', 'xabc', false]])],
]);
console.log(JSON.stringify(out));
