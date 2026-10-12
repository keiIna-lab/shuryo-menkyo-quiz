const assert = require("assert");
const L = require("./logic.js");
const questions = require("./questions.js");

const issues = L.validateBank(questions);
assert.deepStrictEqual(issues, [], issues.join("\n"));

assert.strictEqual(L.isPass(21, 30), true);
assert.strictEqual(L.isPass(20, 30), false);
assert.strictEqual(L.isPass(7, 10), true);
assert.strictEqual(L.isPass(6, 10), false);
assert.strictEqual(L.isPass(0, 0), false);

const sample = questions.find((q) => q.licenses.includes("trap") && q.category === "law");
const other = questions.find((q) => q.id !== sample.id && q.licenses.includes("trap"));
const records = {};
records[sample.id] = { attempts: [{ ok: false, at: 1 }] };
records[other.id] = { attempts: [{ ok: false, at: 1 }, { ok: true, at: 2 }] };
let pending = L.pendingWrongIds(questions, records, "trap");
assert.ok(pending.includes(sample.id));
assert.ok(!pending.includes(other.id));
pending = L.pendingWrongIds(questions, records, "net");
if (!sample.licenses.includes("net")) assert.ok(!pending.includes(sample.id));

const sum = L.summarize(questions, records, "trap");
assert.strictEqual(sum.total.taken, [sample, other].filter((q) => q.licenses.includes("trap")).length);
assert.ok(sum.total.attempts >= 2);
assert.ok(sum.byTopic.length >= 1);
assert.strictEqual(L.escapeHtml(`<b class="x">`), "&lt;b class=&quot;x&quot;&gt;");

L.LICENSES.forEach((lic) => {
  const mock = L.drawMock(questions, lic, 99);
  assert.strictEqual(mock.length, 30);
  assert.strictEqual(new Set(mock.map((q) => q.id)).size, 30);
  const again = L.drawMock(questions, lic, 99);
  assert.deepStrictEqual(again.map((q) => q.id), mock.map((q) => q.id));
  const picks = {};
  mock.forEach((q, i) => { picks[q.id] = i < 21 ? q.answer : (q.answer + 1) % 3; });
  assert.strictEqual(L.countCorrect(mock, picks), 21);
  assert.strictEqual(L.isPass(L.countCorrect(mock, picks), mock.length), true);
  const rows = L.sessionBreakdown(mock, picks);
  assert.strictEqual(rows.reduce((n, r) => n + r.total, 0), 30);
});

const none = L.summarize(questions, {}, "gun1");
assert.strictEqual(none.total.taken, 0);
assert.strictEqual(none.byTopic.length, 0);

console.log("logic tests ok");
