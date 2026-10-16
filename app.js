(function () {
  'use strict';
  const C = globalThis.ProfitCore;
  const $ = id => document.getElementById(id);
  const state = {
    events: [],
    costs: Object.create(null),
    mode: 'empty',
    batches: [],
    preview: null,
    activeOrder: null,
    result: null,
    range: null,
    previewGeneration: 0,
    native: null
  };

  const labels = {
    sale: 'Seller revenue',
    refund: 'Revenue refunds',
    fee: 'Direct platform fees',
    fee_credit: 'Platform fee credits',
    offsite_ad: 'Linked Offsite Ads',
    shipping: 'Actual shipping costs',
    shipping_credit: 'Shipping credits',
    period_ad: 'Period Etsy Ads',
    listing: 'Listing fees',
    expense: 'Other period expenses',
    tax: 'Tax cash flows',
    deposit: 'Payout cash flows',
    reserve: 'Reserve cash flows',
    unknown: 'Unclassified events'
  };

  const profitTypes = new Set([
    'sale', 'refund', 'fee', 'fee_credit', 'offsite_ad',
    'shipping', 'shipping_credit', 'period_ad', 'listing', 'expense'
  ]);

  // 金额文本仍按整数分拆分，避免安全整数上限附近经浮点除法丢一分。
  const decimal = cents => {
    const n = BigInt(cents);
    const a = n < 0n ? -n : n;
    return (n < 0n ? '-' : '') + (a / 100n).toString() + '.' + (a % 100n).toString().padStart(2, '0');
  };

  const money = cents => {
    if (cents === null || cents === undefined) return 'Unknown';
    const n = BigInt(cents);
    const a = n < 0n ? -n : n;
    return (n < 0n ? '-' : '') + '$' + (a / 100n).toLocaleString('en-US') + '.' + (a % 100n).toString().padStart(2, '0');
  };

  const amountInput = v => (v === null || v === undefined ? '' : decimal(v));
  const qualityLabel = q => (q === 'estimated' ? 'Estimated / synthetic' : q === 'user_entered' ? 'User-entered' : q === 'imported' ? 'Imported record' : 'No basis provided');
  const statusLabel = s => (s === 'incomplete' ? 'Needs inputs' : s === 'estimated' ? 'Estimated contribution' : 'Inputs complete');

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function append(parent, ...nodes) {
    parent.append(...nodes);
    return parent;
  }

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $('toast').classList.add('hidden'), 6500);
  }

  function dayValid(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    return !Number.isNaN(Date.parse(s)) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  }

  function range() {
    const r = {
      start: $('start-date').value,
      end: $('end-date').value,
      asOf: $('asof-date').value
    };
    if (![r.start, r.end, r.asOf].every(dayValid) || r.start > r.end || r.asOf < r.end) {
      throw new Error('Use valid dates: start date must be on or before end date, and end date on or before the as-of date.');
    }
    return r;
  }

  function resetImport() {
    state.previewGeneration += 1;
    state.preview = null;
    $('mapping-area').classList.add('hidden');
    $('csv-text').value = '';
    $('csv-file').value = '';
    $('file-name').textContent = 'No file selected';
    $('confirm-import').checked = false;
    $('invert-signs').checked = false;
  }

  function loadDemo() {
    if ((state.events.length || state.native) && !confirm('Reloading the demo will replace all current events and entered costs. Continue?')) {
      return;
    }
    const d = ProfitDemo.create();
    state.native = null;
    state.events = d.events;
    state.costs = Object.assign(Object.create(null), d.costs);
    state.mode = 'demo';
    state.batches = ['Synthetic demo'];
    $('start-date').value = '2026-10-01';
    $('end-date').value = '2026-10-31';
    $('asof-date').value = '2026-10-31';
    resetImport();
    render();
    toast('Synthetic demo loaded. These are not actual shop results.');
  }

  function clearData() {
    if (!state.events.length && !state.native && !state.preview && !$('csv-text').value && !$('csv-file').files.length) {
      return;
    }
    if (!confirm('Clear all current events, entered costs and import previews? Unsaved results cannot be restored.')) {
      return;
    }
    state.events = [];
    state.native = null;
    state.costs = Object.create(null);
    state.mode = 'empty';
    state.batches = [];
    state.activeOrder = null;
    $('order-dialog').close();
    resetImport();
    render();
    toast('Session cleared. No persistent browser copy was saved.');
  }

  function kpi(label, value, note, cls) {
    return append(
      el('div', 'kpi ' + (cls || '')),
      el('span', 'kpi-label', label),
      el('strong', 'kpi-value', value),
      el('small', 'kpi-note', note)
    );
  }

  function render() {
    $('native-view').classList.toggle('hidden', !state.native);
    $('generic-view').classList.toggle('hidden', !!state.native);
    $('range-panel').classList.toggle('hidden', !!state.native);

    if (state.native) {
      renderNative();
      return;
    }

    $('export-report').textContent = 'Orders CSV';
    let validRange;
    try {
      validRange = range();
    } catch (e) {
      validRange = state.range;
      if (!validRange) {
        toast(e.message);
        return;
      }
      $('start-date').value = validRange.start;
      $('end-date').value = validRange.end;
      $('asof-date').value = validRange.asOf;
      toast(e.message);
    }

    try {
      state.result = C.analyze(state.events, state.costs, validRange);
      state.range = validRange;
    } catch (e) {
      toast(e.message);
      return;
    }

    const { orders, period, bridge } = state.result;
    $('export-report').disabled = !state.events.length;
    $('export-full').disabled = !state.events.length;
    $('clear-data').disabled = !state.events.length;

    const prefix = state.mode === 'demo' ? 'Synthetic demo' : state.mode === 'imported' ? 'Imported data (coverage unverified)' : 'No data loaded';
    $('dataset-label').textContent = prefix + ' · ' + state.events.length + ' events · ' + state.batches.length + ' source batches';
    $('dataset-warning').textContent = state.mode === 'demo' ? 'Synthetic demo — not your shop results.' : state.mode === 'imported' ? 'Using your selected event data. Source coverage and native Etsy CSV compatibility are unverified.' : 'No data loaded. Try the synthetic demo to explore the workflow.';

    const r = state.range;
    $('range-label').textContent = r.start + ' to ' + r.end + ' · Adjustments known as of ' + r.asOf + ' · Model V0.1 · One USD ledger';

    const missing = orders.filter(o => o.status === 'incomplete').length;
    const available = orders.filter(o => o.profit !== null);
    const allOrderRevenue = orders.reduce((s, o) => s + BigInt(o.revenue), 0n);

    $('subnav-generic')?.classList.toggle('hidden', !!state.native);
    $('subnav-native')?.classList.toggle('hidden', !state.native);

    $('kpi-grid').replaceChildren(
      kpi('Orders needing inputs', String(missing), 'Of ' + orders.length + ' orders; no contribution shown when required inputs are missing', 'kpi-warning'),
      kpi('Unlinked events', String(period.unassignedCount || 0), money(period.unassignedAmount || 0) + ' · Not allocated to orders'),
      kpi('Unclassified events', String(period.unknownCount || 0), money(period.unknownAmount || 0) + ' · Signed net amount'),
      kpi('Calculable orders', String(available.length), money(allOrderRevenue) + ' revenue across ALL orders, net of refunds — not profit', 'kpi-muted')
    );

    $('health-notice').replaceChildren(
      el('span', '', state.events.length ? (missing || period.unknownCount || period.unassignedCount ? 'Missing inputs, unclassified or unlinked events remain. The amounts below are not a complete business profit figure.' : 'Current inputs are calculable, but source coverage is unverified. Shared period expenses and business overhead are not included in order contribution.') : 'No data yet. Load the demo or import a generic event CSV.')
    );

    renderOrders(orders);

    const categories = (period.categories || []).filter(c => c.count > 0);
    $('category-list').replaceChildren(
      ...categories.map(c => append(
        el('div', 'category-item'),
        append(el('div'), el('span', '', labels[c.type] || c.label || c.type), el('small', 'muted', ' · ' + c.count + ' events')),
        el('strong', 'numeric ' + (c.amount < 0 ? 'negative' : ''), money(c.amount))
      ))
    );
    if (!categories.length) {
      $('category-list').append(el('div', 'empty-state', 'No events in this period.'));
    }

    $('period-summary').textContent = 'Known operating-event net: ' + money(period.operatingKnown) + '. Excludes unclassified events and does not deduct entered product, packaging or other missing costs. Non-profit cash-flow net: ' + money(period.nonProfitAmount) + '. Shared period expenses: ' + money(period.publicExpenseAmount) + '.';

    const largest = Math.max(1, ...bridge.map(b => Math.abs(b.amount)));
    $('bridge-list').replaceChildren(
      ...bridge.map(b => {
        const bar = el('div', 'bridge-bar');
        const span = el('span');
        span.style.width = (Math.abs(b.amount) / largest * 100) + '%';
        bar.append(span);
        return append(
          el('div', 'bridge-item'),
          append(el('div'), el('span', '', b.label), el('small', 'muted', ' ' + b.count + ' events')),
          el('strong', 'numeric ' + (b.amount < 0 ? 'negative' : ''), money(b.amount)),
          bar
        );
      })
    );

    const bridgeTotal = bridge.reduce((s, b) => s + BigInt(b.amount), 0n);
    $('bridge-summary').textContent = 'Bucket total ' + money(bridgeTotal) + ' = imported event net ' + money(period.rawNet) + '. This is arithmetic within the imported source, not a balance reconciliation, available payout or net profit.';

    renderExceptions(period);
  }

  function renderNative() {
    $('subnav-generic')?.classList.toggle('hidden', true);
    $('subnav-native')?.classList.toggle('hidden', false);
    const { rows, summary, synthetic } = state.native;
    const partial = (summary.missingNetCount || 0) > 0;
    $('export-report').textContent = 'Statement CSV';
    $('export-report').disabled = false;
    $('export-full').disabled = false;
    $('clear-data').disabled = false;

    $('dataset-label').textContent = (synthetic ? 'Synthetic Etsy-format sample' : 'Etsy statement import (coverage unverified)') + ' · ' + rows.length + ' rows · ' + summary.month;
    $('dataset-warning').textContent = synthetic ? 'Synthetic Etsy-format sample — not a real shop export.' : 'Native-format statement loaded. This schema profile is simulated-tested, not verified with a real shop export.';
    $('native-meta').textContent = summary.month + ' · ' + summary.profile.name + ' · USD · One file; rows within one calendar month; coverage unverified';

    $('native-kpis').replaceChildren(
      kpi('Source rows', String(rows.length), 'All rows retained, including identical-looking entries'),
      kpi(partial ? 'Known Net subtotal' : 'Imported Net total', money(summary.netTotal), 'Missing Net: ' + (summary.missingNetCount || 0) + ' rows; arithmetic flags: ' + (summary.mismatchCount || 0) + '. Not profit', 'kpi-muted'),
      kpi('Known Fees & Taxes', money(summary.feesTaxesTotal), 'Missing: ' + rows.filter(r => r.feesTaxes === null).length + ' rows. Explanatory only; not deducted again'),
      kpi('Unclassified rows', String(summary.unknownCount), money(summary.unknownNet) + ' · Review source categories', 'kpi-warning')
    );

    const labelMap = new Map(summary.categories.map(c => [c.key, c.label]));
    $('native-categories').replaceChildren(
      ...summary.categories.filter(c => c.count > 0).map(c => append(
        el('div', 'category-item'),
        append(el('div'), el('span', '', c.label), el('small', 'muted', ' · ' + c.count + ' rows; ' + (c.missingNetCount || 0) + ' unknown Net')),
        el('strong', 'numeric ' + (c.net < 0 ? 'negative' : ''), money(c.net))
      ))
    );

    $('native-rows').replaceChildren(
      ...rows.slice(0, 100).map(r => append(
        el('tr'),
        el('td', '', r.date),
        el('td', '', r.type),
        el('td', '', labelMap.get(r.category) + (r.arithmeticMismatch ? ' · Arithmetic flag' : '')),
        el('td', 'numeric', money(r.amount)),
        el('td', 'numeric', money(r.feesTaxes)),
        el('td', 'numeric ' + (r.net < 0 ? 'negative' : ''), money(r.net)),
        el('td', 'mono', r.source.file + ' / ' + r.source.line)
      ))
    );
  }

  function setNative(result, synthetic) {
    state.events = [];
    state.costs = Object.create(null);
    state.native = { rows: result.rows, summary: result.summary, synthetic };
    state.mode = 'native';
    state.result = null;
    state.activeOrder = null;
    state.batches = [];
    $('order-dialog').close();
    resetImport();
    render();
  }

  function loadNativeDemo() {
    try {
      const result = EtsyCSV.ingest(ProfitDemo.etsyTemplate(), { sourceName: 'Synthetic Etsy-format sample' });
      if (result.issues.length) throw new Error(result.issues[0].message);
      if ((state.events.length || state.native) && !confirm('Load the Etsy-format sample and replace all session data and entered costs?')) {
        return;
      }
      setNative(result, true);
      toast('Synthetic native-format sample loaded. Net is counted once, not turned into order profit.');
    } catch (e) {
      toast(e.message);
    }
  }

  function exportNative(full) {
    const { rows, summary, synthetic } = state.native;
    const labelMap = new Map(summary.categories.map(c => [c.key, c.label]));
    const basis = synthetic ? 'Synthetic Etsy-format sample' : 'User-selected monthly statement (coverage unverified)';
    const head = ['Date', 'Source type', 'Category', 'Currency', 'Amount USD', 'Fees and taxes USD', 'Net USD', 'Source file', 'Source line', 'Arithmetic flag'];
    const data = rows.map(r => [
      r.date, r.type, labelMap.get(r.category), r.currency,
      ...[r.amount, r.feesTaxes, r.net].map(v => (v === null ? '' : decimal(v))),
      r.source.file, r.source.line,
      r.arithmeticMismatch ? 'Review amount / fees / Net relationship' : 'None'
    ]);

    if (!full) {
      download('etsy-statement-mapped.csv', 'text/csv;charset=utf-8', [
        ['Data basis', 'Schema profile', ...head].map(csvCell).join(','),
        ...data.map(r => [basis, summary.profile.id, ...r].map((v, i) => (i >= 6 && i <= 8 && v !== '' ? v : csvCell(v))).join(','))
      ].join('\r\n'));
      toast('Mapped statement rows exported. Known Net is source account effect, not profit.');
      return;
    }

    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const table = (h, rs) => '<table><thead><tr>' + h.map(v => '<th>' + esc(v) + '</th>').join('') + '</tr></thead><tbody>' + rs.map(r => '<tr>' + r.map(v => '<td>' + esc(v === '' ? 'Unknown' : v) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';

    const body = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>Etsy monthly statement · Source-net report</title><style>body{font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:1300px;margin:28px auto;padding:24px;color:#18231f;background:#f9f8f4;border:1px solid #ded8cb;border-radius:12px;box-shadow:0 4px 18px rgba(12,35,26,0.05)}h1{font-family:Charter,"Newsreader",Georgia,serif;font-size:26px;color:#0d2c22;margin-bottom:8px}h2{font-family:Charter,"Newsreader",Georgia,serif;font-size:19px;color:#1b4f40;margin-top:32px}.disclaimer{padding:14px 18px;border:1px solid #e6d2ab;border-radius:8px;background:#fcf5e6;color:#8e5f12;margin:18px 0;font-size:13px}table{border-collapse:collapse;display:block;overflow:auto;width:100%;margin:14px 0 20px;background:#ffffff;border:1px solid #ded8cb;border-radius:8px}th,td{padding:10px 14px;border:1px solid #ede8dc;text-align:left;overflow-wrap:anywhere;font-size:12.5px}th{background:#f1f7f4;color:#1b4f40;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em}p{max-width:92ch;line-height:1.6}</style><h1>Etsy monthly statement · Source-net report</h1><p>' + esc(basis + ' · ' + summary.profile.name + ' · ' + summary.month) + '</p><div class="disclaimer"><p>Each known source Net is counted once. Missing Net stays unknown, and arithmetic discrepancies are flagged without rewriting source amounts. Fees &amp; Taxes is explanatory and is not subtracted again. This is not seller revenue before fees, order contribution, available payout, a balance reconciliation or business net profit. Product costs and overhead are absent. The profile was tested with synthetic data, not a real shop export. Arithmetic flags can reflect unitemized tax and do not by themselves prove an Etsy error. Imports replace the session; no native row identity is invented. Title, Info and extra personal fields are not retained.</p></div><p>' + esc('Source rows ' + rows.length + '; known Net subtotal ' + money(summary.netTotal) + '; missing Net rows ' + (summary.missingNetCount || 0) + '; arithmetic flags ' + (summary.mismatchCount || 0) + '; known Fees & Taxes ' + money(summary.feesTaxesTotal) + ' (' + rows.filter(r => r.feesTaxes === null).length + ' missing rows); unclassified ' + summary.unknownCount + ' rows ' + money(summary.unknownNet)) + '</p><h2>Categories · known signed Net subtotals</h2>' + table(['Category', 'Rows', 'Known Net subtotal USD', 'Missing Net rows'], summary.categories.filter(c => c.count > 0).map(c => [c.label, c.count, c.net === null ? 'Unknown' : decimal(c.net), c.missingNetCount || 0])) + '<h2>Mapped source rows</h2>' + table(head, data) + '<p><small>Unknown is not zero. This static report has no scripts or remote resources and is not a restorable session backup.</small></p></html>';
    download('etsy-statement-report.html', 'text/html;charset=utf-8', body);
    toast('Statement report exported with source rows and explicit simulation limits.');
  }

  function renderOrders(orders) {
    const filter = $('order-filter').value;
    const list = orders.filter(o => filter === 'all' || (filter === 'incomplete' && o.status === 'incomplete') || (filter === 'negative' && o.profit !== null && o.profit < 0) || (filter === 'available' && o.profit !== null));
    const body = $('orders-body');
    body.replaceChildren();

    for (const o of list) {
      const row = el('tr', 'order-row');
      const identity = append(
        el('td', 'order-identity-cell'),
        el('strong', 'mono order-id-badge', o.id),
        el('small', 'muted order-date-text', o.date)
      );

      const status = append(
        el('td', 'order-status-cell'),
        el('span', 'status-badge status-' + o.status, statusLabel(o.status)),
        el('small', 'muted', o.missing.length ? o.missing.join(' / ') : o.hasAdjustments ? 'Includes refunds or credits; product cost not automatically reversed' : 'Direct fee scope confirmed')
      );

      const contribution = append(
        el('td', 'numeric order-contrib-cell'),
        el('strong', o.profit !== null && o.profit < 0 ? 'negative' : '', o.profit === null ? 'Needs inputs' : money(o.profit)),
        el('small', 'muted', o.profit === null ? 'Known remainder ' + money(o.knownBalance) : o.margin === null ? 'Non-positive revenue; no margin shown' : (o.margin * 100).toFixed(2) + '%')
      );

      const button = el('button', 'btn btn-secondary btn-small', 'Details / costs');
      button.type = 'button';
      button.dataset.order = o.id;
      button.addEventListener('click', () => openOrder(o.id));

      append(
        row,
        identity,
        el('td', 'numeric', money(o.revenue)),
        el('td', 'numeric', money(o.fees)),
        status,
        contribution,
        append(el('td', 'order-action-cell'), button)
      );
      body.append(row);
    }

    if (!list.length) {
      const td = el('td', 'empty-state', orders.length ? 'No orders match this filter.' : 'No sale orders in this range. Orphan events remain in the period view.');
      td.colSpan = 6;
      body.append(append(el('tr'), td));
    }
  }

  function sourceRow(event) {
    const row = el('div', 'source-item');
    append(
      row,
      append(
        el('div'),
        el('strong', '', labels[event.type] || event.type),
        el('small', 'muted', event.date + ' · ' + (event.orderId || 'No linked order') + ' · ' + qualityLabel(event.quality))
      ),
      el('strong', 'numeric ' + (event.amount < 0 ? 'negative' : ''), money(event.amount)),
      el('small', 'muted mono', 'ID ' + event.id + ' · ' + event.source.file + ' / line ' + event.source.line)
    );
    return row;
  }

  function renderExceptions(period) {
    const all = state.result.allOrders || state.result.orders;
    const dates = new Map(all.map(o => [o.id, o.date]));
    const r = state.range;
    const items = period.events.filter(e => e.type === 'unknown' || ['tax', 'deposit', 'reserve'].includes(e.type) || (e.orderId && !dates.has(e.orderId)) || (e.orderId && dates.get(e.orderId) < r.start) || (!e.orderId && profitTypes.has(e.type)));

    $('exceptions-list').replaceChildren(...items.slice(0, 100).map(sourceRow));
    if (!items.length) {
      $('exceptions-list').append(el('p', 'empty-state', 'No such events in this period. This does not prove the source is complete.'));
    }
    if (items.length > 100) {
      $('exceptions-list').append(el('p', 'muted', 'Showing the first 100 of ' + items.length + ' events. All events are included in the calculations.'));
    }
  }

  function openOrder(id) {
    state.activeOrder = id;
    const o = state.result.orders.find(x => x.id === id);
    if (!o) return;

    const costs = state.costs[id] || {};
    const sources = o.sources || [];
    const actualShipping = sources.some(e => ['shipping', 'shipping_credit'].includes(e.type));
    $('detail-title').textContent = id + ' · ' + statusLabel(o.status);

    const grid = el('div', 'detail-grid');
    for (const [label, value] of [
      ['Seller revenue, net of refunds', money(o.revenue)],
      ['Known direct platform fees', money(o.fees)],
      ['Total product cost', money(o.goods)],
      ['Actual shipping cost', money(o.shipping)],
      ['Packaging / other direct costs', money(o.packaging)],
      ['Order contribution', o.profit === null ? 'Needs inputs' : money(o.profit)]
    ]) {
      grid.append(append(el('div', 'detail-cell'), el('span', 'muted', label), el('strong', '', value)));
    }

    const note = el('div', 'notice notice-warning', o.missing.length ? 'Missing or unresolved: ' + o.missing.join(', ') + '. Known remainder ' + money(o.knownBalance) + ' is not profit.' : 'Required cost inputs and direct fee scope are complete. Shared period expenses, overhead and income tax are still excluded.');

    const ledger = el('details', 'detail-ledger-disclosure');
    const ledgerSummary = el('summary', 'detail-ledger-summary');
    append(
      ledgerSummary,
      append(
        el('div', 'detail-ledger-summary-copy'),
        el('strong', '', 'Audit linked source events (' + sources.length + ' records)'),
        el('small', 'muted', 'Known as of ' + state.range.asOf + ' · Click to inspect line items')
      ),
      el('span', 'disclosure-chevron', '›')
    );
    const ledgerBody = el('div', 'detail-ledger-body');
    ledgerBody.append(el('h3', '', 'Source amounts (known as of ' + state.range.asOf + ')'), ...sources.map(sourceRow));
    append(ledger, ledgerSummary, ledgerBody);

    const basisText = 'Product / packaging cost basis: ' + qualityLabel(costs.quality) + '. Shipping basis: ' + (actualShipping ? 'Linked shipping events; see audited records' : qualityLabel(costs.quality)) + '. Confirm which materials and labor are covered by your total product cost.' + (o.hasAdjustments ? ' Note: later refunds or fee adjustments retained; product cost not automatically reversed.' : '');

    $('detail-content').replaceChildren(
      grid,
      note,
      ledger,
      el('p', 'detail-note', basisText)
    );

    for (const key of ['goods', 'shipping', 'packaging']) {
      $('cost-' + key).value = amountInput(costs[key]);
    }
    $('cost-shipping').disabled = actualShipping;
    if (actualShipping) $('cost-shipping').value = '';
    $('shipping-hint').textContent = actualShipping ? 'Using linked shipping events; entered shipping is not added again. To correct source records, clear the session and reimport a corrected file.' : 'No linked shipping record. Enter the actual total shipping cost. Use 0 only if you have confirmed there was no shipping cost.';

    $('fees-reviewed').checked = !!costs.feesReviewed;
    $('cost-quality').value = costs.quality === 'estimated' ? 'estimated' : 'user_entered';
    if (!$('order-dialog').open) $('order-dialog').showModal();
  }

  function saveCost(e) {
    e.preventDefault();
    try {
      const id = state.activeOrder;
      if (!id) return;
      const values = {};
      for (const key of ['goods', 'shipping', 'packaging']) {
        values[key] = $('cost-' + key).disabled ? ((state.costs[id] || {})[key] ?? null) : C.parseMoney($('cost-' + key).value);
        if (values[key] !== null && values[key] < 0) {
          throw new Error('Enter non-negative USD costs. Leave unknown values blank.');
        }
      }
      values.feesReviewed = $('fees-reviewed').checked;
      values.quality = $('cost-quality').value;
      const nextCosts = Object.assign(Object.create(null), state.costs);
      nextCosts[id] = values;
      C.analyze(state.events, nextCosts, state.range);
      state.costs = nextCosts;
      render();
      openOrder(id);
      toast('Order costs updated in this in-memory session.');
    } catch (err) {
      toast(err.message);
    }
  }

  async function previewCSV() {
    const generation = ++state.previewGeneration;
    state.preview = null;
    $('mapping-area').classList.add('hidden');

    try {
      const format = $('import-format').value;
      const file = $('csv-file').files[0];
      let text = $('csv-text').value;
      let name = 'Pasted CSV';

      if (file) {
        if (file.size > 2 * 1024 * 1024) {
          throw new Error('File limit: 2 MB. Split the anonymized financial data into smaller files.');
        }
        text = await file.text();
        if (generation !== state.previewGeneration) return;
        name = file.name;
      }

      if (new TextEncoder().encode(text).length > 2 * 1024 * 1024) {
        throw new Error('Text exceeds 2 MB.');
      }
      if (!text.trim()) {
        throw new Error('Choose a file or paste a CSV first.');
      }

      const parsed = C.parseCSV(text);
      if (!parsed.rows.length) {
        throw new Error('The CSV has headers but no events.');
      }

      const headers = parsed.headers.map(h => h.trim());
      const native = format === 'etsy' || (format === 'auto' && EtsyCSV.HEADERS.every(h => headers.includes(h)));

      $('mapping-fields').replaceChildren();
      $('invert-label').classList.toggle('hidden', native);
      $('invert-signs').checked = false;

      if (native) {
        const result = EtsyCSV.ingest(text, { sourceName: name });
        if (result.issues.length) {
          throw new Error(result.issues.map(x => 'Line ' + x.line + ': ' + x.message).join('; '));
        }
        state.preview = { kind: 'native', result, name };
        $('csv-preview').textContent = 'Detected Etsy monthly statement · ' + result.summary.month + ' · ' + result.rows.length + ' rows. No column mapping required. Known Net subtotal ' + money(result.summary.netTotal) + '. Missing Net: ' + (result.summary.missingNetCount || 0) + ' rows; arithmetic flags: ' + (result.summary.mismatchCount || 0) + '.';
        $('confirm-import-label').textContent = 'I understand this replaces ALL session data and costs. This is one shop, one USD calendar-month statement; results are source-net summaries, not order profit.';
        $('import-method-note').textContent = 'English/USD 8-column historical profile; synthetic tests only. Every row is retained, even if it looks duplicated. No row ID or order association is invented. Blank amounts stay unknown; source Net is never recalculated.';
        $('commit-csv').textContent = 'Replace session with statement';
      } else {
        if (format === 'auto' && !['event_id', 'date', 'type', 'amount'].every(h => headers.includes(h))) {
          throw new Error('Format not recognized. Only the English/USD monthly-statement profile or generic event CSV is supported. Choose a format to see its validation error.');
        }
        state.preview = { kind: 'generic', text, name, parsed };
        $('csv-preview').textContent = parsed.headers.length + ' columns · ' + parsed.rows.length + ' rows. Only headers are previewed; unmapped personal fields are not displayed.';

        const fields = [
          ['id', 'Stable event ID *', 'event_id'],
          ['date', 'Posting date *', 'date'],
          ['type', 'Standard event type *', 'type'],
          ['amount', 'Signed USD amount *', 'amount'],
          ['orderId', 'Order ID (optional)', 'order_id'],
          ['currency', 'Currency (defaults to USD if unmapped)', 'currency']
        ];

        $('mapping-fields').replaceChildren(
          ...fields.map(([key, label, guess]) => {
            const select = el('select');
            select.id = 'map-' + key;
            select.name = key;
            select.append(new Option('Select column / leave unmapped', ''));
            for (const h of parsed.headers) select.append(new Option(h, h));
            if (parsed.headers.includes(guess)) select.value = guess;
            return append(el('label', 'field'), document.createTextNode(label), select);
          })
        );

        $('confirm-import-label').textContent = 'I checked event types and signs. This is one ledger, with no double-counting of net totals and itemized entries.';
        $('import-method-note').textContent = 'Generic events deduplicate by stable event ID; any financial conflict rejects the batch. Clear synthetic or native-statement data before appending generic events.';
        $('commit-csv').textContent = 'Confirm and append events';
      }

      $('mapping-area').classList.remove('hidden');
      $('confirm-import').checked = false;
      toast(native ? 'Statement ready. Review the scope and confirm replacement.' : 'Headers ready. Review the mapping and event types before importing.');
    } catch (err) {
      if (generation !== state.previewGeneration) return;
      state.preview = null;
      $('mapping-area').classList.add('hidden');
      toast(err.message);
    }
  }

  function commitCSV() {
    try {
      if (!state.preview) throw new Error('Read the CSV headers first.');
      if (!$('confirm-import').checked) throw new Error('Confirm the preview scope before importing.');

      if (state.preview.kind === 'native') {
        const next = state.preview.result;
        if ((state.events.length || state.native) && !confirm('Replace all current session data and entered costs with this statement? No rows will be appended.')) {
          return;
        }
        setNative(next, false);
        toast('Statement loaded as one replacement file. Source Net counted once.');
        return;
      }

      if (state.native) throw new Error('Clear the native statement before importing generic events.');
      if (state.mode === 'demo' && state.events.length) throw new Error('Do not mix synthetic and shop data. Clear the session, then reimport.');

      const mapping = {};
      for (const k of ['id', 'date', 'type', 'amount', 'orderId', 'currency']) {
        mapping[k] = $('map-' + k).value;
      }

      const { events, issues } = C.ingestCSV(state.preview.text, mapping, { sourceName: state.preview.name, invert: $('invert-signs').checked });
      if (issues.length) {
        throw new Error(issues.slice(0, 5).map(x => (x.line ? 'Line ' + x.line + ': ' : '') + x.message).join('; ') + (issues.length > 5 ? '; ' + (issues.length - 5) + ' more issues. Nothing was imported.' : ''));
      }

      const merged = C.mergeEvents(state.events, events);
      if (merged.events.length > 5000) {
        throw new Error('Session limit: 5,000 events. Nothing was appended. Clear the session to analyze a smaller range.');
      }

      const nextRange = range();
      C.analyze(merged.events, state.costs, nextRange);
      state.events = merged.events;
      state.mode = 'imported';
      if (merged.added) state.batches.push(state.preview.name);
      resetImport();
      render();
      toast('Added ' + merged.added + ' events; skipped ' + merged.skipped + ' duplicate stable IDs.');
    } catch (err) {
      toast(err.message);
    }
  }

  function csvCell(v) {
    const s = String(v ?? '');
    const protectedValue = /^[\s]*[=+\-@\t\r]/.test(s) ? "'" + s : s;
    return '"' + protectedValue.replace(/"/g, '""') + '"';
  }

  function download(name, type, body) {
    const url = URL.createObjectURL(new Blob(['\ufeff', body], { type }));
    const a = el('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportReport() {
    if (state.native) {
      exportNative(false);
      return;
    }
    if (!state.events.length) return;

    const r = state.range;
    const header = [
      'Model version', 'Data basis', 'Period start', 'Period end', 'Adjustments as of',
      'Order ID', 'Order date', 'Seller revenue net of refunds USD', 'Known direct platform fees USD',
      'Product cost USD', 'Shipping cost USD', 'Packaging and direct costs USD', 'Contribution USD',
      'Known remainder USD', 'Status', 'Missing inputs', 'Limitations'
    ];
    const numeric = new Set([7, 8, 9, 10, 11, 12, 13]);
    const rows = state.result.orders.map(o => [
      '0.1', state.mode === 'demo' ? 'Synthetic demo' : 'User import (coverage unverified)',
      r.start, r.end, r.asOf, o.id, o.date,
      ...[o.revenue, o.fees, o.goods, o.shipping, o.packaging, o.profit, o.knownBalance].map(v => (v === null ? '' : decimal(v))),
      statusLabel(o.status), o.missing.join(' / '),
      'Not business net profit; excludes shared period expenses, unclassified events and overhead'
    ]);

    const text = [
      header.map(csvCell).join(','),
      ...rows.map(row => row.map((v, i) => (numeric.has(i) && v !== '' ? v : csvCell(v))).join(','))
    ].join('\r\n');

    download('etsy-contribution-report.csv', 'text/csv;charset=utf-8', text);
    toast('Order report exported. Blank values remain unknown. This is not a session backup.');
  }

  function exportFull() {
    if (state.native) {
      exportNative(true);
      return;
    }
    if (!state.events.length) return;

    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const table = (head, rows) => '<table><thead><tr>' + head.map(x => '<th>' + esc(x) + '</th>').join('') + '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(x => '<td>' + esc(x) + '</td>').join('') + '</tr>').join('') + '</tbody></table>';

    const r = state.range;
    const { orders, period, bridge } = state.result;
    const orderTable = table(
      ['Order', 'Sale date', 'Revenue net of refunds', 'Direct platform fees', 'Product cost', 'Actual shipping', 'Packaging cost', 'Contribution', 'Completeness / missing inputs'],
      orders.map(o => [
        o.id, o.date, money(o.revenue), money(o.fees), money(o.goods), money(o.shipping), money(o.packaging),
        o.profit === null ? 'Unknown' : money(o.profit),
        statusLabel(o.status) + (o.missing.length ? ': ' + o.missing.join(', ') : '')
      ])
    );
    const bridgeTable = table(['Source-net bucket', 'Events', 'Amount'], bridge.map(b => [b.label, b.count, money(b.amount)]));
    const categoryTable = table(['Event type', 'Events', 'Amount'], period.categories.filter(c => c.count > 0).map(c => [labels[c.type] || c.label, c.count, money(c.amount)]));
    const eventTable = table(['Posting date', 'Event ID', 'Type', 'Order ID', 'Amount', 'Source', 'Basis'], period.events.map(e => [e.date, e.id, labels[e.type] || e.type, e.orderId || 'Unlinked', money(e.amount), e.source.file + ' / line ' + e.source.line, qualityLabel(e.quality)]));
    const orderSources = table(['Order', 'Source event IDs through as-of date', 'Entered product / packaging cost basis'], orders.map(o => [o.id, o.sources.map(e => e.id).join(', '), qualityLabel((state.costs[o.id] || {}).quality)]));

    const html = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>Etsy Profit Assistant · Static report</title><style>body{font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#18231f;background:#f9f8f4;max-width:1300px;margin:28px auto;padding:24px;border:1px solid #ded8cb;border-radius:12px;box-shadow:0 4px 18px rgba(12,35,26,0.05)}h1{font-family:Charter,"Newsreader",Georgia,serif;font-size:26px;color:#0d2c22;margin-bottom:8px}h2{font-family:Charter,"Newsreader",Georgia,serif;font-size:19px;color:#1b4f40;margin-top:32px}.warning{padding:14px 18px;border:1px solid #e6d2ab;border-radius:8px;background:#fcf5e6;color:#8e5f12;margin:18px 0}table{border-collapse:collapse;width:100%;background:#ffffff;display:block;overflow:auto;margin:14px 0 20px;border:1px solid #ded8cb;border-radius:8px}th,td{padding:10px 14px;border-bottom:1px solid #ede8dc;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;min-width:85px;font-size:12.5px}th{background:#f1f7f4;color:#1b4f40;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em}small{color:#64736b}</style><h1>Etsy Profit Assistant · Static analysis report</h1><p>' + esc(r.start + ' to ' + r.end + '; adjustments known as of ' + r.asOf + '; model V0.1; USD') + '</p><div class="warning"><strong>' + esc(state.mode === 'demo' ? 'Synthetic demo — not actual shop results.' : 'User-selected event data. Source coverage and native Etsy CSV compatibility are unverified.') + '</strong><p>This is not business net profit, a reconciled balance or a tax report. Order contribution excludes shared period expenses and overhead. Unknown is not zero. This is not a restorable session backup.</p></div><h2>Completeness</h2><p>' + esc('Needs inputs: ' + orders.filter(o => o.profit === null).length + ' / ' + orders.length + ' orders; unlinked: ' + period.unassignedCount + ' events ' + money(period.unassignedAmount) + '; unclassified: ' + period.unknownCount + ' events ' + money(period.unknownAmount)) + '</p><h2>Order contribution</h2>' + orderTable + '<h2>Period event categories</h2>' + categoryTable + '<p>' + esc('Known operating-event net ' + money(period.operatingKnown) + ' before entered costs; imported event net ' + money(period.rawNet) + ' includes non-profit cash flows.') + '</p><h2>Source-net bridge</h2>' + bridgeTable + '<h2>Order source index</h2>' + orderSources + '<h2>Source events in this period (mapped fields only)</h2>' + eventTable + '<p><small>Static local report with no scripts or remote resources. Dates come from events, not import time. Later adjustments do not silently restate earlier periods.</small></p></html>';
    download('etsy-analysis-report.html', 'text/html;charset=utf-8', html);
    toast('Static report exported with period categories, bridge, orders and sources.');
  }

  $('export-full').addEventListener('click', exportFull);
  $('load-etsy-demo').addEventListener('click', loadNativeDemo);
  $('download-etsy-template').addEventListener('click', () => download('synthetic-etsy-statement.csv', 'text/csv;charset=utf-8', ProfitDemo.etsyTemplate()));
  $('import-format').addEventListener('change', () => {
    state.previewGeneration += 1;
    state.preview = null;
    $('mapping-area').classList.add('hidden');
  });
  $('load-demo').addEventListener('click', loadDemo);
  $('clear-data').addEventListener('click', clearData);
  $('preview-csv').addEventListener('click', previewCSV);
  $('commit-csv').addEventListener('click', commitCSV);
  $('export-report').addEventListener('click', exportReport);
  $('download-template').addEventListener('click', () => download('synthetic-events-template.csv', 'text/csv;charset=utf-8', ProfitDemo.template()));
  $('period-form').addEventListener('submit', e => {
    e.preventDefault();
    render();
  });
  $('order-filter').addEventListener('change', () => {
    if (state.result) renderOrders(state.result.orders);
  });
  $('cost-form').addEventListener('submit', saveCost);
  $('close-dialog').addEventListener('click', () => $('order-dialog').close());
  $('cancel-cost').addEventListener('click', () => $('order-dialog').close());
  $('choose-file').addEventListener('click', () => $('csv-file').click());
  $('csv-file').addEventListener('change', () => {
    $('file-name').textContent = $('csv-file').files[0]?.name || 'No file selected';
    state.previewGeneration += 1;
    state.preview = null;
    $('mapping-area').classList.add('hidden');
  });
  $('csv-text').addEventListener('input', () => {
    state.previewGeneration += 1;
    state.preview = null;
    $('mapping-area').classList.add('hidden');
  });

  // 默认立即显示标明合成的案例，减少空白页；所有变更只在内存中。
  loadDemo();
})();
