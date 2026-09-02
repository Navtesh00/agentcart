import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  const [catalog, setCatalog] = useState([]);
  const [cart, setCart] = useState([]);
  const [reserve, setReserve] = useState(null);
  const [audit, setAudit] = useState([]);
  const [orders, setOrders] = useState([]);
  const [msg, setMsg] = useState("");

  const load = async () => {
    const c = await fetch('/api/catalog').then(r=>r.json());
    setCatalog(c.products||[]);
    const a = await fetch('/api/audit').then(r=>r.json());
    setAudit(a.audits||[]);
    const o = await fetch('/api/orders').then(r=>r.json());
    setOrders(o.orders||[]);
  };
  useEffect(()=>{ load(); }, []);

  const add = (id) => setCart(prev=> {
    const f = prev.find(x=>x.id===id);
    if(f) return prev.map(x=>x.id===id?{...x, qty:x.qty+1}:x);
    return [...prev, {id, qty:1}];
  });
  const createReserve = async () => {
    const j = await fetch('/api/reserve/create', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({max_block_inr: 10000})}).then(r=>r.json());
    if(j.error) setMsg(`Reserve failed: ${j.error}`); else setReserve(j.reserve);
    load();
  };
  const checkout = async () => {
    if(cart.length===0) return setMsg("Cart empty");
    const body = { items: cart, reserve_id: reserve?.id, customer: {name:"Test User", contact:"+919999999999", email:"test@rzp.io"}};
    const j = await fetch('/api/checkout/create', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)}).then(r=>r.json());
    if(j.error) setMsg(`Blocked: ${j.error} | fallback: ${j.fallback?.short_url||'none'} audit:${j.audit?.id}`);
    else setMsg(`Order created ${j.order.id} Razorpay ${j.order.razorpay_order_id} amount Rs ${j.order.amount/100} audit ${j.audit.id}`);
    setCart([]); load();
  };

  return <div style={{fontFamily:'system-ui', maxWidth:900, margin:'20px auto', padding:10}}>
    <h1>AgentCart — Track 01 Demo (Mock mode if no Razorpay keys)</h1>
    <p>Agent-readable: <a href="/llms.txt" target="_blank">/llms.txt</a> | <a href="/api/catalog" target="_blank">/api/catalog</a> | MCP tools: list_catalog, create_agent_checkout, create_reserve</p>
    <p><b>Test UPI:</b> use <code>success@razorpay</code> / <code>failure@razorpay</code> in real Razorpay Checkout (test keys). This demo uses Orders + mock audit.</p>
    <div style={{display:'flex', gap:10}}>
      <button onClick={createReserve}>Create Reserve Rs 10,000 (SBMD 90d)</button>
      {reserve && <span>Reserve {reserve.id} remaining Rs {reserve.remaining/100} expires {new Date(reserve.expires_at).toLocaleDateString()}</span>}
    </div>
    <p style={{color:'crimson'}}>{msg}</p>
    <h2>Catalog (agent-readable)</h2>
    <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10}}>
      {catalog.map(p=> <div key={p.id} style={{border:'1px solid #ddd', padding:8, borderRadius:8}}>
        <b>{p.name}</b><br/>Rs {p.price/100} stock {p.stock}<br/><i>{p.desc}</i><br/>
        <button onClick={()=>add(p.id)}>Add</button>
      </div>)}
    </div>
    <h3>Cart: {cart.map(c=> c.id+'x'+c.qty).join(', ')||'empty'} <button onClick={checkout}>Checkout {reserve?'(Reserve debit)':'(Direct)'}</button> <button onClick={()=>setCart([])}>Clear</button></h3>
    <h2>Merchant Dashboard (live)</h2>
    <p>Orders: {orders.length} | Audits: {audit.length}</p>
    <details><summary>Audit trail (last 10)</summary><pre style={{background:'#f5f5f5', padding:8, fontSize:12, overflow:'auto'}}>{JSON.stringify(audit.slice(-10), null, 2)}</pre></details>
    <details><summary>Orders</summary><pre style={{background:'#f5f5f5', padding:8, fontSize:12, overflow:'auto'}}>{JSON.stringify(orders.slice(-5), null, 2)}</pre></details>
    <hr/><p>Chat test: ask Claude/Cursor with MCP: <code>list catalog under 200</code> then <code>create checkout for p3 x2 + p5 x1</code> — it calls POST /api/checkout/create bounded.</p>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
