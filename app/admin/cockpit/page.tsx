"use client";

import React, { useState, useEffect } from "react";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  plan: string;
  status: "HEALTHY" | "DEGRADED" | "OFFLINE" | "SUSPENDED";
  admin_phone?: string;
}

interface Incident {
  id: string;
  tenant_id: string;
  service: string;
  severity: "LOW" | "MEDIUM" | "CRITICAL";
  status: "OPEN" | "RESOLVED";
  error_code: string;
  error_message: string;
  first_seen_at: string;
}

export default function CockpitControlPlane() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Form State
  const [tenantName, setTenantName] = useState("");
  const [slug, setSlug] = useState("");
  const [vertical, setVertical] = useState("shop");
  const [plan, setPlan] = useState("growth");
  const [adminPhone, setAdminPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const API_BASE = "https://api.boontrack.com/api/v1/internal/tenants";

  const loadData = async () => {
    try {
      setLoading(true);
      const [tenantsRes, incidentsRes] = await Promise.all([
        fetch(`${API_BASE}/list`),
        fetch(`${API_BASE}/incidents`)
      ]);
      const tenantsData = await tenantsRes.json();
      const incidentsData = await incidentsRes.json();
      if (tenantsData.success) setTenants(tenantsData.data);
      if (incidentsData.success) setIncidents(incidentsData.data);
    } catch (err) {
      console.error("Gagal load cockpit data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    setTenantName(name);
    setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  };

  const handleProvision = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetch(`${API_BASE}/provision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_name: tenantName,
          slug,
          vertical,
          plan,
          admin_phone: adminPhone
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.detail || data.message || "Gagal provision tenant");
      }
      setSuccessMsg(`Tenant ${tenantName} berhasil diprovisi!`);
      setTenantName("");
      setSlug("");
      setAdminPhone("");
      loadData();
      setTimeout(() => {
        setIsModalOpen(false);
        setSuccessMsg("");
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveIncident = async (incidentId: string) => {
    try {
      await fetch(`${API_BASE}/incidents/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incident_id: incidentId })
      });
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "HEALTHY":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800">🟢 HEALTHY</span>;
      case "DEGRADED":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-100 text-amber-800">🟡 DEGRADED</span>;
      case "OFFLINE":
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-100 text-rose-800">🔴 OFFLINE</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-zinc-200 text-zinc-800">⚫ SUSPENDED</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-8 font-sans">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            🛡️ BoonTrack Control Plane
            <span className="text-xs font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2 py-0.5 rounded">bossob Cockpit</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">Tenant Orchestration & Health Cockpit P1</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="px-4 py-2 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 rounded-lg flex items-center gap-2"
          >
            ⚠️ Incident Logs ({incidents.filter(i => i.status === 'OPEN').length})
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-600/30 flex items-center gap-2"
          >
            ➕ Add New Tenant
          </button>
        </div>
      </div>

      {/* Health Grid */}
      <div className="mt-8 bg-slate-800/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800/80 flex justify-between items-center">
          <h2 className="font-semibold text-white">Active Tenants Health Matrix</h2>
          <button onClick={loadData} className="text-xs text-indigo-400 hover:underline">Refresh Matrix</button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading Cockpit Matrix...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-800/80 text-slate-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-6">Tenant</th>
                  <th className="py-3 px-6">Vertical / Plan</th>
                  <th className="py-3 px-6">Core Status</th>
                  <th className="py-3 px-6">WhatsApp</th>
                  <th className="py-3 px-6">Payment</th>
                  <th className="py-3 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-medium text-white">{t.name}</div>
                      <div className="text-xs text-slate-400 font-mono">slug: {t.slug}</div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="capitalize text-slate-200">{t.vertical}</span>
                      <span className="text-xs text-slate-400 block font-mono capitalize">{t.plan} tier</span>
                    </td>
                    <td className="py-4 px-6">{getStatusBadge(t.status)}</td>
                    <td className="py-4 px-6">
                      <span className="text-emerald-400 flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Connected
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      <span className="text-emerald-400 flex items-center gap-1.5 text-xs">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Active (QRIS)
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right space-x-2">
                      <a
                        href={`https://${t.slug}.boontrack.com`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200"
                      >
                        Open Dashboard
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: No-Code Onboarding */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-1">Provision New Tenant</h3>
            <p className="text-xs text-slate-400 mb-4">Otomatisasi registrasi merchant & DB boundary.</p>

            {errorMsg && <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs rounded-lg">{errorMsg}</div>}
            {successMsg && <div className="mb-4 p-3 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs rounded-lg">{successMsg}</div>}

            <form onSubmit={handleProvision} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Tenant Name</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Toko Herbal Alami"
                  value={tenantName}
                  onChange={handleNameChange}
                  className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Slug (Subdomain Identifier)</label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-900/50 border border-slate-700 rounded-lg text-slate-300 font-mono focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Vertical</label>
                  <select
                    value={vertical}
                    onChange={(e) => setVertical(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white"
                  >
                    <option value="shop">Shop</option>
                    <option value="gym">Gym</option>
                    <option value="career">Career</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Plan Tier</label>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white"
                  >
                    <option value="growth">Growth</option>
                    <option value="pro">Pro Scale</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Admin WhatsApp / Phone</label>
                <input
                  type="text"
                  placeholder="08123456789"
                  value={adminPhone}
                  onChange={(e) => setAdminPhone(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg disabled:opacity-50"
                >
                  {submitting ? "Provisioning..." : "Provision Tenant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer: Incident Logs */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="bg-slate-800 w-full max-w-xl h-full p-6 border-l border-slate-700 overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-700 mb-4">
                <h3 className="font-bold text-white flex items-center gap-2">⚠️ System Incident Logs</h3>
                <button onClick={() => setIsDrawerOpen(false)} className="text-slate-400 hover:text-white">✕</button>
              </div>

              <div className="space-y-3">
                {incidents.length === 0 ? (
                  <p className="text-slate-400 text-sm text-center py-8">Semua service terpantau normal. Tidak ada insiden aktif.</p>
                ) : (
                  incidents.map((inc) => (
                    <div key={inc.id} className="p-4 bg-slate-900 border border-slate-700/80 rounded-xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-mono font-bold text-indigo-400">{inc.service}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${inc.status === 'OPEN' ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                          {inc.status}
                        </span>
                      </div>
                      <p className="text-xs text-rose-300 font-mono break-all">{inc.error_message}</p>
                      <div className="flex justify-between items-center text-[11px] text-slate-400 pt-2 border-t border-slate-800">
                        <span>Tenant: {inc.tenant_id}</span>
                        {inc.status === 'OPEN' && (
                          <button
                            onClick={() => handleResolveIncident(inc.id)}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/30 rounded text-[10px]"
                          >
                            Mark Resolved
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
            <button
              onClick={() => setIsDrawerOpen(false)}
              className="mt-6 w-full py-2 bg-slate-700 text-slate-200 rounded-lg text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}