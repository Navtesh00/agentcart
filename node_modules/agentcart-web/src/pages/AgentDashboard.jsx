import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, LogIn, Activity, Shield, TrendingUp, IndianRupee, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { useAgentDashboard, agentLogin } from '../hooks/useAgentDashboard.js';
import { Toaster, toast } from 'sonner';

export default function AgentDashboard() {
  const [token, setToken] = useState(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1]);
    return params.get('token') || '';
  });
  const [agentKey, setAgentKey] = useState('');
  const [logging, setLogging] = useState(false);
  const { data, loading, error } = useAgentDashboard(token);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!agentKey.trim()) return;
    setLogging(true);
    try {
      const result = await agentLogin(agentKey.trim());
      setToken(result.token);
      window.location.hash = `#/dashboard?token=${result.token}`;
      toast.success('Logged in as agent');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLogging(false);
    }
  };

  // Login form
  if (!token) {
    return (
      <div className="min-h-screen bg-noir pt-20 px-6 flex items-center justify-center">
        <Toaster position="top-right" theme="dark" />
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass max-w-sm w-full p-8">
          <div className="flex items-center gap-2 mb-6">
            <Lock size={20} className="text-gold" />
            <h1 className="font-display text-2xl text-white font-semibold">Agent Login</h1>
          </div>
          <form onSubmit={handleLogin}>
            <label className="block text-muted text-xs font-mono uppercase tracking-wider mb-2">Agent API Key</label>
            <input
              type="text"
              value={agentKey}
              onChange={e => setAgentKey(e.target.value)}
              placeholder="agent_demo_key_123"
              className="w-full bg-noir border border-glass rounded-lg px-4 py-3 text-sm text-white placeholder-muted outline-none focus:border-gold transition-colors mb-4 font-mono"
            />
            <button
              type="submit"
              disabled={logging || !agentKey.trim()}
              className="w-full bg-gold hover:bg-gold/80 text-white py-3 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {logging ? <Clock size={14} className="animate-spin" /> : <LogIn size={14} />}
              Sign In
            </button>
          </form>
          <p className="text-muted text-xs text-center mt-4">Demo key: <span className="font-mono text-gold">agent_demo_key_123</span></p>
        </motion.div>
      </div>
    );
  }

  // Loading
  if (loading && !data) {
    return (
      <div className="min-h-screen bg-noir pt-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="glass p-4 animate-pulse">
                <div className="h-3 bg-glass rounded w-20 mb-3" />
                <div className="h-8 bg-glass rounded w-16 mb-1" />
                <div className="h-3 bg-glass rounded w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="min-h-screen bg-noir pt-20 px-6 flex items-center justify-center">
        <div className="glass max-w-md w-full p-8 text-center">
          <XCircle size={48} className="text-red-400 mx-auto mb-4" />
          <h2 className="font-display text-xl text-white mb-2">Session Expired</h2>
          <p className="text-muted text-sm mb-4">{error}</p>
          <button onClick={() => { setToken(''); window.location.hash = '#/dashboard'; }} className="bg-gold hover:bg-gold/80 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors">
            Login Again
          </button>
        </div>
      </div>
    );
  }

  const kpis = [
    { label: 'Total Orders', value: data?.totalOrders || 0, icon: <Activity size={18} />, color: '#D4A574', sub: `₹${((data?.totalRevenue || 0) / 100).toLocaleString('en-IN')} GMV` },
    { label: 'Paid Orders', value: data?.paidOrders || 0, icon: <CheckCircle2 size={18} />, color: '#00E5A0', sub: `${data?.successRate || 0}% success rate` },
    { label: 'Failed', value: data?.failedOrders || 0, icon: <XCircle size={18} />, color: '#FF6B6B', sub: 'Needs attention' },
    { label: 'Revenue', value: `₹${((data?.totalRevenue || 0) / 100).toLocaleString('en-IN')}`, icon: <IndianRupee size={18} />, color: '#A78BFA', sub: 'Total collected' },
  ];

  return (
    <div className="min-h-screen bg-noir pt-20 px-6 pb-12">
      <Toaster position="top-right" theme="dark" />
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <p className="text-gold font-mono text-xs tracking-[0.2em] uppercase mb-1">Agent Dashboard</p>
            <h1 className="font-display text-3xl font-semibold text-white">Hotel Pranjal — Live Ops</h1>
            <p className="text-muted text-sm mt-1">Auto-refresh 30s · Bearer token auth</p>
          </div>
          <button onClick={() => { setToken(''); window.location.hash = '#/dashboard'; }} className="text-muted hover:text-white text-xs font-mono transition-colors">
            Logout
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {kpis.map((kpi, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="glass p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-muted text-xs font-mono uppercase tracking-wider">{kpi.label}</span>
                <span style={{ color: kpi.color }}>{kpi.icon}</span>
              </div>
              <p className="text-2xl font-display font-semibold text-white mb-1">{kpi.value}</p>
              <p className="text-muted text-xs">{kpi.sub}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Activity Feed */}
          <div className="glass p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-mint" />
              <h2 className="font-mono text-sm text-white uppercase tracking-wider">Activity Feed</h2>
            </div>
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {(!data?.activities || data.activities.length === 0) ? (
                <p className="text-muted text-sm py-6 text-center">No activity yet.</p>
              ) : (
                data.activities.map((entry, i) => (
                  <motion.div key={entry.id || i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${entry.status === 'success' ? 'border-mint/20 bg-mint/5' : entry.status === 'error' ? 'border-red-400/20 bg-red-400/5' : 'border-glass bg-noir/50'}`}>
                    <span className="mt-0.5">{entry.status === 'success' ? <CheckCircle2 size={14} className="text-mint" /> : <XCircle size={14} className="text-red-400" />}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-xs text-gold">{entry.type}</span>
                      <p className="text-muted text-xs mt-0.5 truncate">{entry.created_at ? new Date(entry.created_at).toLocaleTimeString() : '—'}</p>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>

          {/* Orders Table */}
          <div className="glass p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-gold" />
              <h2 className="font-mono text-sm text-white uppercase tracking-wider">Recent Orders — {data?.orders?.length || 0}</h2>
            </div>
            <div className="max-h-[420px] overflow-y-auto pr-1">
              {(!data?.orders || data.orders.length === 0) ? (
                <p className="text-muted text-sm py-6 text-center">No orders yet.</p>
              ) : (
                <div className="space-y-2">
                  {data.orders.slice(0, 20).map((o, i) => {
                    const st = String(o.status).toLowerCase();
                    const stColor = st === 'paid' ? '#00E5A0' : st === 'failed' ? '#FF6B6B' : '#D4A574';
                    return (
                      <div key={o.id || i} className="flex items-center justify-between p-3 rounded-lg border border-glass bg-noir/50">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-2 h-2 rounded-full" style={{ background: stColor }} />
                          <div className="min-w-0">
                            <p className="text-white text-sm truncate">{(o.items || []).map(i => `${i.name}×${i.qty}`).join(', ') || 'Order'}</p>
                            <p className="text-muted text-xs font-mono">#{String(o.id).slice(0, 12)}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-white text-sm">₹{(o.amount / 100).toLocaleString('en-IN')}</p>
                          <p className="text-xs font-mono" style={{ color: stColor }}>{o.status}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
