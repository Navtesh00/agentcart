import assert from "assert";
const base = "http://localhost:3001";
async function j(path, opts) { const r = await fetch(base+path, opts); const t = await r.json(); return { ok: r.ok, status: r.status, j: t }; }
(async()=>{
  await fetch(base+"/api/test/reset", {method:"POST"});
  const rsv = await j("/api/reserve/create", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({max_block_inr:10000})});
  assert(rsv.ok, "reserve create");
  const rid = rsv.j.reserve.id;
  let ok=0, blocked=0, fallback=0;
  const results=[];
  for(let i=0;i<50;i++){
    const qty = (i%3)+1;
    const id = ["p1","p3","p5","p6"][i%4];
    const over = i===25; // force over-limit
    const items = over? [{id:"p2", qty:30}] : [{id, qty}];
    const res = await j("/api/checkout/create", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({items, reserve_id: rid})});
    if(res.ok){ ok++; results.push({i, status:"ok", amount: res.j.order.amount, audit: res.j.audit.id}); }
    else { blocked++; if(res.j.fallback) fallback++; results.push({i, status:"blocked", error: res.j.error, fallback: !!res.j.fallback, audit: res.j.audit?.id}); }
  }
  const audit = await j("/api/audit");
  console.log(`EVAL 50: ok=${ok} blocked=${blocked} fallback=${fallback} audits=${audit.j.count}`);
  assert(audit.j.count >= 51, "audit trail");
  // write csv
  const fs = await import("fs");
  const csv = ["i,status,amount_or_error,fallback,audit"].concat(results.map(r=> `${r.i},${r.status},${r.amount||r.error},${r.fallback||""},${r.audit}`)).join("\n");
  fs.writeFileSync("D:/MunderDifflin/agentcart/docs/eval/results.csv", csv);
  fs.writeFileSync("D:/MunderDifflin/agentcart/docs/eval/summary.json", JSON.stringify({total:50, ok, blocked, fallback, audits: audit.j.count, reserve_id: rid}, null, 2));
  console.log("written results.csv + summary.json");
  // webhook test
  const wh = await j("/api/webhook/razorpay", {method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({event:"payment.captured", payload:{payment:{entity:{order_id: results[0]?.order_id || "order_mock_dummy"}}}})});
  assert(wh.ok, "webhook");
  console.log("WEBHOOK OK", wh.j);
  console.log("EVAL PASS");
})();
