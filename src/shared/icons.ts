// Lucide line icons, imported individually so only these are bundled.
import {
  ArrowRight, Award, Bell, BookmarkPlus, BriefcaseBusiness, Building2, Check, ChevronDown, ChevronRight, CircleAlert,
  CirclePause, CirclePlay, Clock, Compass, ExternalLink, FileText, Flag, Focus, House, Inbox, LayoutDashboard, Leaf,
  ListChecks, LogOut, MapPin, MessageCircle, PartyPopper, Pencil, Plus, RotateCcw, Search, Send, Settings, SkipForward,
  Sparkles, Star, Sun, Target, Timer, Trash2, Upload, User, Wallet, X, Zap, BatteryLow, CloudSun, createElement,
  type IconNode,
} from 'lucide';

const ICONS = {
  arrowRight: ArrowRight, award: Award, bell: Bell, bookmark: BookmarkPlus, briefcase: BriefcaseBusiness, building: Building2,
  check: Check, chevronDown: ChevronDown, chevronRight: ChevronRight, alert: CircleAlert, pause: CirclePause, play: CirclePlay,
  clock: Clock, compass: Compass, external: ExternalLink, file: FileText, flag: Flag, focus: Focus, home: House, inbox: Inbox,
  dashboard: LayoutDashboard, leaf: Leaf, list: ListChecks, exit: LogOut, pin: MapPin, chat: MessageCircle, party: PartyPopper,
  pencil: Pencil, plus: Plus, resume: RotateCcw, search: Search, send: Send, settings: Settings, skip: SkipForward,
  sparkles: Sparkles, star: Star, sun: Sun, target: Target, timer: Timer, trash: Trash2, upload: Upload, user: User,
  wallet: Wallet, x: X, zap: Zap, batteryLow: BatteryLow, cloudSun: CloudSun,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

/** A decorative line icon (hidden from screen readers; pair it with visible text). */
export function icon(name: IconName, size = 18): SVGElement {
  const svg = createElement(ICONS[name], { width: size, height: size, 'stroke-width': 1.75, 'aria-hidden': 'true', focusable: 'false' });
  return svg;
}
