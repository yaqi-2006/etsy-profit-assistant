'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Etsy = require('./etsy.js');

const HEADERS = ['Date', 'Type', 'Title', 'Info', 'Currency', 'Amount', 'Fees & Taxes', 'Net'];
const fixtureName = 'synthetic-etsy-statement.csv';
const fixtureText = fs.readFileSync(path.join(__dirname, 'samples', fixtureName), 'utf8');

function csvCell(value) {
  const text = String(value);
  return /[,"\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function statement(rows, headers = HEADERS) {
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
}

function row(changes = {}) {
  const values = { Date: '2026-10-02', Type: 'Sale', Title: 'private-title', Info: 'private-buyer-info', Currency: 'USD', Amount: '54.00', 'Fees & Taxes': '-5.87', Net: '48.13', ...changes };
  return HEADERS.map(header => values[header]);
}

function assertAtomic(result, line) {
  assert.deepEqual(result.rows, []);
  assert.equal(result.summary, null);
  assert.ok(result.issues.length > 0);
  for (const issue of result.issues) {
    assert.deepEqual(Object.keys(issue).sort(), ['line', 'message']);
    assert.ok(Number.isInteger(issue.line) && issue.line > 0);
    assert.equal(typeof issue.message, 'string');
    assert.doesNotMatch(issue.message, /private-title|private-buyer-info|private-extra/);
  }
  if (line !== undefined) assert.equal(result.issues[0].line, line);
}

test('虚构月结逐行保留财务事实，汇总只累加 Net 且不保留 Title 或 Info', () => {
  const result = Etsy.ingest(fixtureText, { sourceName: fixtureName });
  assert.deepEqual(Etsy.HEADERS, HEADERS);
  assert.equal(Object.isFrozen(Etsy.HEADERS), true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.rows.length, 8);
  assert.deepEqual(result.rows[0], {
    date: '2026-10-02', type: 'sale', category: 'sales', amount: 5400, feesTaxes: -587, net: 4813, arithmeticMismatch: false,
    currency: 'USD', source: { file: fixtureName, line: 2 }
  });
  assert.deepEqual(result.summary.profile, { id: 'etsy-monthly-en-usd-v1', name: 'Etsy monthly statement · English/USD 8-column historical profile (synthetic-tested)' });
  assert.equal(result.summary.month, '2026-10');
  assert.equal(result.summary.rowCount, 8);
  assert.equal(result.summary.netTotal, 965);
  assert.equal(result.summary.feesTaxesTotal, -1552);
  assert.equal(result.summary.unknownCount, 1);
  assert.equal(result.summary.unknownNet, 117);
  assert.deepEqual(result.summary.categories.find(category => category.key === 'sales'), { key: 'sales', label: 'Sales row net', count: 1, net: 4813, missingNetCount: 0 });
  assert.equal(result.summary.categories.find(category => category.key === 'fees').net, -365);
  assert.equal(result.summary.categories.find(category => category.key === 'fees').count, 3);
  for (const fact of result.rows) {
    assert.deepEqual(Object.keys(fact).sort(), ['amount', 'arithmeticMismatch', 'category', 'currency', 'date', 'feesTaxes', 'net', 'source', 'type']);
    assert.deepEqual(Object.keys(fact.source).sort(), ['file', 'line']);
  }
  assert.doesNotMatch(JSON.stringify(result), /Entirely fictitious|SYNTHETIC .*placeholder|buyer|Title|Info/);
});

test('Amount、Fees & Taxes 和 Net 的缺失标记均保留 null，不伪造已知金额', () => {
  for (const missing of ['', '  ', '-', '--']) {
    const result = Etsy.ingest(statement([row({ Amount: missing, 'Fees & Taxes': missing, Net: '1.23' })]));
    assert.deepEqual(result.issues, []);
    assert.equal(result.rows[0].amount, null);
    assert.equal(result.rows[0].feesTaxes, null);
    assert.equal(result.rows[0].net, 123);
    assert.equal(result.rows[0].source.file, 'Etsy statement.csv');
    assert.equal(result.summary.feesTaxesTotal, null);
  }
  const explicitZero = Etsy.ingest(statement([row({ Amount: '0', 'Fees & Taxes': '0.00', Net: '-0.00' })]));
  assert.equal(explicitZero.rows[0].amount, 0);
  assert.equal(explicitZero.rows[0].feesTaxes, 0);
  assert.equal(explicitZero.rows[0].net, 0);
  for (const missing of ['', ' ', '-', '--']) {
    const partial = Etsy.ingest(statement([row(), row({ Net: missing })]));
    assert.deepEqual(partial.issues, []);
    assert.equal(partial.rows[1].net, null);
    assert.equal(partial.summary.netTotal, 4813);
    assert.equal(partial.summary.missingNetCount, 1);
  }
});

test('保留 Net 不翻转符号或重复扣费，算术不同作为待核对标记而不覆盖源净额', () => {
  for (const values of [
    { Amount: '54.00', 'Fees & Taxes': '-5.87', Net: '48.13' },
    { Amount: '-10.00', 'Fees & Taxes': '0.50', Net: '-9.50' },
    { Amount: '0.00', 'Fees & Taxes': '2.00', Net: '2.00' },
    { Amount: '', 'Fees & Taxes': '-3.25', Net: '7.00' },
    { Amount: '54.00', 'Fees & Taxes': '', Net: '7.00' }
  ]) {
    const result = Etsy.ingest(statement([row(values)]));
    assert.deepEqual(result.issues, []);
    assert.equal(result.summary.netTotal, result.rows[0].net);
  }
  for (const values of [
    { Amount: '54.00', 'Fees & Taxes': '-5.87', Net: '48.12' },
    { Amount: '54.00', 'Fees & Taxes': '5.87', Net: '48.13' },
    { Amount: '-10.00', 'Fees & Taxes': '0.50', Net: '-10.50' }
  ]) {
    const retained = Etsy.ingest(statement([row(), row(values)]));
    assert.deepEqual(retained.issues, []);
    assert.equal(retained.rows[1].arithmeticMismatch, true);
    assert.equal(retained.summary.mismatchCount, 1);
    assert.equal(retained.rows[1].net, require('./core.js').parseMoney(values.Net));
  }
});

test('USD 金额允许单个美元前缀、规范千分位及括号负数，严格保留分值', () => {
  for (const [input, expected] of [
    ['$1,234.56', 123456], ['-$1,234.56', -123456], ['$-1,234.56', -123456],
    ['+$1,234.5', 123450], ['$+1,234.50', 123450], ['($1,234.56)', -123456],
    ['(1,234.56)', -123456], ['1,234,567.89', 123456789], ['  $0.01  ', 1],
    ['-0.00', 0], ['($0.00)', 0]
  ]) {
    const result = Etsy.ingest(statement([row({ Amount: input, 'Fees & Taxes': '0', Net: input })]));
    assert.deepEqual(result.issues, [], input);
    assert.equal(result.rows[0].amount, expected, input);
    assert.equal(result.rows[0].net, expected, input);
    assert.equal(result.summary.netTotal, expected, input);
  }
});

test('全表币种仅允许明确 USD，混币、空币种或外币导致整份失败', () => {
  assert.deepEqual(Etsy.ingest(statement([row({ Currency: ' USD ' })])).issues, []);
  for (const currency of ['', ' ', 'usd', 'EUR', 'CAD', 'GBP', '$', 'USD/EUR']) {
    assertAtomic(Etsy.ingest(statement([row(), row({ Currency: currency })])), 3);
  }
});

test('任一金额字段拒绝外币符号、重复符号、错误千分位、科学计数或超过两位小数', () => {
  const malformed = [
    '€1.00', '£1.00', '¥1.00', 'C$1.00', 'US$1.00', 'USD 1.00', '1 USD',
    '$$1.00', '-$$1.00', '+-1.00', '$+-1.00', '(+$1.00)', '(-$1.00)', '(1.00', '1.00)',
    '1,00.00', '12,34.00', '1234,567.00', '1,,234.00', '1,2345.00', '1,234,56.00', ',123.00',
    '1e3', '1.001', '.50', '1.', 'NaN', 'Infinity', '$', '$ 1.00', '1 000.00', '1\n.00'
  ];
  for (const field of ['Amount', 'Fees & Taxes', 'Net']) {
    for (const input of malformed) {
      assertAtomic(Etsy.ingest(statement([row(), row({ [field]: input })])), 3);
    }
  }
});

test('ISO、美国短日期及英文日期规范为真实日历日期，二位年份固定解释为 20xx', () => {
  for (const [input, expected] of [
    ['2026-10-02', '2026-10-02'], [' 2026-10-02 ', '2026-10-02'],
    ['10/2/2026', '2026-10-02'], ['10/02/26', '2026-10-02'],
    ['1/2/00', '2000-01-02'], ['12/31/99', '2099-12-31'],
    ['Oct 2, 2026', '2026-10-02'], ['2 Oct, 2026', '2026-10-02'],
    ['October 2, 2026', '2026-10-02'], ['2 October, 2026', '2026-10-02'],
    ['2024-02-29', '2024-02-29'], ['2/29/00', '2000-02-29']
  ]) {
    const result = Etsy.ingest(statement([row({ Date: input })]));
    assert.deepEqual(result.issues, [], input);
    assert.equal(result.rows[0].date, expected, input);
    assert.equal(result.summary.month, expected.slice(0, 7), input);
  }
});

test('无效日历日期、非闰年二月或含时间的日期不允许自动滚动修正', () => {
  for (const date of [
    '', '2023-02-29', '1900-02-29', '2100-02-29', '2026-04-31', '2026-00-02', '2026-13-01',
    '2026-10-00', '2026-10-32', '0000-01-01', '2026-2-01', '2026-02-1',
    '13/2/2026', '2/29/26', '2/30/2024', '2026/10/02', '2/2/6', '2/2/026',
    'October 32, 2026', '29 Feb, 2026', 'Fake 2, 2026', 'Oct 2, 26',
    '2026-10-02T00:00:00Z', '2026-10-02 00:00:00', '02-10-2026'
  ]) assertAtomic(Etsy.ingest(statement([row(), row({ Date: date })])), 3);
});

test('只接受一个日历月，跨月或跨年导入原子失败而非混合期间', () => {
  const sameMonth = Etsy.ingest(statement([row({ Date: '10/31/26' }), row({ Date: 'Oct 1, 2026' })]));
  assert.deepEqual(sameMonth.issues, []);
  assert.equal(sameMonth.summary.month, '2026-10');
  for (const date of ['2026-11-01', '2026-09-30', '2027-10-02']) {
    assertAtomic(Etsy.ingest(statement([row(), row({ Date: date })])), 3);
  }
});

test('八个表头须去外空白后精确匹配大小写，缺列或重复表头不能产生部分记录', () => {
  for (let index = 0; index < HEADERS.length; index += 1) {
    const removed = HEADERS.filter((_, i) => i !== index);
    const removedRow = row().filter((_, i) => i !== index);
    assertAtomic(Etsy.ingest(statement([removedRow], removed)), 1);
    const changed = HEADERS.map((header, i) => i === index ? header.toLowerCase() : header);
    assertAtomic(Etsy.ingest(statement([row()], changed)), 1);
  }
  assertAtomic(Etsy.ingest(statement([[...row(), 'private-extra']], [...HEADERS, ' Date '])), 1);
  assertAtomic(Etsy.ingest(statement([row()], HEADERS.map(header => header === 'Title' ? ' ' : header))), 1);
});

test('表头可重排和加外空白，额外列与 BOM、引号及跨行私密文本只瞬时解析不保留', () => {
  const ordered = ['Net', 'Info', 'Date', 'Currency', 'Buyer', 'Title', 'Type', 'Fees & Taxes', 'Amount'];
  const values = Object.fromEntries(HEADERS.map((header, index) => [header, row()[index]]));
  values.Info = 'private-buyer-info\r\nprivate-buyer-info';
  values.Title = 'private-title, "private-title"';
  values.Buyer = 'private-extra';
  const text = '\uFEFF' + statement([
    ordered.map(header => values[header]),
    ordered.map(header => header === 'Info' ? 'private-buyer-info' : values[header])
  ], ordered.map(header => ' ' + header + ' ')).replace(/(?<!\r)\n/g, '\r\n');
  const result = Etsy.ingest(text, { sourceName: 'synthetic-quoted-statement.csv' });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.rows.map(fact => fact.source.line), [2, 4]);
  assert.deepEqual(result.rows.map(fact => fact.net), [4813, 4813]);
  assert.doesNotMatch(JSON.stringify(result), /private-title|private-buyer-info|private-extra|Buyer|Title|Info/);
  for (const fact of result.rows) assert.deepEqual(Object.keys(fact).sort(), ['amount', 'arithmeticMismatch', 'category', 'currency', 'date', 'feesTaxes', 'net', 'source', 'type']);
});

test('空输入、无数据行、破损引号和不匹配列宽以行号报告且不泄露字段', () => {
  for (const text of [undefined, null, 12, '', ' ', '\uFEFF', HEADERS.join(','), HEADERS.join(',') + '\n']) {
    assertAtomic(Etsy.ingest(text), 1);
    assert.doesNotMatch(Etsy.ingest(text).issues[0].message, /Cannot read|undefined|TypeError/);
  }
  const header = HEADERS.join(',') + '\n';
  const first = row().map(csvCell).join(',') + '\n';
  for (const malformed of [
    '"private-title',
    '2026-10-02,Sale,"private-title"x,private-buyer-info,USD,54.00,-5.87,48.13',
    '2026-10-02,Sale,private-title"x,private-buyer-info,USD,54.00,-5.87,48.13',
    '2026-10-02,Sale,private-title,private-buyer-info,USD,54.00,-5.87',
    '2026-10-02,Sale,private-title,private-buyer-info,USD,54.00,-5.87,48.13,private-extra'
  ]) assertAtomic(Etsy.ingest(header + first + malformed), 3);
});

test('仅按 Type 的保守精确别名分类，不由 Title 或 Info 推断利润或改写原始类型', () => {
  const pairs = [
    [' Sale ', 'sales'], ['SALES', 'sales'], ['Refund', 'refunds'], ['Refunds', 'refunds'],
    ['Fee', 'fees'], ['Fees', 'fees'], ['Marketing', 'marketing'], ['Shipping', 'shipping'],
    ['Tax', 'tax'], ['Taxes', 'tax'], ['Deposit', 'deposits'], ['Deposits', 'deposits'],
    ['Payment', 'payments'], ['Payments', 'payments'], ['Credit', 'credits'], ['Credits', 'credits'],
    ['Reserve', 'reserves'], ['Reserves', 'reserves']
  ];
  const result = Etsy.ingest(statement(pairs.map(([type]) => row({ Type: type, Title: 'Deposit Fee Sales', Info: 'profit tax buyer private-buyer-info', Amount: '', 'Fees & Taxes': '', Net: '-0.01' }))));
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.rows.map(fact => fact.category), pairs.map(([, category]) => category));
  assert.deepEqual(result.rows.map(fact => fact.type), pairs.map(([type]) => type.trim().toLowerCase()));
  assert.equal(result.summary.netTotal, -18);
  assert.equal(result.summary.unknownCount, 0);
  assert.deepEqual(result.summary.categories.map(category => category.key), ['sales', 'refunds', 'fees', 'marketing', 'shipping', 'tax', 'deposits', 'payments', 'credits', 'reserves', 'unknown']);
  for (const category of result.summary.categories) assert.deepEqual(Object.keys(category).sort(), ['count', 'key', 'label', 'missingNetCount', 'net']);
  for (const key of ['tax', 'payments', 'credits']) assert.doesNotMatch(result.summary.categories.find(category => category.key === key).label, /profit|利润/i);
});

test('未知类型与有符号净额保留为未分类事实，不使用关键词猜测或丢弃', () => {
  const types = [' Custom Adjustment ', 'Listing Fee', 'Offsite Ads', 'Shipping credit', 'Sales tax', '', '__proto__', 'constructor'];
  const result = Etsy.ingest(statement(types.map((type, index) => row({ Type: type, Title: 'Fees Sale', Info: 'Payment Deposit', Amount: '', 'Fees & Taxes': '', Net: index % 2 ? '-1.23' : '2.00' }))));
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.rows.map(fact => fact.category), types.map(() => 'unknown'));
  assert.deepEqual(result.rows.map(fact => fact.type), types.map(type => type.trim().toLowerCase()));
  assert.equal(result.summary.unknownCount, 8);
  assert.equal(result.summary.unknownNet, 308);
  assert.equal(result.summary.netTotal, 308);
});

test('完全相同的原始行各自计数，重复调用只返回本次月结且不创造稳定事件 ID', () => {
  const repeated = row({ Type: 'Fees', Amount: '', 'Fees & Taxes': '-0.20', Net: '-0.20' });
  const text = statement([repeated, repeated]);
  const first = Etsy.ingest(text, { sourceName: 'synthetic-repeat.csv' });
  const second = Etsy.ingest(text, { sourceName: 'synthetic-repeat.csv' });
  assert.deepEqual(first.issues, []);
  assert.equal(first.rows.length, 2);
  assert.deepEqual(first.rows.map(fact => fact.source.line), [2, 3]);
  assert.equal(first.summary.netTotal, -40);
  assert.equal(first.summary.categories.find(category => category.key === 'fees').count, 2);
  assert.deepEqual(first, second);
  for (const fact of first.rows) {
    assert.equal('id' in fact, false);
    assert.equal('eventId' in fact, false);
    assert.equal('orderId' in fact, false);
  }
  first.rows[0].net = 999;
  assert.equal(second.rows[0].net, -20);
  assert.equal(first.rows[1].net, -20);
  assert.equal(Etsy.ingest(text).summary.netTotal, -40);
});

test('所有导出分值保持安全整数，净额或分类合计溢出必须原子拒绝', () => {
  const max = '90071992547409.91';
  const positive = row({ Amount: '', 'Fees & Taxes': '', Net: max });
  const negative = row({ Amount: '', 'Fees & Taxes': '', Net: '-' + max });
  const cent = row({ Amount: '', 'Fees & Taxes': '', Net: '0.01' });
  for (const [fact, expected] of [[positive, Number.MAX_SAFE_INTEGER], [negative, -Number.MAX_SAFE_INTEGER]]) {
    const result = Etsy.ingest(statement([fact]));
    assert.deepEqual(result.issues, []);
    assert.equal(result.rows[0].net, expected);
    assert.equal(result.summary.netTotal, expected);
  }
  for (const field of ['Amount', 'Fees & Taxes', 'Net']) {
    assertAtomic(Etsy.ingest(statement([row({ [field]: '90071992547409.92' })])), 2);
    assertAtomic(Etsy.ingest(statement([row({ [field]: '-90071992547409.92' })])), 2);
  }
  assertAtomic(Etsy.ingest(statement([positive, cent])));
  assertAtomic(Etsy.ingest(statement([negative, row({ Amount: '', 'Fees & Taxes': '', Net: '-0.01' })])));
  assertAtomic(Etsy.ingest(statement([positive, cent, row({ Type: 'Shipping', Amount: '', 'Fees & Taxes': '', Net: '-' + max })])));
});

test('费用解释合计也验证溢出，暂时越界后相消的最终安全净额保持精确', () => {
  const max = '90071992547409.91';
  for (const fee of [max, '-' + max]) {
    assertAtomic(Etsy.ingest(statement([
      row({ Amount: '', 'Fees & Taxes': fee, Net: '0' }),
      row({ Amount: '', 'Fees & Taxes': fee[0] === '-' ? '-0.01' : '0.01', Net: '0' })
    ])));
  }
  const result = Etsy.ingest(statement([
    row({ Amount: '', 'Fees & Taxes': '', Net: max }),
    row({ Amount: '', 'Fees & Taxes': '', Net: '0.02' }),
    row({ Amount: '', 'Fees & Taxes': '', Net: '-' + max })
  ]));
  assert.deepEqual(result.issues, []);
  assert.equal(result.summary.netTotal, 2);
  assert.equal(result.summary.categories.find(category => category.key === 'sales').net, 2);
  const reconciled = Etsy.ingest(statement([row({ Amount: max, 'Fees & Taxes': '-' + max, Net: '0.00' })]));
  assert.deepEqual(reconciled.issues, []);
  assert.equal(reconciled.rows[0].net, 0);
  assert.equal(reconciled.summary.feesTaxesTotal, -Number.MAX_SAFE_INTEGER);
});

test('输入限制为 UTF-8 的 2 MiB，边界内可导入而超量原子拒绝', () => {
  const limit = 2 * 1024 * 1024;
  const empty = statement([row({ Title: '' })]);
  const allowance = limit - Buffer.byteLength(empty, 'utf8');
  const exact = statement([row({ Title: 'x'.repeat(allowance) })]);
  assert.equal(Buffer.byteLength(exact, 'utf8'), limit);
  assert.deepEqual(Etsy.ingest(exact).issues, []);
  assertAtomic(Etsy.ingest(statement([row({ Title: 'x'.repeat(allowance + 1) })])), 1);
  for (const character of ['界', '🧪']) {
    const repetitions = Math.floor(allowance / Buffer.byteLength(character, 'utf8'));
    const within = statement([row({ Title: character.repeat(repetitions) })]);
    assert.ok(Buffer.byteLength(within, 'utf8') <= limit);
    assert.deepEqual(Etsy.ingest(within).issues, []);
    const over = statement([row({ Title: character.repeat(repetitions + 1) })]);
    assert.ok(Buffer.byteLength(over, 'utf8') > limit);
    assertAtomic(Etsy.ingest(over), 1);
  }
});

test('沿用 Core 的 5000 数据行上限和 80 列上限，不以相同行去重逃避限制', () => {
  const fact = row({ Amount: '', 'Fees & Taxes': '', Net: '0.01' });
  const accepted = Etsy.ingest(statement(Array(5000).fill(fact)));
  assert.deepEqual(accepted.issues, []);
  assert.equal(accepted.rows.length, 5000);
  assert.equal(accepted.summary.rowCount, 5000);
  assert.equal(accepted.summary.netTotal, 5000);
  assert.equal(accepted.rows[4999].source.line, 5001);
  const rejected = Etsy.ingest(statement(Array(5001).fill(fact)));
  assertAtomic(rejected, 5002);
  assert.match(rejected.issues[0].message, /5000/);
  const extras = Array.from({ length: 72 }, (_, index) => 'Ignored' + index);
  const headers = [...HEADERS, ...extras];
  assert.deepEqual(Etsy.ingest(statement([[...fact, ...extras.map(() => 'private-extra')]], headers)).issues, []);
  assertAtomic(Etsy.ingest(statement([[...fact, ...extras.map(() => 'private-extra'), 'private-extra']], [...headers, 'TooMany'])), 1);
});

test('浏览器 UMD 的全局 EtsyCSV 与 CommonJS 使用相同接口、净额和原子失败结果', () => {
  const browser = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'core.js'), 'utf8'), browser, { filename: 'core.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'etsy.js'), 'utf8'), browser, { filename: 'etsy.js' });
  assert.equal(typeof browser.ProfitCore.parseCSV, 'function');
  assert.equal(typeof browser.EtsyCSV.ingest, 'function');
  assert.deepEqual(JSON.parse(JSON.stringify(browser.EtsyCSV.HEADERS)), Etsy.HEADERS);
  assert.equal(Object.isFrozen(browser.EtsyCSV.HEADERS), true);
  assert.deepEqual(Object.keys(browser.EtsyCSV).sort(), ['HEADERS', 'ingest']);
  assert.deepEqual(Object.keys(Etsy).sort(), ['HEADERS', 'ingest']);
  for (const text of [
    fixtureText,
    statement([row({ Date: '2 Oct, 2026', Amount: '$1,234.56', 'Fees & Taxes': '($4.56)', Net: '$1,230.00' })]),
    statement([row(), row({ Net: '48.12' })]),
    statement([row({ Currency: 'EUR' })]),
    HEADERS.join(',')
  ]) {
    const options = { sourceName: fixtureName };
    assert.deepEqual(JSON.parse(JSON.stringify(browser.EtsyCSV.ingest(text, options))), Etsy.ingest(text, options));
  }
});

test('来源文件名只能是文本，不允许通过 sourceName 附带私密对象或额外字段', () => {
  for (const sourceName of [null, 42, [], { Title: 'private-title', Info: 'private-buyer-info' }]) {
    assertAtomic(Etsy.ingest(fixtureText, { sourceName }), 1);
  }
  const result = Etsy.ingest(fixtureText, { sourceName: fixtureName, Title: 'private-title', Info: 'private-buyer-info', extra: 'private-extra' });
  assert.deepEqual(result.issues, []);
  assert.doesNotMatch(JSON.stringify(result), /private-title|private-buyer-info|private-extra/);
});
