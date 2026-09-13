export type ComplaintCategory =
  | 'pothole'
  | 'streetlight'
  | 'garbage'
  | 'water_leak'
  | 'road_safety'
  | 'other';

export type ComplaintStatus =
  | 'open'
  | 'in_progress'
  | 'pending_confirmation'
  | 'resolved';

export interface Profile {
  id: string;
  pseudonym: string;
  created_at: string;
}

export interface Complaint {
  id: string;
  user_id: string;
  category: ComplaintCategory;
  description: string;
  latitude: number;
  longitude: number;
  location_text: string | null;
  photo_path: string | null;
  status: ComplaintStatus;
  priority_count: number;
  merged_into: string | null;
  created_at: string;
  updated_at: string;
}

export interface TimelineEntry {
  id: string;
  complaint_id: string;
  status: ComplaintStatus;
  note: string | null;
  photo_path: string | null;
  created_by: string;
  created_at: string;
}

export interface ComplaintWithProfile extends Complaint {
  profiles?: { pseudonym: string } | null;
}

export const CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  pothole: 'Pothole',
  streetlight: 'Streetlight',
  garbage: 'Garbage',
  water_leak: 'Water Leak',
  road_safety: 'Road Safety',
  other: 'Other',
};

export const CATEGORY_ICONS: Record<ComplaintCategory, string> = {
  pothole: 'CircleAlert',
  streetlight: 'Lightbulb',
  garbage: 'Trash2',
  water_leak: 'Droplets',
  road_safety: 'TriangleAlert',
  other: 'CircleHelp',
};

export const STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  pending_confirmation: 'Pending Confirmation',
  resolved: 'Resolved',
};

export const STATUS_COLORS: Record<ComplaintStatus, string> = {
  open: 'bg-amber-100 text-amber-800 border-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  pending_confirmation: 'bg-violet-100 text-violet-800 border-violet-200',
  resolved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
};

export const STATUS_DOT_COLORS: Record<ComplaintStatus, string> = {
  open: 'bg-amber-500',
  in_progress: 'bg-blue-500',
  pending_confirmation: 'bg-violet-500',
  resolved: 'bg-emerald-500',
};

export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as ComplaintCategory[];
export const ALL_STATUSES = Object.keys(STATUS_LABELS) as ComplaintStatus[];
