import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MapPin, Users, Loader2, Filter, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Complaint, ComplaintCategory, ComplaintStatus, Profile } from '@/lib/types';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  ALL_CATEGORIES,
  ALL_STATUSES,
} from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import StatusBadge from '@/components/StatusBadge';
import CategoryIcon from '@/components/CategoryIcon';

interface FeedItem extends Complaint {
  profiles: { pseudonym: string } | null;
}

export default function FeedPage() {
  const [complaints, setComplaints] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<ComplaintCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('complaints')
      .select('*')
      .is('merged_into', null)
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') query = query.eq('status', statusFilter);
    if (categoryFilter !== 'all') query = query.eq('category', categoryFilter);

    const { data, error } = await query;
    setLoading(false);
    if (error) return;
    if (!data) return;

    const profileIds = [...new Set(data.map((c) => c.user_id))];
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, pseudonym')
      .in('id', profileIds);

    const profileMap = new Map<string, string>();
    (profiles as Profile[] | null)?.forEach((p) =>
      profileMap.set(p.id, p.pseudonym)
    );

    const enriched = data.map((c) => ({
      ...c,
      profiles: { pseudonym: profileMap.get(c.user_id) ?? 'Anonymous' },
    })) as FeedItem[];

    const filtered = search
      ? enriched.filter((c) =>
          c.description.toLowerCase().includes(search.toLowerCase()) ||
          (c.location_text ?? '').toLowerCase().includes(search.toLowerCase())
        )
      : enriched;

    setComplaints(filtered);
  }, [statusFilter, categoryFilter, search]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) + (categoryFilter !== 'all' ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Community Feed</h1>
        <Link
          to="/new"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 active:scale-[0.98] transition-all shadow-sm shadow-emerald-600/20"
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          Report
        </Link>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search complaints..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`px-3 rounded-xl border transition flex items-center gap-1.5 text-sm font-medium ${
            showFilters || activeFilterCount > 0
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <Filter className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-xs flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Status
            </p>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={statusFilter === 'all'}
                onClick={() => setStatusFilter('all')}
                label="All"
              />
              {ALL_STATUSES.map((s) => (
                <FilterChip
                  key={s}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                  label={STATUS_LABELS[s]}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Category
            </p>
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={categoryFilter === 'all'}
                onClick={() => setCategoryFilter('all')}
                label="All"
              />
              {ALL_CATEGORIES.map((c) => (
                <FilterChip
                  key={c}
                  active={categoryFilter === c}
                  onClick={() => setCategoryFilter(c)}
                  label={CATEGORY_LABELS[c]}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
        </div>
      ) : complaints.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-8 h-8 text-slate-300" />
          </div>
          <p className="text-slate-500 font-medium">No complaints found</p>
          <p className="text-slate-400 text-sm mt-1">
            Be the first to report an issue in your area.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {complaints.map((complaint) => (
            <ComplaintCard key={complaint.id} complaint={complaint} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
        active
          ? 'bg-emerald-600 text-white'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function ComplaintCard({ complaint }: { complaint: FeedItem }) {
  const photoUrl = complaint.photo_path
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/complaint-photos/${complaint.photo_path}`
    : null;

  return (
    <Link
      to={`/complaint/${complaint.id}`}
      className="block bg-white rounded-2xl border border-slate-200 overflow-hidden hover:shadow-md hover:border-slate-300 transition-all group"
    >
      {photoUrl && (
        <div className="aspect-video bg-slate-100 overflow-hidden">
          <img
            src={photoUrl}
            alt={complaint.description}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
              <CategoryIcon category={complaint.category} className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium text-slate-600">
              {CATEGORY_LABELS[complaint.category]}
            </span>
          </div>
          <StatusBadge status={complaint.status} />
        </div>
        <p className="text-slate-900 text-sm leading-relaxed line-clamp-2">
          {complaint.description}
        </p>
        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5" />
            {complaint.location_text ?? `${complaint.latitude.toFixed(3)}, ${complaint.longitude.toFixed(3)}`}
          </span>
          <span>{formatRelativeTime(complaint.created_at)}</span>
          {complaint.priority_count > 1 && (
            <span className="flex items-center gap-1 text-amber-600 font-medium">
              <Users className="w-3.5 h-3.5" />
              {complaint.priority_count}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
