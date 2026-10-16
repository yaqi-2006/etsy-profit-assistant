(function (root) {
  'use strict';
  // 合成数据仅验证模型与交互，不模拟当前平台费率或真实店铺表现。
  const rows = [
    ['s-old','2026-09-28','sale','60.00','EP-0901'],
    ['f-old','2026-09-28','fee','-4.60','EP-0901'],
    ['sh-old','2026-09-28','shipping','-7.00','EP-0901'],
    ['s-1','2026-10-02','sale','50.00','EP-1001'],
    ['t-1','2026-10-02','tax','4.00','EP-1001'],
    ['f-1a','2026-10-02','fee','-3.25','EP-1001'],
    ['f-1b','2026-10-02','fee','-1.87','EP-1001'],
    ['f-1c','2026-10-02','fee','-0.20','EP-1001'],
    ['sh-1','2026-10-02','shipping','-6.50','EP-1001'],
    ['s-2','2026-10-04','sale','30.00','EP-1002'],
    ['f-2','2026-10-04','fee','-2.95','EP-1002'],
    ['s-3','2026-10-06','sale','18.00','EP-1003'],
    ['f-3','2026-10-06','fee','-1.57','EP-1003'],
    ['a-3','2026-10-06','offsite_ad','-2.70','EP-1003'],
    ['sh-3','2026-10-06','shipping','-8.50','EP-1003'],
    ['s-4','2026-10-08','sale','40.00','EP-1004'],
    ['f-4','2026-10-08','fee','-3.40','EP-1004'],
    ['sh-4','2026-10-08','shipping','-5.00','EP-1004'],
    ['s-5','2026-10-09','sale','25.00','EP-1005'],
    ['f-5','2026-10-09','fee','-2.63','EP-1005'],
    ['sh-5','2026-10-09','shipping','-4.00','EP-1005'],
    ['u-5','2026-10-09','unknown','-0.80','EP-1005'],
    ['r-old','2026-10-10','refund','-15.00','EP-0901'],
    ['c-old','2026-10-10','fee_credit','0.98','EP-0901'],
    ['r-4','2026-10-15','refund','-20.00','EP-1004'],
    ['c-4','2026-10-15','fee_credit','1.30','EP-1004'],
    ['p-ad','2026-10-18','period_ad','-9.00',''],
    ['p-list','2026-10-18','listing','-0.60',''],
    ['p-exp','2026-10-18','expense','-2.00',''],
    ['orphan-fee','2026-10-19','fee','-1.10','EP-NOT-IMPORTED'],
    ['u-period','2026-10-19','unknown','-1.20',''],
    ['p-deposit','2026-10-20','deposit','-75.00',''],
    ['p-reserve','2026-10-20','reserve','-10.00',''],
    ['r-next','2026-11-03','refund','-5.00','EP-1001']
  ];
  function create() {
    return {
      events: rows.map((r, i) => ({id:r[0],date:r[1],type:r[2],amount:ProfitCore.parseMoney(r[3]),orderId:r[4],currency:'USD',quality:'estimated',source:{file:'Synthetic demo (not an actual Etsy export)',line:i+2}})),
      costs: {
        'EP-0901':{goods:2000,shipping:null,packaging:60,feesReviewed:true,quality:'estimated'},
        'EP-1001':{goods:1500,shipping:null,packaging:50,feesReviewed:true,quality:'estimated'},
        'EP-1002':{goods:1200,shipping:null,packaging:null,feesReviewed:false,quality:'estimated'},
        'EP-1003':{goods:700,shipping:null,packaging:50,feesReviewed:true,quality:'estimated'},
        'EP-1004':{goods:1200,shipping:null,packaging:50,feesReviewed:true,quality:'estimated'},
        'EP-1005':{goods:800,shipping:null,packaging:50,feesReviewed:true,quality:'estimated'}
      }
    };
  }
  function template() { return 'event_id,date,type,amount,order_id,currency\r\n'+rows.map(r=>r.join(',')+',USD').join('\r\n')+'\r\n'; }
  // 表头参照公开月结单格式；所有日期、描述及金额均为刻意编造的测试数据。
  function etsyTemplate(){
    return 'Date,Type,Title,Info,Currency,Amount,Fees & Taxes,Net\r\n'+[
      ['10/2/26','Sale','Synthetic sale','Synthetic sample only','USD','54.00','-5.87','48.13'],
      ['10/2/26','Fee','Synthetic transaction fee','','USD','--','-3.25','-3.25'],
      ['10/3/26','Shipping','Synthetic label','','USD','--','-6.50','-6.50'],
      ['10/4/26','Marketing','Synthetic ads','','USD','--','-9.00','-9.00'],
      ['10/5/26','Refund','Synthetic partial refund','','USD','-10.00','0.50','-9.50'],
      ['10/6/26','Tax','Synthetic tax flow','','USD','--','-4.00','-4.00'],
      ['10/7/26','Deposit','Synthetic transfer','','USD','--','--','--'],
      ['10/8/26','Unrecognized adjustment','Synthetic unknown','','USD','-1.20','--','-1.20'],
      ['10/9/26','Fee','Synthetic listing fee','','USD','--','-0.20','-0.20'],
      ['10/9/26','Fee','Synthetic listing fee','','USD','--','-0.20','-0.20']
    ].map(r=>r.join(',')).join('\r\n')+'\r\n';
  }
  root.ProfitDemo={create,template,etsyTemplate};
})(globalThis);
