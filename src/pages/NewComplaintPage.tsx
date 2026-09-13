import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  MapPin,
  Loader2,
  X,
  CheckCircle2,
  LocateFixed,
  Sparkles,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { ComplaintCategory, Complaint } from '@/lib/types';
import { CATEGORY_LABELS, ALL_CATEGORIES } from '@/lib/types';
import { haversineDistance, MERGE_RADIUS_METERS } from '@/lib/utils';
import CategoryIcon from '@/components/CategoryIcon';

export default function NewComplaintPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [category, setCategory] = useState<ComplaintCategory>('pothole');
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [merged, setMerged] = useState<{ id: string; count: number } | null>(null);
  const [aiCategory, setAiCategory] = useState<ComplaintCategory | null>(null);
  const [classifying, setClassifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (photo) {
      const url = URL.createObjectURL(photo);
      setPhotoPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPhotoPreview(null);
    setAiCategory(null);
  }, [photo]);

  const classifyPhoto = async (file: File) => {
    setClassifying(true);
    setAiCategory(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-photo`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              image_base64: base64,
              mime_type: file.type || 'image/jpeg',
            }),
          }
        );
        if (!res.ok) {
 setClassifying(false); return; }
        const data = await res.json();
        if (data.category) {
          const cat = data.category as ComplaintCategory;
          setAiCategory(cat);
          setCategory(cat);
        }
        setClassifying(false);
      };
      reader.readAsDataURL(file);
    } catch {
      setClassifying(false);
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setError('Could not get your location. Please try again.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !coords) return;
    if (!description.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      // Check for nearby complaints in same category to merge
      const { data: nearby } = await supabase
        .from('complaints')
        .select('*')
        .eq('category', category)
        .is('merged_into', null)
        .in('status', ['open', 'in_progress']);

      const candidates = (nearby ?? []) as Complaint[];
      const mergeTarget = candidates.find((c) => {
        const dist = haversineDistance(
          coords.lat,
          coords.lng,
          c.latitude,
          c.longitude
        );
        return dist <= MERGE_RADIUS_METERS;
      });

      if (mergeTarget) {
        // Merge: increment priority_count, set merged_into, add timeline entry
        const newCount = mergeTarget.priority_count + 1;
        await supabase
          .from('complaints')
          .update({ priority_count: newCount, updated_at: new Date().toISOString() })
          .eq('id', mergeTarget.id);

        const { data: newComplaint } = await supabase
          .from('complaints')
          .insert({
            user_id: user.id,
            category,
            description: description.trim(),
            latitude: coords.lat,
            longitude: coords.lng,
            location_text: locationText.trim() || null,
            status: 'open',
            merged_into: mergeTarget.id,
          })
          .select('*')
          .single();

        await supabase.from('timeline_entries').insert({
          complaint_id: mergeTarget.id,
          status: mergeTarget.status,
          note: `A nearby duplicate report was merged (priority count: ${newCount}).`,
        });

        setSubmitting(false);
        setMerged({ id: mergeTarget.id, count: newCount });
        return;
      }

      // No merge target — create new complaint
      let photoPath: string | null = null;
      if (photo) {
        photoPath = `${user.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from('complaint-photos')
          .upload(photoPath, photo);
        if (uploadError) throw new Error(uploadError.message);
      }

      const { data: newComplaint, error: insertError } = await supabase
        .from('complaints')
        .insert({
          user_id: user.id,
          category,
          description: description.trim(),
          latitude: coords.lat,
          longitude: coords.lng,
          location_text: locationText.trim() || null,
          photo_path: photoPath,
          status: 'open',
        })
        .select('*')
        .single();

      if (insertError) throw new Error(insertError.message);

      await supabase.from('timeline_entries').insert({
        complaint_id: newComplaint.id,
        status: 'open',
        note: 'Complaint reported.',
      });

      setSubmitting(false);
      navigate(`/complaint/${newComplaint.id}`);
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  };

  if (merged) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle2 className="w-9 h-9 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Merged with nearby report</h2>
        <p className="text-slate-500 text-sm max-w-xs">
          Your report was close to an existing complaint in the same category.
          It has been merged to increase its priority (now {merged.count} reports).
        </p>
        <button
          onClick={() => navigate(`/complaint/${merged.id}`)}
          className="mt-6 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition"
        >
          View the complaint
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <h1 className="text-2xl font-bold text-slate-900">Report an Issue</h1>

      {error && (
        <div className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Category
          </label>
          {classifying && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>AI is analyzing your photo…</span>
            </div>
          )}
          {aiCategory && !classifying && (
            <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 text-sm">
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              <span>AI suggests: <strong>{CATEGORY_LABELS[aiCategory]}</strong></span>
              <span className="text-violet-400 ml-auto text-xs">tap a category to change</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            {ALL_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${
                  category === cat
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                <CategoryIcon category={cat} className="w-5 h-5" />
                <span className="text-xs font-medium">{CATEGORY_LABELS[cat]}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the problem..."
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Photo (optional)
          </label>
          {photoPreview ? (
            <div className="relative rounded-xl overflow-hidden">
              <img src={photoPreview} alt="Preview" className="w-full" />
              <button
                type="button"
                onClick={() => setPhoto(null)}
                className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-slate-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50/30 transition"
            >
              <Camera className="w-8 h-8 text-slate-400" />
              <span className="text-sm text-slate-500 font-medium">Add a photo</span>
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setPhoto(f);
                classifyPhoto(f);
              }
            }}
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Location
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
              placeholder="Optional address or landmark"
              className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
            />
            <button
              type="button"
              onClick={handleLocate}
              disabled={locating}
              className="px-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition flex items-center gap-1.5 text-sm font-medium"
            >
              {locating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <LocateFixed className="w-4 h-4" />
              )}
              GPS
            </button>
          </div>
          {coords && (
            <p className="text-xs text-emerald-600 flex items-center gap-1 mt-1.5">
              <MapPin className="w-3 h-3" />
              {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
            </p>
          )}
          {!coords && !locating && (
            <p className="text-xs text-slate-400 mt-1.5">
              Tap GPS to capture your current location.
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || !description.trim() || !coords}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 active:scale-[0.99] transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          'Submit Report'
        )}
      </button>
    </form>
  );
}
