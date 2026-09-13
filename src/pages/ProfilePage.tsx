import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ShieldCheck, Edit3, Check, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Complaint, ComplaintStatus } from '@/lib/types';
import { CATEGORY_LABELS } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import StatusBadge from '@/components/StatusBadge';
import CategoryIcon from '@/components/CategoryIcon';

export default function ProfilePage() {
  const { user, profile } = useAuth();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [pseudonym, setPseudonym] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchComplaints = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('complaints')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    setComplaints((data as Complaint[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  useEffect(() => {
    if (profile) setPseudonym(profile.pseudonym);
  }, [profile]);

  const handleSavePseudonym = async () => {
    if (!user || !pseudonym.trim()) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ pseudonym: pseudonym.trim() })
      .eq('id', user.id);
    setSaving(false);
    setEditing(false);
    window.location.reload();
  };

  const stats = {
    total: complaints.length,
    open: complaints.filter((c) => c.status === 'open').length,
    inProgress: complaints.filter((c) => c.status === 'in_progress').length,
    resolved: complaints.filter((c) => c.status === 'resolved').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-slate-900">Profile</h1>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-emerald-600" />
          </div>
          <div className="flex-1">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={pseudonym}
                  onChange={(e) => setPseudonym(e.target.value)}
                  maxLength={40}
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
                <button
                  onClick={handleSavePseudonym}
                  disabled={saving || !pseudonym.trim()}
                  className="p-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setPseudonym(profile?.pseudonym ?? '');
                  }}
                  className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div>
                  <p className="font-bold text-slate-900 text-lg">
                    {profile?.pseudonym ?? 'Anonymous'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Your real email is never shown to other users
                  </p>
                </div>
                <button
                  onClick={() => setEditing(true)}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <StatCard label="Total" value={stats.total} color="text-slate-900" />
        <StatCard label="Open" value={stats.open} color="text-amber-600" />
        <StatCard label="Active" value={stats.inProgress} color="text-blue-600" />
        <StatCard label="Resolved" value={stats.resolved} color="text-emerald-600" />
      </div>

      <div>
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">
          My Reports
        </h2>
        {complaints.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
            <p className="text-slate-500 text-sm">You haven't reported any issues yet.</p>
            <Link
              to="/new"
              className="text-emerald-600 text-sm font-medium mt-2 inline-block"
            >
              Report your first issue
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {complaints.map((c) => (
              <Link
                key={c.id}
                to={`/complaint/${c.id}`}
                className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 p-3 hover:shadow-sm hover:border-slate-300 transition group"
              >
                <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0">
                  <CategoryIcon category={c.category} className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {c.description}
                  </p>
                  <p className="text-xs text-slate-400">
                    {CATEGORY_LABELS[c.category]} · {formatRelativeTime(c.created_at)}
                  </p>
                </div>
                <StatusBadge status={c.status} />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-400 font-medium mt-0.5">{label}</p>
    </div>
  );
}
