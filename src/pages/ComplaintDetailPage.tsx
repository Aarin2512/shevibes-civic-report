import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Users,
  Loader2,
  Camera,
  CheckCircle2,
  RotateCcw,
  Clock,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type {
  Complaint,
  TimelineEntry,
  Profile,
  ComplaintStatus,
} from '@/lib/types';
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_DOT_COLORS,
} from '@/lib/types';
import { formatRelativeTime, formatDateTime } from '@/lib/utils';
import StatusBadge from '@/components/StatusBadge';
import CategoryIcon from '@/components/CategoryIcon';

interface TimelineWithProfile extends TimelineEntry {
  profiles: { pseudonym: string } | null;
}

export default function ComplaintDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [timeline, setTimeline] = useState<TimelineWithProfile[]>([]);
  const [reporterProfile, setReporterProfile] = useState<string>('Anonymous');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [resolvePhoto, setResolvePhoto] = useState<File | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [statusUpdate, setStatusUpdate] = useState<ComplaintStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);

    const { data: complaintData, error: complaintError } = await supabase
      .from('complaints')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (complaintError || !complaintData) {
      setLoading(false);
      return;
    }
    setComplaint(complaintData as Complaint);

    const { data: timelineData } = await supabase
      .from('timeline_entries')
      .select('*')
      .eq('complaint_id', id)
      .order('created_at', { ascending: true });

    const entries = (timelineData ?? []) as TimelineEntry[];
    const userIds = [...new Set(entries.map((e) => e.created_by))];
    userIds.push(complaintData.user_id);

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, pseudonym')
      .in('id', userIds);

    const profileMap = new Map<string, string>();
    (profiles as Profile[] | null)?.forEach((p) =>
      profileMap.set(p.id, p.pseudonym)
    );

    setReporterProfile(profileMap.get(complaintData.user_id) ?? 'Anonymous');
    setTimeline(
      entries.map((e) => ({
        ...e,
        profiles: { pseudonym: profileMap.get(e.created_by) ?? 'Anonymous' },
      }))
    );
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = async (newStatus: ComplaintStatus, note?: string, photoPath?: string) => {
    if (!complaint || !user) return;
    setActionLoading(true);
    setError(null);

    const { error: updateError } = await supabase
      .from('complaints')
      .update({ status: newStatus })
      .eq('id', complaint.id);

    if (updateError) {
      setActionLoading(false);
      setError(updateError.message);
      return;
    }

    const { error: timelineError } = await supabase.from('timeline_entries').insert({
      complaint_id: complaint.id,
      status: newStatus,
      note: note ?? null,
      photo_path: photoPath ?? null,
    });

    setActionLoading(false);
    if (timelineError) {
      setError(timelineError.message);
      return;
    }

    setShowResolveModal(false);
    setShowReopenModal(false);
    setResolvePhoto(null);
    setReopenReason('');
    setStatusUpdate(null);
    fetchData();
  };

  const handleResolve = async () => {
    if (!resolvePhoto) return;
    setActionLoading(true);
    const path = `${complaint!.id}/proof-${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('complaint-photos')
      .upload(path, resolvePhoto);

    if (uploadError) {
      setActionLoading(false);
      setError(uploadError.message);
      return;
    }

    await updateStatus('pending_confirmation', undefined, path);
  };

  const handleConfirm = async () => {
    await updateStatus('resolved');
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) return;
    await updateStatus('in_progress', reopenReason.trim());
  };

  const handleStatusChange = async (status: ComplaintStatus) => {
    await updateStatus(status);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  if (!complaint) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500">Complaint not found.</p>
        <Link to="/" className="text-emerald-600 text-sm font-medium mt-2 inline-block">
          Back to feed
        </Link>
      </div>
    );
  }

  const photoUrl = complaint.photo_path
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/complaint-photos/${complaint.photo_path}`
    : null;

  const isReporter = user?.id === complaint.user_id;
  const canMarkResolved = complaint.status === 'open' || complaint.status === 'in_progress';
  const canConfirm = isReporter && complaint.status === 'pending_confirmation';
  const canReopen = isReporter && complaint.status === 'pending_confirmation';

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {photoUrl && (
        <div className="rounded-2xl overflow-hidden bg-slate-100">
          <img src={photoUrl} alt={complaint.description} className="w-full" />
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
              <CategoryIcon category={complaint.category} className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {CATEGORY_LABELS[complaint.category]}
              </p>
              <p className="text-xs text-slate-400">
                Reported by {reporterProfile} · {formatRelativeTime(complaint.created_at)}
              </p>
            </div>
          </div>
          <StatusBadge status={complaint.status} />
        </div>

        <p className="text-slate-700 leading-relaxed">{complaint.description}</p>

        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-sm text-slate-500">
          <span className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-slate-400" />
            {complaint.location_text ?? `${complaint.latitude.toFixed(4)}, ${complaint.longitude.toFixed(4)}`}
          </span>
          {complaint.priority_count > 1 && (
            <span className="flex items-center gap-1.5 text-amber-600 font-medium">
              <Users className="w-4 h-4" />
              {complaint.priority_count} merged reports
            </span>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">
          Actions
        </h2>

        {error && (
          <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2.5 text-sm mb-3">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {canMarkResolved && (
            <button
              onClick={() => setShowResolveModal(true)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              Mark Resolved
            </button>
          )}

          {complaint.status === 'open' && (
            <button
              onClick={() => handleStatusChange('in_progress')}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-sm font-semibold hover:bg-blue-100 active:scale-[0.98] transition disabled:opacity-50"
            >
              <Clock className="w-4 h-4" />
              Start Progress
            </button>
          )}

          {complaint.status === 'in_progress' && (
            <button
              onClick={() => handleStatusChange('open')}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 text-sm font-semibold hover:bg-amber-100 active:scale-[0.98] transition disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Revert to Open
            </button>
          )}

          {canConfirm && (
            <button
              onClick={handleConfirm}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Confirm Resolution
            </button>
          )}

          {canReopen && (
            <button
              onClick={() => setShowReopenModal(true)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 text-orange-700 border border-orange-200 text-sm font-semibold hover:bg-orange-100 active:scale-[0.98] transition disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Reopen
            </button>
          )}

          {complaint.status === 'resolved' && !isReporter && (
            <p className="text-sm text-slate-400">This complaint has been resolved.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">
          Timeline
        </h2>
        <div className="space-y-0">
          {timeline.map((entry, idx) => {
            const isLast = idx === timeline.length - 1;
            const photoUrl = entry.photo_path
              ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/complaint-photos/${entry.photo_path}`
              : null;
            return (
              <div key={entry.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full ${STATUS_DOT_COLORS[entry.status]} flex items-center justify-center flex-shrink-0`}>
                    <span className="w-2 h-2 rounded-full bg-white" />
                  </div>
                  {!isLast && <div className="w-0.5 flex-1 bg-slate-200 my-1" />}
                </div>
                <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-6'}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">
                      {STATUS_LABELS[entry.status]}
                    </span>
                    <span className="text-xs text-slate-400">
                      {entry.profiles?.pseudonym ?? 'Anonymous'} · {formatDateTime(entry.created_at)}
                    </span>
                  </div>
                  {entry.note && (
                    <p className="text-sm text-slate-600 mt-1 bg-slate-50 rounded-lg px-3 py-2">
                      {entry.note}
                    </p>
                  )}
                  {photoUrl && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 max-w-xs">
                      <img src={photoUrl} alt="Proof" className="w-full" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showResolveModal && (
        <Modal onClose={() => setShowResolveModal(false)} title="Mark as Resolved">
          <p className="text-sm text-slate-500 mb-4">
            Upload a proof photo showing the issue has been fixed. The original reporter will be asked to confirm.
          </p>
          <PhotoPicker photo={resolvePhoto} onChange={setResolvePhoto} />
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowResolveModal(false)}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleResolve}
              disabled={!resolvePhoto || actionLoading}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Proof'}
            </button>
          </div>
        </Modal>
      )}

      {showReopenModal && (
        <Modal onClose={() => setShowReopenModal(false)} title="Reopen Complaint">
          <p className="text-sm text-slate-500 mb-3">
            Please provide a reason for reopening this complaint.
          </p>
          <textarea
            value={reopenReason}
            onChange={(e) => setReopenReason(e.target.value)}
            rows={4}
            placeholder="The issue is not fully resolved because..."
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition resize-none"
          />
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setShowReopenModal(false)}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleReopen}
              disabled={!reopenReason.trim() || actionLoading}
              className="flex-1 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reopen'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-slate-900 mb-2">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function PhotoPicker({
  photo,
  onChange,
}: {
  photo: File | null;
  onChange: (f: File | null) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (photo) {
      const url = URL.createObjectURL(photo);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
  }, [photo]);

  return (
    <div>
      {preview ? (
        <div className="relative rounded-xl overflow-hidden">
          <img src={preview} alt="Preview" className="w-full" />
          <button
            onClick={() => onChange(null)}
            className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition">
          <Camera className="w-8 h-8 text-slate-400" />
          <span className="text-sm text-slate-500 font-medium">Upload proof photo</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onChange(f);
            }}
          />
        </label>
      )}
    </div>
  );
}
