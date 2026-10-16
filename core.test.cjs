'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('./core.js');
const fs = require('node:fs');
const vm = require('node:vm');

test('金额解析保留精确分值，空值不变成零', () => {
  for (const [input, expected] of [
    ['50', 5000], ['-3.25', -325], ['1.87', 187], ['0.20', 20],
    ['+4.00', 400], ['(12.30)', -1230], ['0', 0], ['-0.00', 0],
    ['', null], ['   ', null], [null, null]
  ]) {
    assert.equal(Core.parseMoney(input), expected);
  }
});

test('金额拒绝模糊格式和超出安全整数范围的分值', () => {
  for (const input of ['1.234', '1e3', '$12.00', '1,000.00', '12 USD', 'NaN', '--1', '(+1.00)', '(-1.00)', '90071992547409.92']) {
    assert.throws(() => Core.parseMoney(input), /amount|cents/i);
  }
  assert.throws(() => Core.parseMoney(12.34), /Amount/);
  assert.equal(Core.parseMoney('90071992547409.91'), Number.MAX_SAFE_INTEGER);
  assert.equal(Core.parseMoney('-90071992547409.91'), -Number.MAX_SAFE_INTEGER);
});

test('CSV 正确解析 BOM、CRLF、引号逗号、双引号与跨行字段并保留行号', () => {
  const parsed = Core.parseCSV('\uFEFFid,note,amount\r\na,"逗号,和""引号""\r\n跨行",1.00\r\nb,"普通",2.00\r\n');
  assert.deepEqual(parsed, {
    headers: ['id', 'note', 'amount'],
    rows: [
      { values: ['a', '逗号,和"引号"\r\n跨行', '1.00'], line: 2 },
      { values: ['b', '普通', '2.00'], line: 4 }
    ]
  });
});

test('CSV 拒绝空白或重复表头、错误列宽、破损引号和超量输入且不泄露原始字段', () => {
  for (const csv of [
    '', 'id,\nprivate-secret,1', 'id,id\nprivate-secret,1',
    'id, id \nprivate-secret,1', 'id,amount\nprivate-secret',
    'id,amount\nprivate-secret,1,2', 'id,amount\n"private-secret,1',
    'id,amount\nprivate-secret"x,1', 'id,amount\n"private-secret"x,1'
  ]) {
    assert.throws(() => Core.parseCSV(csv), error => {
      assert.doesNotMatch(error.message, /private-secret/);
      return /CSV/.test(error.message);
    });
  }
  const headers80 = Array.from({ length: 80 }, (_, i) => 'c' + i).join(',');
  assert.equal(Core.parseCSV(headers80).headers.length, 80);
  assert.throws(() => Core.parseCSV(headers80 + ',c80'), /80/);
  assert.equal(Core.parseCSV('id\n' + Array(5000).fill('a').join('\n')).rows.length, 5000);
  assert.throws(() => Core.parseCSV('id\n' + Array(5001).fill('a').join('\n')), /5000/);
});

const mapping = { id: '事件', date: '日期', type: '类型', amount: '金额', orderId: '订单', currency: '币种' };
const csvHeader = '事件,日期,类型,金额,订单,币种\n';

function event(id, date, type, amount, orderId = '', extra = {}) {
  return { id, date, type, amount, orderId, currency: 'USD', source: { file: '测试', line: 2 }, quality: 'imported', ...extra };
}

test('明确映射导入生成规范事件并保留来源与精确订单标识', () => {
  assert.deepEqual(Core.EVENT_TYPES, ['sale', 'refund', 'fee', 'fee_credit', 'offsite_ad', 'shipping', 'shipping_credit', 'period_ad', 'listing', 'expense', 'tax', 'deposit', 'reserve', 'unknown']);
  assert.deepEqual(Core.TYPE_LABELS, {
    sale: 'Sales revenue', refund: 'Refunds', fee: 'Platform fees', fee_credit: 'Fee credits',
    offsite_ad: 'Offsite Ads fees', shipping: 'Actual shipping costs', shipping_credit: 'Shipping credits',
    period_ad: 'Period advertising costs', listing: 'Listing fees', expense: 'Other expenses',
    tax: 'Collected tax', deposit: 'Payouts', reserve: 'Reserved funds', unknown: 'Unclassified'
  });
  assert.deepEqual(Core.ingestCSV(csvHeader + ' e1 ,2024-02-29,sale,50.00, 001-X ,USD\n', mapping, { sourceName: '订单导出.csv' }), {
    events: [{ id: 'e1', date: '2024-02-29', type: 'sale', amount: 5000, orderId: '001-X', currency: 'USD', source: { file: '订单导出.csv', line: 2 }, quality: 'imported' }],
    issues: []
  });
  const minimal = { id: '事件', date: '日期', type: '类型', amount: '金额' };
  assert.deepEqual(Core.ingestCSV(csvHeader + 'e2,2024-03-01,fee,3.25,忽略,EUR', minimal, { invert: true }).events, [
    event('e2', '2024-03-01', 'fee', -325, '', { source: { file: 'CSV', line: 2 } })
  ]);
});

test('日期、币种、枚举、金额或映射错误使整份导入原子失败', () => {
  const valid = 'valid,2024-02-29,sale,50.00,订单一,USD\n';
  const invalidRows = [
    ',2024-02-29,sale,1,订单一,USD',
    'private-secret,2023-02-29,sale,1,订单一,USD',
    'private-secret,2024-04-31,sale,1,订单一,USD',
    'private-secret,2024-2-01,sale,1,订单一,USD',
    'private-secret,2024-02-29,Sale,1,订单一,USD',
    'private-secret,2024-02-29,sale,,订单一,USD',
    'private-secret,2024-02-29,sale,1.001,订单一,USD',
    'private-secret,2024-02-29,sale,1,订单一,EUR',
    'private-secret,2024-02-29,sale,1,订单一,'
  ];
  for (const row of invalidRows) {
    const result = Core.ingestCSV(csvHeader + valid + row, mapping);
    assert.deepEqual(result.events, []);
    assert.ok(result.issues.length > 0);
    assert.equal(result.issues[0].line, 3);
    assert.doesNotMatch(result.issues[0].message, /private-secret|订单一/);
  }
  for (const badMapping of [undefined, {}, { ...mapping, date: '没有此列' }, { ...mapping, id: '金额' }]) {
    const result = Core.ingestCSV(csvHeader + valid, badMapping);
    assert.deepEqual(result.events, []);
    assert.ok(result.issues.length);
  }
  const malformed = Core.ingestCSV(csvHeader + valid + '"private-secret', mapping);
  assert.deepEqual(malformed.events, []);
  assert.doesNotMatch(malformed.issues[0].message, /private-secret/);
});

test('类型符号约束在可选反转后验证，零金额仍是有效事实', () => {
  const positive = ['sale', 'fee_credit', 'shipping_credit'];
  const negative = ['refund', 'fee', 'offsite_ad', 'shipping', 'period_ad', 'listing', 'expense'];
  const either = ['tax', 'deposit', 'reserve', 'unknown'];
  for (const type of [...positive, ...negative, ...either]) {
    const sign = negative.includes(type) ? '-1.00' : '1.00';
    assert.equal(Core.ingestCSV(csvHeader + `e,2024-01-01,${type},${sign},,USD`, mapping).issues.length, 0);
    assert.equal(Core.ingestCSV(csvHeader + `e,2024-01-01,${type},0,,USD`, mapping).events[0].amount, 0);
  }
  for (const type of [...positive, ...negative]) {
    const badSign = positive.includes(type) ? '-1.00' : '1.00';
    const result = Core.ingestCSV(csvHeader + `e,2024-01-01,${type},${badSign},,USD`, mapping);
    assert.deepEqual(result.events, []);
    assert.match(result.issues[0].message, /sign/);
    assert.equal(Core.ingestCSV(csvHeader + `e,2024-01-01,${type},${badSign},,USD`, mapping, { invert: true }).issues.length, 0);
  }
  for (const type of either) {
    assert.equal(Core.ingestCSV(csvHeader + `e,2024-01-01,${type},-1.00,,USD`, mapping).issues.length, 0);
  }
});

test('稳定 ID 导入和追加幂等，日期金额相同但不同 ID 不会误去重', () => {
  const csv = csvHeader + [
    'a,2024-01-01,sale,50.00, 001 ,USD',
    'a,2024-01-01,sale,50.00,001,USD',
    'b,2024-01-01,sale,50.00,002,USD'
  ].join('\n');
  const imported = Core.ingestCSV(csv, mapping, { sourceName: '原始.csv' });
  assert.deepEqual(imported.issues, []);
  assert.deepEqual(imported.events.map(row => row.id), ['a', 'b']);
  const first = Core.mergeEvents([], imported.events);
  assert.equal(first.added, 2);
  assert.equal(first.skipped, 0);
  const reimport = Core.ingestCSV(csv, mapping, { sourceName: '再次.csv' });
  const merged = Core.mergeEvents(first.events, reimport.events);
  assert.equal(merged.added, 0);
  assert.equal(merged.skipped, 2);
  assert.deepEqual(merged.events, first.events);
  assert.equal(merged.events[0].source.file, '原始.csv');
  const normalized = Core.mergeEvents(first.events, [{ ...imported.events[0], orderId: ' 001 ', quality: 'estimated' }]);
  assert.equal(normalized.skipped, 1);
  assert.equal(normalized.events[0].quality, 'imported');
});

test('同 ID 任一财务字段冲突拒绝整批追加和整份 CSV，不改原状态', () => {
  const original = event('a', '2024-01-01', 'sale', 5000, '001');
  const existing = [original];
  const snapshot = structuredClone(existing);
  for (const change of [{ date: '2024-01-02' }, { type: 'tax' }, { amount: 5001 }, { orderId: '1' }, { currency: 'EUR' }]) {
    assert.throws(() => Core.mergeEvents(existing, [event('new', '2024-01-01', 'sale', 100, '002'), { ...original, ...change }]), /inconsistent financial fields/);
    assert.deepEqual(existing, snapshot);
  }
  const imported = Core.ingestCSV(csvHeader + [
    'good,2024-01-01,sale,1.00,001,USD',
    'conflict,2024-01-01,sale,50.00,001,USD',
    'conflict,2024-01-01,sale,51.00,001,USD'
  ].join('\n'), mapping);
  assert.deepEqual(imported.events, []);
  assert.equal(imported.issues[0].line, 4);
  assert.match(imported.issues[0].message, /inconsistent financial fields/);
  assert.doesNotMatch(imported.issues[0].message, /conflict|51\.00/);
});

const january = { start: '2024-01-01', end: '2024-01-31', asOf: '2024-01-31' };
const reviewedCosts = { goods: 1500, shipping: 650, packaging: 50, feesReviewed: true, quality: 'user_entered' };

function exampleEvents() {
  return [
    event('sale', '2024-01-15', 'sale', 5000, 'O-1'),
    event('transaction', '2024-01-15', 'fee', -325, 'O-1'),
    event('processing', '2024-01-15', 'fee', -187, 'O-1'),
    event('listing', '2024-01-15', 'fee', -20, 'O-1'),
    event('tax', '2024-01-15', 'tax', 400, 'O-1')
  ];
}

test('完整复核订单贡献利润使用精确分值且不扣代收税款', () => {
  const result = Core.analyze(exampleEvents(), { 'O-1': reviewedCosts }, january);
  assert.equal(result.cutoff, '2024-01-31');
  assert.equal(result.orders.length, 1);
  const order = result.orders[0];
  assert.equal(order.id, 'O-1');
  assert.equal(order.date, '2024-01-15');
  assert.equal(order.revenue, 5000);
  assert.equal(order.fees, 532);
  assert.equal(order.goods, 1500);
  assert.equal(order.shipping, 650);
  assert.equal(order.packaging, 50);
  assert.equal(order.knownBalance, 2268);
  assert.equal(order.profit, 2268);
  assert.equal(order.margin, 0.4536);
  assert.equal(order.status, 'ready');
  assert.deepEqual(order.missing, []);
  assert.deepEqual(order.sources, exampleEvents());
  assert.deepEqual(order.sourceCosts, reviewedCosts);
});

test('缺失成本和未复核手续费阻断利润，已知余额不冒充最终利润', () => {
  const missing = Core.analyze(exampleEvents(), {}, january).orders[0];
  assert.equal(missing.goods, null);
  assert.equal(missing.shipping, null);
  assert.equal(missing.packaging, null);
  assert.equal(missing.knownBalance, 4468);
  assert.equal(missing.profit, null);
  assert.equal(missing.margin, null);
  assert.equal(missing.status, 'incomplete');
  assert.deepEqual(missing.missing, ['Product cost', 'Shipping cost', 'Packaging cost', 'Direct fees review']);
  const feeUnreviewed = Core.analyze(exampleEvents(), { 'O-1': { ...reviewedCosts, feesReviewed: false } }, january).orders[0];
  assert.equal(feeUnreviewed.knownBalance, 2268);
  assert.equal(feeUnreviewed.profit, null);
  assert.deepEqual(feeUnreviewed.missing, ['Direct fees review']);
  const zero = Core.analyze([event('sale', '2024-01-01', 'sale', 5000, 'O-1')], { 'O-1': { goods: 0, shipping: 0, packaging: 0, feesReviewed: true } }, january).orders[0];
  assert.equal(zero.profit, 5000);
  assert.equal(zero.status, 'ready');
  const uncertain = Core.analyze([...exampleEvents(), event('unknown', '2024-01-16', 'unknown', 0, 'O-1')], { 'O-1': reviewedCosts }, january).orders[0];
  assert.equal(uncertain.knownBalance, 2268);
  assert.equal(uncertain.profit, null);
  assert.equal(uncertain.status, 'incomplete');
  assert.ok(uncertain.missing.includes('Unclassified events'));
});

test('实际运费和运费返还优先且不会与手填运费重复扣除，零运费事件不缺失', () => {
  const sources = [...exampleEvents(), event('ship', '2024-01-16', 'shipping', -700, 'O-1'), event('ship-credit', '2024-01-17', 'shipping_credit', 50, 'O-1')];
  const order = Core.analyze(sources, { 'O-1': { ...reviewedCosts, shipping: 9999 } }, january).orders[0];
  assert.equal(order.shipping, 650);
  assert.equal(order.profit, 2268);
  assert.equal(order.sourceCosts.shipping, 9999);
  assert.equal(order.sources.length, 7);
  const zero = Core.analyze([...exampleEvents(), event('ship-zero', '2024-01-16', 'shipping', 0, 'O-1')], { 'O-1': { ...reviewedCosts, shipping: null } }, january).orders[0];
  assert.equal(zero.shipping, 0);
  assert.equal(zero.profit, 2918);
  assert.deepEqual(zero.missing, []);
  const creditOnly = Core.analyze([...exampleEvents(), event('credit-only', '2024-01-16', 'shipping_credit', 100, 'O-1')], { 'O-1': { ...reviewedCosts, shipping: null } }, january).orders[0];
  assert.equal(creditOnly.shipping, -100);
  assert.equal(creditOnly.profit, 3018);
});

test('手续费返还和部分退款保留固定商品成本并标记调整', () => {
  const sources = [...exampleEvents(),
    event('refund', '2024-01-20', 'refund', -1000, 'O-1'),
    event('fee-credit', '2024-01-20', 'fee_credit', 100, 'O-1'),
    event('offsite', '2024-01-20', 'offsite_ad', -50, 'O-1')
  ];
  const order = Core.analyze(sources, { 'O-1': reviewedCosts }, january).orders[0];
  assert.equal(order.revenue, 4000);
  assert.equal(order.fees, 482);
  assert.equal(order.goods, 1500);
  assert.equal(order.profit, 1318);
  assert.equal(order.revenueRefundAmount, -1000);
  assert.equal(order.hasAdjustments, true);
  assert.match(order.adjustmentNote, /refunds.*not.*restore.*product costs/);
  assert.equal(Core.analyze(exampleEvents(), { 'O-1': reviewedCosts }, january).orders[0].hasAdjustments, false);
});

test('估算只沿用明确质量标记，不自动补造成本或宣称覆盖完整', () => {
  const estimatedCosts = Core.analyze(exampleEvents(), { 'O-1': { ...reviewedCosts, quality: 'estimated' } }, january).orders[0];
  assert.equal(estimatedCosts.status, 'estimated');
  assert.equal(estimatedCosts.profit, 2268);
  const estimatedEvents = [...exampleEvents(), event('estimate', '2024-01-16', 'fee', -10, 'O-1', { quality: 'estimated' })];
  const fromEvent = Core.analyze(estimatedEvents, { 'O-1': reviewedCosts }, january).orders[0];
  assert.equal(fromEvent.status, 'estimated');
  assert.equal(fromEvent.profit, 2258);
  const stillMissing = Core.analyze(estimatedEvents, { 'O-1': { quality: 'estimated' } }, january).orders[0];
  assert.equal(stillMissing.status, 'incomplete');
  assert.equal(stillMissing.profit, null);
  assert.equal(stillMissing.goods, null);
});

test('期间原始净额、已知经营净额与互斥桥接只汇总导入事件，不混入手填成本', () => {
  const result = Core.analyze(exampleEvents(), { 'O-1': reviewedCosts }, january);
  assert.deepEqual(result.period.events, exampleEvents());
  assert.equal(result.period.rawNet, 4868);
  assert.equal(result.period.sumAllSignedCents, 4868);
  assert.equal(result.period.operatingKnown, 4468);
  assert.equal(result.period.unassignedCount, 0);
  assert.equal(result.period.unassignedAmount, 0);
  assert.equal(result.period.unknownCount, 0);
  assert.equal(result.period.unknownAmount, 0);
  assert.equal(result.period.nonProfitAmount, 400);
  assert.equal(result.period.publicExpenseAmount, 0);
  assert.equal(result.period.categories.length, Core.EVENT_TYPES.length);
  assert.deepEqual(result.period.categories.find(category => category.type === 'fee'), { type: 'fee', label: Core.TYPE_LABELS.fee, amount: -532, count: 3 });
  assert.deepEqual(result.bridge.map(bucket => [bucket.key, bucket.amount, bucket.count]), [
    ['current_order', 4468, 4], ['previous_order', 0, 0], ['public', 0, 0], ['unresolved', 0, 0], ['non_profit', 400, 1]
  ]);
  assert.deepEqual(result.bridge.map(bucket => bucket.label), [
    'Current-period order transactions', 'Current-period adjustments to prior orders',
    'Shared period expenses', 'Unlinked or unclassified', 'Transactions excluded from profit'
  ]);
  assert.equal(result.bridge.reduce((sum, bucket) => sum + bucket.amount, 0), result.period.rawNet);
});

test('分析必须明确有效期间和不早于期末的截止日，不推断覆盖完整性', () => {
  for (const options of [
    undefined, { start: '2024-01-01', end: '2024-01-31' },
    { ...january, start: '2024-1-01' }, { ...january, end: '2024-02-30' },
    { ...january, start: '2024-02-01' }, { ...january, asOf: '2024-01-30' }
  ]) {
    assert.throws(() => Core.analyze(exampleEvents(), {}, options), /Date|Period|Cutoff/);
  }
  const empty = Core.analyze([], {}, january);
  assert.deepEqual(empty.orders, []);
  assert.equal(empty.period.rawNet, 0);
  assert.equal(empty.cutoff, '2024-01-31');
  assert.equal(Object.hasOwn(empty, 'coverageComplete'), false);
});

test('跨月退款按截止日更新原订单，期间流水只看事件日期且旧订单不混入本期订单表', () => {
  const events = [
    event('sale2', '2024-01-03', 'sale', 500, 'new'),
    event('old-sale', '2023-12-20', 'sale', 4000, 'old'),
    event('old-fee', '2024-01-05', 'fee', -200, 'old'),
    event('sale1', '2024-01-02', 'sale', 1000, 'new'),
    event('new-fee', '2024-01-03', 'fee', -100, 'new'),
    event('refund', '2024-02-02', 'refund', -300, 'new'),
    event('credit', '2024-02-02', 'fee_credit', 20, 'new'),
    event('future-sale', '2024-03-01', 'sale', 5000, 'future')
  ];
  const zeroCosts = { goods: 0, shipping: 0, packaging: 0, feesReviewed: true };
  const costs = { old: zeroCosts, new: zeroCosts };
  const initial = Core.analyze(events, costs, january);
  assert.deepEqual(initial.orders.map(order => [order.id, order.date, order.profit]), [['new', '2024-01-02', 1400]]);
  assert.deepEqual(initial.allOrders.map(order => order.id), ['old', 'new']);
  assert.equal(initial.period.rawNet, 1200);
  assert.equal(initial.bridge.find(bucket => bucket.key === 'previous_order').amount, -200);
  const adjusted = Core.analyze(events, costs, { ...january, asOf: '2024-02-29' });
  assert.equal(adjusted.orders[0].revenue, 1200);
  assert.equal(adjusted.orders[0].fees, 80);
  assert.equal(adjusted.orders[0].profit, 1120);
  assert.equal(adjusted.orders[0].hasAdjustments, true);
  assert.equal(adjusted.period.rawNet, 1200);
  assert.deepEqual(adjusted.period.events, initial.period.events);
  const february = Core.analyze(events, costs, { start: '2024-02-01', end: '2024-02-29', asOf: '2024-02-29' });
  assert.deepEqual(february.orders, []);
  assert.equal(february.period.rawNet, -280);
  assert.equal(february.bridge.find(bucket => bucket.key === 'previous_order').amount, -280);
});

test('互斥桥接先分非利润和未知，再用精确订单 ID 分类，公共费用不分摊', () => {
  const events = [
    event('old-sale', '2023-12-01', 'sale', 1000, 'old'),
    event('new-sale', '2024-01-10', 'sale', 1000, '001'),
    event('new-fee', '2024-01-10', 'fee', -100, '001'),
    event('old-refund', '2024-01-10', 'refund', -200, 'old'),
    event('ad', '2024-01-10', 'period_ad', -300),
    event('listing', '2024-01-10', 'listing', -20),
    event('expense', '2024-01-10', 'expense', -50),
    event('no-id', '2024-01-10', 'fee', -30),
    event('wrong-id', '2024-01-10', 'fee', -40, '1'),
    event('orphan-public', '2024-01-10', 'listing', -10, 'missing'),
    event('unknown', '2024-01-10', 'unknown', -60, '001'),
    event('tax', '2024-01-10', 'tax', 100, '001'),
    event('deposit', '2024-01-10', 'deposit', -400, '001'),
    event('reserve', '2024-01-10', 'reserve', 20),
    event('future-sale', '2024-02-01', 'sale', 1000, 'future'),
    event('future-linked', '2024-01-10', 'fee', -70, 'future')
  ];
  const result = Core.analyze(events, { '001': { goods: 0, shipping: 0, packaging: 0, feesReviewed: true } }, { ...january, asOf: '2024-02-29' });
  assert.deepEqual(result.orders.map(order => order.id), ['001']);
  assert.equal(result.orders[0].knownBalance, 900);
  assert.equal(result.orders[0].profit, null);
  assert.equal(result.period.rawNet, -160);
  assert.equal(result.period.operatingKnown, 180);
  assert.equal(result.period.publicExpenseAmount, 370);
  assert.equal(result.period.unassignedCount, 3);
  assert.equal(result.period.unassignedAmount, -80);
  assert.equal(result.period.unknownCount, 1);
  assert.equal(result.period.unknownAmount, -60);
  assert.equal(result.period.nonProfitAmount, -280);
  assert.deepEqual(result.bridge.map(bucket => [bucket.key, bucket.amount, bucket.count]), [
    ['current_order', 900, 2], ['previous_order', -200, 1], ['public', -370, 3], ['unresolved', -210, 5], ['non_profit', -280, 3]
  ]);
  assert.equal(result.bridge.reduce((sum, bucket) => sum + bucket.amount, 0), result.period.rawNet);
  assert.equal(result.bridge.reduce((sum, bucket) => sum + bucket.count, 0), result.period.events.length);
});

test('手填成本只允许安全的非负整数分，错误值不能参与订单利润', () => {
  for (const key of ['goods', 'shipping', 'packaging']) {
    for (const value of [-1, 1.5, '1500', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => Core.analyze(exampleEvents(), { 'O-1': { ...reviewedCosts, [key]: value } }, january), /costs|integer|cents/);
    }
  }
  assert.throws(() => Core.analyze(exampleEvents(), { 'O-1': { ...reviewedCosts, feesReviewed: 'true' } }, january), /review/);
  assert.throws(() => Core.analyze(exampleEvents(), { 'O-1': { ...reviewedCosts, quality: 'magic' } }, january), /quality/);
  const missing = Core.analyze(exampleEvents(), { 'O-1': { goods: null, shipping: null, packaging: null } }, january).orders[0];
  assert.equal(missing.profit, null);
});

test('直接分析或追加也拒绝无效分值和事件，不能绕过 CSV 校验', () => {
  for (const amount of [null, undefined, 12.34, '100', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const bad = event('bad', '2024-01-01', 'sale', amount, 'O-1');
    assert.throws(() => Core.mergeEvents([], [bad]), /amount|integer|cents/);
    assert.throws(() => Core.analyze([bad], {}, january), /amount|integer|cents/);
  }
  for (const change of [{ id: '' }, { date: '2024-02-30' }, { type: 'vendor type' }, { currency: 'EUR' }, { amount: -1 }, { orderId: 123 }]) {
    const bad = { ...event('bad', '2024-01-01', 'sale', 100), ...change };
    assert.throws(() => Core.mergeEvents([], [bad]));
    assert.throws(() => Core.analyze([bad], {}, january));
  }
  const padded = event(' e1 ', ' 2024-01-01 ', ' sale ', 100, ' 001 ', { currency: ' USD ' });
  const normalized = Core.mergeEvents([], [padded]).events[0];
  assert.deepEqual([normalized.id, normalized.date, normalized.type, normalized.orderId, normalized.currency], ['e1', '2024-01-01', 'sale', '001', 'USD']);
  assert.equal(padded.orderId, ' 001 ');
  const same = event('duplicate', '2024-01-01', 'sale', 1000, 'O-1');
  assert.equal(Core.analyze([same, { ...same }], {}, january).period.rawNet, 1000);
});

test('汇总和成本运算保持整数精度，超出安全范围时报错而不是四舍五入', () => {
  const max = Number.MAX_SAFE_INTEGER;
  assert.throws(() => Core.analyze([event('a', '2024-01-01', 'sale', max), event('b', '2024-01-01', 'sale', 1)], {}, january), /safe|range/);
  assert.throws(() => Core.analyze([event('sale', '2024-01-01', 'sale', 0, 'O')], { O: { goods: max, shipping: max, packaging: 0, feesReviewed: true } }, january), /safe|range/);
  const cancellation = Core.analyze([
    event('t1', '2024-01-01', 'tax', max), event('t2', '2024-01-01', 'tax', 2), event('t3', '2024-01-01', 'tax', -max)
  ], {}, january);
  assert.equal(cancellation.period.rawNet, 2);
  assert.equal(cancellation.period.nonProfitAmount, 2);
  assert.equal(cancellation.bridge.find(bucket => bucket.key === 'non_profit').amount, 2);
});

test('零或负收入不生成无意义利润率，退款不恢复成本', () => {
  for (const refund of [-1000, -1200]) {
    const result = Core.analyze([
      event('sale', '2024-01-01', 'sale', 1000, 'O'),
      event('refund', '2024-01-02', 'refund', refund, 'O')
    ], { O: { goods: 500, shipping: 100, packaging: 50, feesReviewed: true } }, january);
    const order = result.orders[0];
    assert.equal(order.revenue, 1000 + refund);
    assert.equal(order.profit, 1000 + refund - 650);
    assert.equal(order.margin, null);
    assert.equal(order.goods, 500);
    assert.equal(order.hasAdjustments, true);
  }
});

test('订单成本只读同名自有记录，原型继承不能伪造成已确认成本', () => {
  const events = ['constructor', '__proto__', 'toString', 'inherited'].map((id, index) => event('sale' + index, '2024-01-01', 'sale', 1000, id));
  const inherited = Object.create({ inherited: { goods: 0, shipping: 0, packaging: 0, feesReviewed: true } });
  const result = Core.analyze(events, inherited, january);
  assert.ok(result.orders.every(order => order.profit === null));
  assert.ok(result.orders.every(order => order.missing.length === 4));
  const explicit = JSON.parse('{"__proto__":{"goods":0,"shipping":0,"packaging":0,"feesReviewed":true}}');
  const confirmed = Core.analyze(events, explicit, january).orders.find(order => order.id === '__proto__');
  assert.equal(confirmed.profit, 1000);
});

test('无依赖 UMD 在无 Node 模块的浏览器环境提供同一 ProfitCore 接口与财务结果', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('./core.js'), 'utf8'), sandbox, { timeout: 1000 });
  assert.deepEqual(Object.keys(sandbox.ProfitCore).sort(), ['EVENT_TYPES', 'TYPE_LABELS', 'parseMoney', 'parseCSV', 'ingestCSV', 'mergeEvents', 'analyze'].sort());
  assert.deepEqual(Object.keys(sandbox.ProfitCore).sort(), Object.keys(Core).sort());
  assert.equal(sandbox.ProfitCore.parseMoney('(1.87)'), -187);
  const text = csvHeader + 'e,2024-01-01,sale,50.00,O-1,USD';
  const browserImport = sandbox.ProfitCore.ingestCSV(text, mapping);
  assert.deepEqual(JSON.parse(JSON.stringify(browserImport)), Core.ingestCSV(text, mapping));
  const browserResult = sandbox.ProfitCore.analyze(exampleEvents(), { 'O-1': reviewedCosts }, january);
  assert.deepEqual(JSON.parse(JSON.stringify(browserResult)), Core.analyze(exampleEvents(), { 'O-1': reviewedCosts }, january));
});

test('明确关联但不在订单成本公式中的费用不会被静默当作零或自动分摊', () => {
  for (const type of ['period_ad', 'listing', 'expense']) {
    const sources = [...exampleEvents(), event('linked', '2024-01-16', type, -100, 'O-1')];
    const result = Core.analyze(sources, { 'O-1': reviewedCosts }, january);
    assert.equal(result.orders[0].knownBalance, 2268);
    assert.equal(result.orders[0].profit, null);
    assert.ok(result.orders[0].missing.includes('Linked expense review'));
    assert.equal(result.period.operatingKnown, 4368);
    assert.equal(result.period.publicExpenseAmount, 0);
    assert.equal(result.bridge.find(bucket => bucket.key === 'current_order').amount, 4368);
  }
});
