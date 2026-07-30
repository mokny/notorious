import {
  FileText,
  FolderKanban,
  CheckSquare,
  User,
  Book,
  Calendar,
  Building2,
  Paperclip,
  Table2,
  Layers,
  Sparkles,
  Search,
  Settings,
  Plus,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Trash2,
  MoreHorizontal,
  X,
  Sun,
  Moon,
  Download,
  Upload,
  LayoutGrid,
  List as ListIcon,
  Rows3,
  GanttChartSquare,
  Image as ImageIcon,
  Pin,
  PinOff,
  Menu,
  Clock,
  LayoutDashboard,
  Pencil,
  Bookmark,
  Share2,
  Copy,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  "file-text": FileText,
  "folder-kanban": FolderKanban,
  "check-square": CheckSquare,
  user: User,
  book: Book,
  calendar: Calendar,
  building: Building2,
  paperclip: Paperclip,
  table: Table2,
  layers: Layers,
  sparkles: Sparkles,
  search: Search,
  settings: Settings,
  plus: Plus,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "grip-vertical": GripVertical,
  trash: Trash2,
  more: MoreHorizontal,
  close: X,
  sun: Sun,
  moon: Moon,
  download: Download,
  upload: Upload,
  board: LayoutGrid,
  list: ListIcon,
  rows: Rows3,
  timeline: GanttChartSquare,
  image: ImageIcon,
  pin: Pin,
  "pin-off": PinOff,
  menu: Menu,
  clock: Clock,
  "layout-dashboard": LayoutDashboard,
  pencil: Pencil,
  bookmark: Bookmark,
  share: Share2,
  copy: Copy,
};

function isImageUrl(value: string): boolean {
  return (
    value.startsWith("/api/v1/files/") ||
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:image/")
  );
}

/**
 * `name` is usually one of the slugs registered above (an object *type*'s
 * default icon, or a chrome icon like "trash"), but an individual object can
 * override it with a custom emoji or an uploaded image (see IconPicker) - a
 * string that was never meant to match this registry. Anything not
 * recognized as a slug is rendered as-is instead of silently falling back to
 * a generic file icon: a URL becomes an `<img>`, anything else (an emoji,
 * typically) is rendered as literal text.
 */
export function Icon({ name, className }: { name: string; className?: string }) {
  if (!name) return <FileText className={className ?? "h-4 w-4"} />;

  if (isImageUrl(name)) {
    return <img src={name} alt="" className={`${className ?? "h-4 w-4"} shrink-0 rounded object-cover`} />;
  }

  const Component = ICONS[name];
  if (!Component) {
    return (
      <span className={`${className ?? "h-4 w-4"} inline-flex shrink-0 items-center justify-center text-base leading-none`}>
        {name}
      </span>
    );
  }

  return <Component className={className ?? "h-4 w-4"} />;
}
