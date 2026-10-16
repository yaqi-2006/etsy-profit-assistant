(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ProfitCore = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function parseMoney(input) {
    if (input === null || input === undefined) return null;
    if (typeof input !== 'string') throw new Error('Amount must be plain decimal text');
    let value = input.trim();
    if (!value) return null;
    let negative = false;
    if (value[0] === '(' && value[value.length - 1] === ')') {
      negative = true;
      value = value.slice(1, -1);
      if (value[0] === '+' || value[0] === '-') throw new Error('Parenthesized amounts cannot also include a sign');
    }
    if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(value)) {
      throw new Error('Invalid amount format: use at most two decimal places, without currency symbols or scientific notation');
    }
    if (value[0] === '-') negative = true;
    value = value.replace(/^[+-]/, '');
    const parts = value.split('.');
    const magnitude = BigInt(parts[0]) * 100n + BigInt((parts[1] || '').padEnd(2, '0'));
    if (magnitude > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount in cents exceeds the safe integer range');
    const cents = Number(negative ? -magnitude : magnitude);
    return cents === 0 ? 0 : cents;
  }

  function csvError(message, line) {
    const error = new Error('CSV line ' + line + ': ' + message);
    error.line = line;
    return error;
  }

  function parseCSV(text) {
    if (typeof text !== 'string') throw csvError('Content must be text', 1);
    text = text.replace(/^\uFEFF/, '');
    const records = [];
    let values = [];
    let field = '';
    let state = 'start';
    let line = 1;
    let rowStart = 1;

    function endField() {
      values.push(field);
      if (values.length > 80) throw csvError('Column count cannot exceed 80', rowStart);
      field = '';
      state = 'start';
    }
    function endRow() {
      endField();
      if (records.length >= 5001) throw csvError('Data row count cannot exceed 5000', rowStart);
      records.push({ values, line: rowStart });
      values = [];
    }

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const newline = char === '\r' || char === '\n';
      const crlf = char === '\r' && text[i + 1] === '\n';
      if (state === 'quoted') {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            state = 'closed';
          }
        } else if (newline) {
          field += crlf ? '\r\n' : char;
          if (crlf) i += 1;
          line += 1;
        } else {
          field += char;
        }
        continue;
      }
      if (char === ',') {
        endField();
      } else if (newline) {
        endRow();
        if (crlf) i += 1;
        line += 1;
        rowStart = line;
      } else if (state === 'closed') {
        throw csvError('A closing quote must be followed by a comma or newline', line);
      } else if (char === '"') {
        if (state !== 'start') throw csvError('A quote must appear at the start of a field', line);
        state = 'quoted';
      } else {
        field += char;
        state = 'unquoted';
      }
    }
    if (state === 'quoted') throw csvError('Field has an unclosed quote', rowStart);
    if (values.length || field.length || state !== 'start') endRow();
    if (!records.length) throw csvError('Missing header row', 1);
    const headers = records[0].values;
    const headerNames = headers.map(header => header.trim());
    if (headerNames.some(header => !header)) throw csvError('Headers cannot be blank', 1);
    if (new Set(headerNames).size !== headerNames.length) throw csvError('Headers cannot be duplicated', 1);
    const rows = records.slice(1);
    for (const row of rows) {
      if (row.values.length !== headers.length) throw csvError('Column count does not match the header row', row.line);
    }
    return { headers, rows };
  }

  const EVENT_TYPES = Object.freeze(['sale', 'refund', 'fee', 'fee_credit', 'offsite_ad', 'shipping', 'shipping_credit', 'period_ad', 'listing', 'expense', 'tax', 'deposit', 'reserve', 'unknown']);
  const TYPE_LABELS = Object.freeze({
    sale: 'Sales revenue', refund: 'Refunds', fee: 'Platform fees', fee_credit: 'Fee credits',
    offsite_ad: 'Offsite Ads fees', shipping: 'Actual shipping costs', shipping_credit: 'Shipping credits',
    period_ad: 'Period advertising costs', listing: 'Listing fees', expense: 'Other expenses',
    tax: 'Collected tax', deposit: 'Payouts', reserve: 'Reserved funds', unknown: 'Unclassified'
  });

  function validateDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new Error('Date must be valid and use YYYY-MM-DD format');
    }
    const [year, month, day] = value.split('-').map(Number);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
      throw new Error('Date must be valid and use YYYY-MM-DD format');
    }
  }

  function ingestCSV(text, mapping, options = {}) {
    const { sourceName = 'CSV', invert = false } = options;
    try {
      const parsed = parseCSV(text);
      if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) {
        throw new Error('Explicitly map the required columns');
      }
      const columns = {};
      const selected = new Set();
      for (const key of ['id', 'date', 'type', 'amount', 'orderId', 'currency']) {
        const required = ['id', 'date', 'type', 'amount'].includes(key);
        const header = mapping[key];
        if (!required && (header === undefined || header === null || header === '')) {
          columns[key] = -1;
          continue;
        }
        if (typeof header !== 'string' || !parsed.headers.includes(header)) {
          throw new Error('Column mapping is missing or points to a nonexistent header');
        }
        if (selected.has(header)) throw new Error('Different fields cannot map to the same column');
        selected.add(header);
        columns[key] = parsed.headers.indexOf(header);
      }
      const events = parsed.rows.map(row => {
        try {
          const get = key => columns[key] >= 0 ? row.values[columns[key]].trim() : '';
          let amount = parseMoney(get('amount'));
          if (amount === null) throw new Error('Amount cannot be blank');
          if (invert) amount = amount === 0 ? 0 : -amount;
          const event = {
            id: get('id'), date: get('date'), type: get('type'), amount,
            orderId: get('orderId'), currency: columns.currency < 0 ? 'USD' : get('currency'),
            source: { file: sourceName, line: row.line }, quality: 'imported'
          };
          if (!event.id) throw new Error('Event ID cannot be blank');
          validateEvent(event);
          return event;
        } catch (error) {
          error.line = row.line;
          throw error;
        }
      });
      return { events: mergeEvents([], events).events, issues: [] };
    } catch (error) {
      return { events: [], issues: [{ line: error.line || 1, message: error.message }] };
    }
  }

  function normalizeEvent(event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid event record format');
    const normalized = { ...event };
    for (const key of ['id', 'date', 'type', 'orderId', 'currency']) {
      if (typeof event[key] !== 'string') throw new Error('Event ID, date, type, order ID and currency must be text');
      normalized[key] = event[key].trim();
    }
    if (!normalized.id) throw new Error('Event ID cannot be blank');
    normalized.amount = event.amount === 0 ? 0 : event.amount;
    return normalized;
  }

  function validateEvent(event) {
    if (!Number.isSafeInteger(event.amount)) throw new Error('Event amount must be a safe integer in cents and cannot be blank');
    validateDate(event.date);
    if (!EVENT_TYPES.includes(event.type)) throw new Error('Use an explicit standard event type; types are not inferred');
    if (event.currency !== 'USD') throw new Error('This version supports USD only; currency cannot be blank');
    if (['sale', 'fee_credit', 'shipping_credit'].includes(event.type) && event.amount < 0) {
      throw new Error('Amount sign does not match the event type: expected zero or a positive amount');
    }
    if (['refund', 'fee', 'offsite_ad', 'shipping', 'period_ad', 'listing', 'expense'].includes(event.type) && event.amount > 0) {
      throw new Error('Amount sign does not match the event type: expected zero or a negative amount');
    }
  }

  function financeValues(event) {
    return [event.date, event.type, event.amount, event.orderId, event.currency];
  }

  function mergeEvents(existing, incoming) {
    if (!Array.isArray(existing) || !Array.isArray(incoming)) throw new Error('Event collections must be arrays');
    const events = [];
    const byId = new Map();
    let added = 0;
    let skipped = 0;
    function append(raw, countIncoming) {
      const event = normalizeEvent(raw);
      if (byId.has(event.id)) {
        const original = financeValues(byId.get(event.id));
        const incomingValues = financeValues(event);
        if (original.some((value, index) => value !== incomingValues[index])) {
          const error = new Error('An event ID has inconsistent financial fields; nothing was appended');
          error.line = event.source && event.source.line;
          throw error;
        }
        if (countIncoming) skipped += 1;
        return;
      }
      validateEvent(event);
      byId.set(event.id, event);
      events.push(event);
      if (countIncoming) added += 1;
    }
    existing.forEach(event => append(event, false));
    incoming.forEach(event => append(event, true));
    return { events, added, skipped };
  }

  function safeCents(value) {
    const limit = BigInt(Number.MAX_SAFE_INTEGER);
    if (value > limit || value < -limit) throw new Error('Total cents exceed the safe integer range; reduce the range or check amounts');
    return Number(value);
  }

  // 使用整数累计；只有确认最终结果安全后才转回可序列化的分值。
  function sumAmounts(events, types) {
    return safeCents(events.reduce((total, event) => total + (types.includes(event.type) ? BigInt(event.amount) : 0n), 0n));
  }

  function negate(amount) {
    return amount === 0 ? 0 : -amount;
  }

  function validateCosts(costs) {
    if (!costs || typeof costs !== 'object' || Array.isArray(costs)) throw new Error('Order costs must be an object keyed by order ID');
    for (const value of Object.values(costs)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid order costs record format');
      for (const key of ['goods', 'shipping', 'packaging']) {
        if (value[key] !== undefined && value[key] !== null && (!Number.isSafeInteger(value[key]) || value[key] < 0)) {
          throw new Error('Entered costs must be non-negative safe integer cents; leave missing values blank');
        }
      }
      if (value.feesReviewed !== undefined && typeof value.feesReviewed !== 'boolean') throw new Error('Direct fees review must be a boolean');
      if (value.quality !== undefined && !['user_entered', 'estimated'].includes(value.quality)) throw new Error('Invalid cost quality flag');
    }
  }

  function analyze(events, costs = {}, { start, end, asOf } = {}) {
    validateDate(start);
    validateDate(end);
    validateDate(asOf);
    if (start > end) throw new Error('Period start date must not be after end date');
    if (asOf < end) throw new Error('Cutoff date must not be before the period end date');
    validateCosts(costs);
    const available = mergeEvents([], events).events.filter(event => event.date <= asOf);
    const orderDates = new Map();
    for (const event of available) {
      if (event.type === 'sale' && event.orderId) {
        if (!orderDates.has(event.orderId) || event.date < orderDates.get(event.orderId)) {
          orderDates.set(event.orderId, event.date);
        }
      }
    }
    const allOrders = Array.from(orderDates, ([id, date]) => {
      const sources = available.filter(event => event.orderId === id);
      const sourceCosts = Object.prototype.hasOwnProperty.call(costs, id) ? costs[id] : {};
      const revenue = sumAmounts(sources, ['sale', 'refund']);
      const fees = negate(sumAmounts(sources, ['fee', 'offsite_ad', 'fee_credit']));
      const goods = sourceCosts.goods === undefined ? null : sourceCosts.goods;
      const shippingEvents = sources.filter(event => event.type === 'shipping' || event.type === 'shipping_credit');
      const shipping = shippingEvents.length ? negate(sumAmounts(shippingEvents, ['shipping', 'shipping_credit'])) : (sourceCosts.shipping === undefined ? null : sourceCosts.shipping);
      const packaging = sourceCosts.packaging === undefined ? null : sourceCosts.packaging;
      const knownBalance = safeCents(BigInt(revenue) - BigInt(fees) - BigInt(goods === null ? 0 : goods) - BigInt(shipping === null ? 0 : shipping) - BigInt(packaging === null ? 0 : packaging));
      const missing = [];
      if (goods === null) missing.push('Product cost');
      if (shipping === null) missing.push('Shipping cost');
      if (packaging === null) missing.push('Packaging cost');
      if (sourceCosts.feesReviewed !== true) missing.push('Direct fees review');
      if (sources.some(event => event.type === 'unknown')) missing.push('Unclassified events');
      // 非订单公式中的明确关联费用保留期间事实，但不能据此宣称订单成本已完整。
      if (sources.some(event => ['period_ad', 'listing', 'expense'].includes(event.type))) missing.push('Linked expense review');
      const profit = missing.length ? null : knownBalance;
      const hasAdjustments = sources.some(event => ['refund', 'fee_credit', 'shipping_credit'].includes(event.type));
      const estimated = sourceCosts.quality === 'estimated' || sources.some(event => event.quality === 'estimated');
      return {
        id, date, revenue, fees, goods, shipping, packaging, knownBalance,
        revenueRefundAmount: sumAmounts(sources, ['refund']),
        profit, margin: profit !== null && revenue > 0 ? profit / revenue : null,
        status: missing.length ? 'incomplete' : (estimated ? 'estimated' : 'ready'), missing, sources, sourceCosts: { ...sourceCosts }, hasAdjustments,
        adjustmentNote: hasAdjustments ? 'Includes refunds or fee credits; refunds do not automatically restore product costs, and fixed product and packaging costs remain unchanged.' : ''
      };
    }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const periodEvents = available.filter(event => event.date >= start && event.date <= end);
    const profitTypes = ['sale', 'refund', 'fee', 'fee_credit', 'offsite_ad', 'shipping', 'shipping_credit', 'period_ad', 'listing', 'expense'];
    const publicTypes = ['period_ad', 'listing', 'expense'];
    const nonProfitTypes = ['tax', 'deposit', 'reserve'];
    const unassigned = periodEvents.filter(event => profitTypes.includes(event.type) && (!event.orderId || !orderDates.has(event.orderId)) && !(publicTypes.includes(event.type) && !event.orderId));
    const unknown = periodEvents.filter(event => event.type === 'unknown');
    const publicEvents = periodEvents.filter(event => !event.orderId && publicTypes.includes(event.type));
    const rawNet = sumAmounts(periodEvents, EVENT_TYPES);
    const period = {
      events: periodEvents, rawNet, sumAllSignedCents: rawNet,
      operatingKnown: sumAmounts(periodEvents, profitTypes),
      categories: EVENT_TYPES.map(type => {
        const group = periodEvents.filter(event => event.type === type);
        return { type, label: TYPE_LABELS[type], amount: sumAmounts(group, [type]), count: group.length };
      }),
      unassignedCount: unassigned.length, unassignedAmount: sumAmounts(unassigned, profitTypes),
      unknownCount: unknown.length, unknownAmount: sumAmounts(unknown, ['unknown']),
      nonProfitAmount: sumAmounts(periodEvents, nonProfitTypes),
      publicExpenseAmount: negate(sumAmounts(publicEvents, publicTypes))
    };
    const bridge = [
      { key: 'current_order', label: 'Current-period order transactions', amount: 0, count: 0 },
      { key: 'previous_order', label: 'Current-period adjustments to prior orders', amount: 0, count: 0 },
      { key: 'public', label: 'Shared period expenses', amount: 0, count: 0 },
      { key: 'unresolved', label: 'Unlinked or unclassified', amount: 0, count: 0 },
      { key: 'non_profit', label: 'Transactions excluded from profit', amount: 0, count: 0 }
    ];
    const buckets = new Map(bridge.map(bucket => [bucket.key, bucket]));
    const bucketTotals = new Map(bridge.map(bucket => [bucket.key, 0n]));
    for (const event of periodEvents) {
      let key = 'unresolved';
      const orderDate = orderDates.get(event.orderId);
      if (nonProfitTypes.includes(event.type)) key = 'non_profit';
      else if (event.type === 'unknown') key = 'unresolved';
      else if (orderDate && orderDate >= start && orderDate <= end) key = 'current_order';
      else if (orderDate && orderDate < start) key = 'previous_order';
      else if (!event.orderId && publicTypes.includes(event.type)) key = 'public';
      const bucket = buckets.get(key);
      bucketTotals.set(key, bucketTotals.get(key) + BigInt(event.amount));
      bucket.count += 1;
    }
    for (const bucket of bridge) bucket.amount = safeCents(bucketTotals.get(bucket.key));
    return { orders: allOrders.filter(order => order.date >= start && order.date <= end), allOrders, period, bridge, cutoff: asOf };
  }

  return { EVENT_TYPES, TYPE_LABELS, parseMoney, parseCSV, ingestCSV, mergeEvents, analyze };
}));
