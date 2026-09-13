import {
  CircleAlert,
  Lightbulb,
  Trash2,
  Droplets,
  TriangleAlert,
  CircleHelp,
  type LucideIcon,
} from 'lucide-react';
import type { ComplaintCategory } from '@/lib/types';

const ICON_MAP: Record<ComplaintCategory, LucideIcon> = {
  pothole: CircleAlert,
  streetlight: Lightbulb,
  garbage: Trash2,
  water_leak: Droplets,
  road_safety: TriangleAlert,
  other: CircleHelp,
};

export default function CategoryIcon({
  category,
  className = 'w-5 h-5',
}: {
  category: ComplaintCategory;
  className?: string;
}) {
  const Icon = ICON_MAP[category];
  return <Icon className={className} />;
}
