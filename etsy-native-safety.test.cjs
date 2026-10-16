'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Etsy=require('./etsy.js');
const header='Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net\n';

test('公开历史口径允许源 Net 与 Amount 加费用不同，保留源净额并标记而非造税或拒绝',()=>{
  // 金额均为虚构 USD；结构来自公开税扣留例外，不据此推断实际税率。
  const result=Etsy.ingest(header+'10/2/26,Sale,Synthetic,No private data,USD,3.60,-0.34,2.66\n');
  assert.deepEqual(result.issues,[]);
  assert.equal(result.rows[0].amount,360);
  assert.equal(result.rows[0].feesTaxes,-34);
  assert.equal(result.rows[0].net,266);
  assert.equal(result.rows[0].arithmeticMismatch,true);
  assert.equal(result.summary.mismatchCount,1);
  assert.equal(result.summary.netTotal,266);
});

test('历史提现行三列全空保持未知，混合文件只报告已知小计，不推测提现金额',()=>{
  const mixed=Etsy.ingest(header+'10/2/26,Sale,,,USD,54.00,-5.87,48.13\n10/7/26,Deposit,Deposit of 999999.99,,USD,--,--,--\n');
  assert.deepEqual(mixed.issues,[]);
  assert.equal(mixed.rows.length,2);
  assert.equal(mixed.rows[1].net,null);
  assert.equal(mixed.rows[1].amount,null);
  assert.equal(mixed.rows[1].feesTaxes,null);
  assert.equal(mixed.summary.netTotal,4813);
  assert.equal(mixed.summary.knownNetCount,1);
  assert.equal(mixed.summary.missingNetCount,1);
  assert.equal(mixed.summary.categories.find(c=>c.key==='deposits').net,null);
  const empty=Etsy.ingest(header+'10/7/26,Deposit,,,USD,--,--,--\n');
  assert.equal(empty.summary.netTotal,null);
  assert.equal(empty.summary.feesTaxesTotal,null);
  assert.equal(empty.summary.missingNetCount,1);
  assert.equal(empty.summary.knownNetCount,0);
});

