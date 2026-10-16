(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'));
  } else {
    root.EtsyCSV = factory(root.ProfitCore);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';

  // 有界模拟配置：八列来自公开对账说明，不代表已验证所有 Etsy 现行导出版本。
  // 月结行仅用于期间对账，没有稳定事件 ID；主界面仅替换月结视图，不追加到订单事件账本。
  // Title、Info 和额外列仅由 CSV 解析器瞬时读取，不进入返回数据或错误信息。
  const HEADERS = Object.freeze(['Date', 'Type', 'Title', 'Info', 'Currency', 'Amount', 'Fees & Taxes', 'Net']);
  const PROFILE = Object.freeze({ id: 'etsy-monthly-en-usd-v1', name: 'Etsy monthly statement · English/USD 8-column historical profile (synthetic-tested)' });
  const LABELS = Object.freeze({
    sales: 'Sales row net', refunds: 'Refund row net', fees: 'Fee row net', marketing: 'Marketing row net',
    shipping: 'Shipping row net', tax: 'Tax row net', deposits: 'Deposit row net', payments: 'Payment row net',
    credits: 'Credit row net', reserves: 'Reserve row net', unknown: 'Unclassified row net'
  });

  function categoryOf(type) {
    if (type === 'sale' || type === 'sales') return 'sales';
    if (type === 'refund' || type === 'refunds') return 'refunds';
    if (type === 'fee' || type === 'fees') return 'fees';
    if (type === 'marketing') return 'marketing';
    if (type === 'shipping') return 'shipping';
    if (type === 'tax' || type === 'taxes') return 'tax';
    if (type === 'deposit' || type === 'deposits') return 'deposits';
    if (type === 'payment' || type === 'payments') return 'payments';
    if (type === 'credit' || type === 'credits') return 'credits';
    if (type === 'reserve' || type === 'reserves') return 'reserves';
    return 'unknown';
  }

  function money(value) {
    value = value.trim();
    if (!value || value === '-' || value === '--') return null;
    const parentheses = value[0] === '(' && value[value.length - 1] === ')';
    const body = parentheses ? value.slice(1, -1) : value;
    const match = /^([+-]?\$?|\$[+-]?)(\d+|[1-9]\d{0,2}(?:,\d{3})+)(\.\d{1,2})?$/.exec(body);
    if (!match || (parentheses && /[+-]/.test(match[1]))) {
      throw new Error('Invalid USD amount: use at most two decimal places and correctly grouped thousands');
    }
    const decimal = match[1].replace('$', '') + match[2].replace(/,/g, '') + (match[3] || '');
    return Core.parseMoney(parentheses ? '(' + decimal + ')' : decimal);
  }

  const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const FULL_MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

  function dateOf(value) {
    let match;
    let year;
    let month;
    let day;
    if ((match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value))) {
      [, year, month, day] = match;
    } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/.exec(value))) {
      [, month, day, year] = match;
      if (year.length === 2) year = '20' + year;
    } else {
      const monthFirst = /^([A-Za-z]+) (\d{1,2}), (\d{4})$/.exec(value);
      const dayFirst = /^(\d{1,2}) ([A-Za-z]+), (\d{4})$/.exec(value);
      match = monthFirst || dayFirst;
      if (!match) throw new Error('Date must use ISO, US month/day/year or a supported English date');
      const name = (monthFirst ? match[1] : match[2]).toLowerCase();
      const index = Math.max(MONTH_NAMES.indexOf(name), FULL_MONTH_NAMES.indexOf(name));
      if (index < 0) throw new Error('Invalid English month name');
      month = index + 1;
      day = monthFirst ? match[2] : match[1];
      year = match[3];
    }
    year = Number(year);
    month = Number(month);
    day = Number(day);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
      throw new Error('Date must be a valid calendar date');
    }
    return String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  function safeCents(total) {
    const limit = BigInt(Number.MAX_SAFE_INTEGER);
    if (total > limit || total < -limit) throw new Error('Total cents exceed the safe integer range; reduce the data or check amounts');
    return Number(total);
  }

  function sum(rows, key) {
    return safeCents(rows.reduce((total, row) => total + (row[key] === null ? 0n : BigInt(row[key])), 0n));
  }

  function summarize(rows) {
    const categories = Object.keys(LABELS).map(key => {
      const group = rows.filter(row => row.category === key);
      return { key, label: LABELS[key], count: group.length, net: group.some(row => row.net !== null) ? sum(group, 'net') : (group.length ? null : 0), missingNetCount: group.filter(row => row.net === null).length };
    });
    const unknown = categories.find(category => category.key === 'unknown');
    // Net 已含该行费用；Fees & Taxes 仅作解释，不再次扣除。
    return {
      profile: PROFILE, month: rows[0].date.slice(0, 7), rowCount: rows.length,
      netTotal: rows.some(row => row.net !== null) ? sum(rows, 'net') : null,
      feesTaxesTotal: rows.some(row => row.feesTaxes !== null) ? sum(rows, 'feesTaxes') : null,
      knownNetCount: rows.filter(row => row.net !== null).length,
      missingNetCount: rows.filter(row => row.net === null).length,
      mismatchCount: rows.filter(row => row.arithmeticMismatch).length,
      categories, unknownCount: unknown.count, unknownNet: unknown.net
    };
  }

  function validateInput(text) {
    if (typeof text !== 'string') throw new Error('Statement content must be CSV text');
    const limit = 2 * 1024 * 1024;
    const tooLarge = () => { throw new Error('Statement content must not exceed 2 MiB in UTF-8 bytes'); };
    if (text.length > limit) tooLarge();
    let bytes = 0;
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xD800 && code <= 0xDBFF && text.charCodeAt(i + 1) >= 0xDC00 && text.charCodeAt(i + 1) <= 0xDFFF) {
        bytes += 4;
        i += 1;
      } else bytes += 3;
      if (bytes > limit) tooLarge();
    }
  }

  function ingest(text, { sourceName = 'Etsy statement.csv' } = {}) {
    try {
      if (typeof sourceName !== 'string') throw new Error('Source filename must be text');
      validateInput(text);
      const parsed = Core.parseCSV(text);
      if (!parsed.rows.length) throw new Error('Statement must contain at least one data row');
      const headers = parsed.headers.map(header => header.trim());
      if (HEADERS.some(header => !headers.includes(header))) {
        throw new Error('This profile requires all eight exact, case-sensitive headers (outer whitespace is ignored)');
      }
      const columns = Object.fromEntries(HEADERS.map(header => [header, headers.indexOf(header)]));
      const rows = parsed.rows.map(record => {
        try {
          const get = header => record.values[columns[header]].trim();
          const type = get('Type').toLowerCase();
          if (get('Currency') !== 'USD') throw new Error('This profile supports explicit USD only; currency must not be blank or mixed');
          const net = money(get('Net'));
          const amount = money(get('Amount'));
          const feesTaxes = money(get('Fees & Taxes'));
          // 公开历史例外：代扣税可能不在费用列，提现三列可能全空；不能按等式强制重算。
          const arithmeticMismatch = net !== null && amount !== null && feesTaxes !== null && BigInt(amount) + BigInt(feesTaxes) !== BigInt(net);
          return {
            date: dateOf(get('Date')), type, category: categoryOf(type), amount,
            feesTaxes, net, arithmeticMismatch, currency: get('Currency'),
            source: { file: sourceName, line: record.line }
          };
        } catch (error) {
          error.line = record.line;
          throw error;
        }
      });
      for (const row of rows) {
        if (row.date.slice(0, 7) !== rows[0].date.slice(0, 7)) {
          const error = new Error('This monthly-statement profile requires all rows to belong to one calendar month');
          error.line = row.source.line;
          throw error;
        }
      }
      return { rows, summary: summarize(rows), issues: [] };
    } catch (error) {
      return { rows: [], summary: null, issues: [{ line: error.line || 1, message: error.message }] };
    }
  }

  return { HEADERS, ingest };
}));
