import type { CSSProperties } from "react";
import { withShareToken } from "../../lib/api/shareMode.js";
import { useRobustImage } from "../../hooks/useRobustImage.js";
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
  ChevronUp,
  ChevronRight,
  ChevronLeft,
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
  MapPin,
  Menu,
  Clock,
  LayoutDashboard,
  Pencil,
  Bookmark,
  Share2,
  Copy,
  PenTool,
  Lock,
  Unlock,
  History,
  Link2,
  FileStack,
  Play,
  Terminal,
  Palette,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Presentation,
  Bot,
  Braces,
  Eye,
  Smartphone,
  ZoomIn,
  ZoomOut,
  Scan,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Combine,
  SplitSquareHorizontal,
  PaintBucket,
  Rows,
  Columns,
  MessageSquare,
  MessageSquareOff,
  Bell,
  RefreshCw,
  Send,
  Smile,
  Hash,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  ArrowUp,
  CornerUpLeft,
  Rss,
  AlertTriangle,
  Volume2,
  VolumeX,
  Check,
  Scissors,
  CopyPlus,
  Repeat,
  TextSelect,
  Eraser,
  ExternalLink,
  Archive,
  ArchiveRestore,
  UserPlus,
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
  "chevron-up": ChevronUp,
  "chevron-right": ChevronRight,
  "chevron-left": ChevronLeft,
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
  map: MapPin,
  menu: Menu,
  clock: Clock,
  "layout-dashboard": LayoutDashboard,
  pencil: Pencil,
  bookmark: Bookmark,
  share: Share2,
  copy: Copy,
  whiteboard: PenTool,
  lock: Lock,
  unlock: Unlock,
  history: History,
  link: Link2,
  embed: FileStack,
  play: Play,
  terminal: Terminal,
  palette: Palette,
  shield: ShieldCheck,
  maximize: Maximize2,
  minimize: Minimize2,
  presentation: Presentation,
  bot: Bot,
  braces: Braces,
  eye: Eye,
  smartphone: Smartphone,
  "zoom-in": ZoomIn,
  "zoom-out": ZoomOut,
  scan: Scan,
  bold: Bold,
  italic: Italic,
  "align-left": AlignLeft,
  "align-center": AlignCenter,
  "align-right": AlignRight,
  merge: Combine,
  split: SplitSquareHorizontal,
  "paint-bucket": PaintBucket,
  "insert-row": Rows,
  "insert-column": Columns,
  comment: MessageSquare,
  "comment-off": MessageSquareOff,
  bell: Bell,
  refresh: RefreshCw,
  send: Send,
  smile: Smile,
  hash: Hash,
  volume: Volume2,
  "volume-off": VolumeX,
  check: Check,
  mic: Mic,
  "mic-off": MicOff,
  video: Video,
  "video-off": VideoOff,
  phone: Phone,
  "phone-off": PhoneOff,
  "screen-share": ScreenShare,
  "screen-share-off": ScreenShareOff,
  "arrow-up": ArrowUp,
  reply: CornerUpLeft,
  rss: Rss,
  "alert-triangle": AlertTriangle,
  cut: Scissors,
  duplicate: CopyPlus,
  "turn-into": Repeat,
  "select-all": TextSelect,
  eraser: Eraser,
  "external-link": ExternalLink,
  archive: Archive,
  "archive-restore": ArchiveRestore,
  "user-plus": UserPlus,
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
export function Icon({ name, className, style }: { name: string; className?: string; style?: CSSProperties }) {
  // A URL (e.g. a bookmark's auto-detected favicon, or a since-deleted
  // uploaded file) can 404/fail to load, or - the transient case
  // useRobustImage.ts retries for - just have its response cut short. Falls
  // back to the generic file icon instead of a broken-image glyph once
  // retries are exhausted; a later, different, working URL (a new `name`)
  // gets a fresh attempt automatically, since the hook keys its state off
  // the resolved src.
  const image = useRobustImage(isImageUrl(name) ? withShareToken(name) : null);

  if (!name) return <FileText className={className ?? "h-4 w-4"} style={style} />;

  if (isImageUrl(name)) {
    if (image.failed) return <FileText className={className ?? "h-4 w-4"} style={style} />;
    return (
      <img
        src={image.src}
        alt=""
        className={`${className ?? "h-4 w-4"} shrink-0 rounded object-cover`}
        style={style}
        onError={image.onError}
      />
    );
  }

  const Component = ICONS[name];
  if (!Component) {
    // An emoji/custom-text icon's glyph is sized by `font-size`, unlike
    // every other branch above (an SVG or `<img>`, both sized by
    // `width`/`height` alone) - `text-base` is a fixed 1rem otherwise, so
    // passing a bigger box via `style.width` (see IconPicker.tsx/
    // ObjectDetailPage.tsx, which scale this to match a cover's title text)
    // would grow the box without growing what's actually drawn inside it.
    const fontSize = typeof style?.width === "number" ? style.width : undefined;
    return (
      <span
        className={`${className ?? "h-4 w-4"} inline-flex shrink-0 items-center justify-center ${fontSize ? "" : "text-base"} leading-none`}
        style={{ ...style, ...(fontSize ? { fontSize } : {}) }}
      >
        {name}
      </span>
    );
  }

  return <Component className={className ?? "h-4 w-4"} style={style} />;
}
