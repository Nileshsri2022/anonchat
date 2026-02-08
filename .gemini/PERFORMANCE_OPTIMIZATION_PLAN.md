# AnonChat Performance Optimization Plan
## Based on Vercel React Best Practices

---

## Executive Summary
This plan implements 12 optimizations from the Vercel React Best Practices skill to improve bundle size, reduce load times, and enhance runtime performance.

**Estimated Impact:**
- 🚀 Initial bundle size: -40-60KB
- ⚡ First Contentful Paint: -200-400ms
- 🔄 Re-renders: -30-50% reduction

---

## Phase 1: Bundle Size Optimization (CRITICAL)
**Priority: 🔴 CRITICAL | Impact: HIGH | Effort: LOW**

### 1.1 Dynamic Imports for Modals
**Rule:** `bundle-dynamic-imports`

**Current Issue:**
All modals are imported statically in `app/page.tsx`, adding ~50KB to initial bundle.

**Files to modify:**
- `app/page.tsx`

**Implementation:**
```tsx
// BEFORE
import { OnboardingModal } from '@/components/onboarding-modal';
import { RoomJoinModal } from '@/components/room-join-modal';
import { SettingsPanel } from '@/components/settings-panel';
import { CreateGroupModal } from '@/components/create-group-modal';

// AFTER
import dynamic from 'next/dynamic';

const OnboardingModal = dynamic(() => import('@/components/onboarding-modal').then(m => ({ default: m.OnboardingModal })), {
  loading: () => <div className="animate-pulse" />,
  ssr: false
});

const RoomJoinModal = dynamic(() => import('@/components/room-join-modal').then(m => ({ default: m.RoomJoinModal })), {
  ssr: false
});

const SettingsPanel = dynamic(() => import('@/components/settings-panel').then(m => ({ default: m.SettingsPanel })), {
  ssr: false
});

const CreateGroupModal = dynamic(() => import('@/components/create-group-modal').then(m => ({ default: m.CreateGroupModal })), {
  ssr: false
});
```

**Estimated savings:** ~40KB initial bundle

---

### 1.2 Dynamic Import QR Components
**Rule:** `bundle-dynamic-imports`

**Current Issue:**
QR code components include heavy `qrcode` library (~15KB) loaded even when not used.

**Files to modify:**
- `components/contact-list.tsx`
- `components/qr-contact-modal.tsx`

**Implementation:**
```tsx
// In contact-list.tsx
const QRContactModal = dynamic(
  () => import('@/components/qr-contact-modal').then(m => ({ default: m.QRContactModal })),
  { ssr: false }
);
```

**Estimated savings:** ~15KB

---

### 1.3 Lazy Load Tor Circuit Display
**Rule:** `bundle-conditional`

**Current Issue:**
Tor circuit display component is loaded even when Tor isn't connected.

**Files to modify:**
- `components/room-list.tsx` (if used there)

**Implementation:**
Only load when Tor status is active.

---

## Phase 2: Re-render Optimization (MEDIUM)
**Priority: 🟡 MEDIUM | Impact: MEDIUM | Effort: MEDIUM**

### 2.1 Memoize Heavy Components
**Rule:** `rerender-memo`

**Files to modify:**
- `components/message-bubble.tsx`
- `components/room-list.tsx`
- `components/contact-list.tsx`

**Implementation:**
```tsx
// Wrap with React.memo for components receiving object props
export const MessageBubble = React.memo(function MessageBubble(props: MessageBubbleProps) {
  // ... component code
});

// Add custom comparison for complex props
export const RoomList = React.memo(function RoomList(props: RoomListProps) {
  // ...
}, (prevProps, nextProps) => {
  return prevProps.selectedId === nextProps.selectedId 
    && prevProps.rooms.length === nextProps.rooms.length;
});
```

---

### 2.2 Functional setState Pattern
**Rule:** `rerender-functional-setstate`

**Files to modify:**
- `app/page.tsx`

**Current Issue:** Some callbacks recreate on each render.

**Implementation:**
```tsx
// Already using useCallback, verify stable dependencies
const handleJoinRoom = useCallback((roomId: string, roomName: string, isNewRoom: boolean) => {
  setRooms(prev => {
    // ✅ Already using functional pattern - good!
    const existingRoom = prev.find(r => r.id === roomId);
    if (!existingRoom) {
      return [...prev, newRoom];
    }
    return prev;
  });
  setSelectedRoom(roomId);
}, []); // ✅ Empty deps is correct with functional setState
```

---

### 2.3 Derived State Optimization
**Rule:** `rerender-derived-state`

**Files to modify:**
- `app/page.tsx`

**Implementation:**
```tsx
// BEFORE - recalculates even when rooms don't change
const selectedRoomData = useMemo(
  () => rooms.find(r => r.id === selectedRoom), 
  [rooms, selectedRoom]
); // ✅ Already optimized with useMemo

// Additional optimization - derive booleans for conditional rendering
const hasRooms = rooms.length > 0;
const isRoomSelected = selectedRoom !== null;
```

---

## Phase 3: Rendering Performance (MEDIUM)
**Priority: 🟡 MEDIUM | Impact: MEDIUM | Effort: LOW**

### 3.1 Conditional Rendering Fix
**Rule:** `rendering-conditional-render`

**Files to modify:**
- Multiple component files

**Current Issue:** Using `&&` for conditional rendering can render `0` or `false`.

**Implementation:**
```tsx
// BEFORE (can render 0)
{rooms.length && <RoomList />}

// AFTER (ternary is safer)
{rooms.length > 0 ? <RoomList /> : null}
```

---

### 3.2 Content Visibility for Lists
**Rule:** `rendering-content-visibility`

**Files to modify:**
- `components/room-list.tsx`
- `components/contact-list.tsx`
- `components/chatroom-interface.tsx` (message list)

**Implementation:**
```css
/* In component or global CSS */
.message-list-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 80px; /* Approximate height */
}
```

---

## Phase 4: JavaScript Performance (LOW-MEDIUM)
**Priority: 🟢 LOW | Impact: LOW | Effort: LOW**

### 4.1 Cache localStorage Reads
**Rule:** `js-cache-storage`

**Files to modify:**
- `app/page.tsx`
- `lib/contact-manager.ts`

**Implementation:**
```tsx
// BEFORE - reads on every check
const hasSeenOnboarding = localStorage.getItem('anonchat_onboarding_complete');

// AFTER - cache in module-level variable
let cachedOnboardingStatus: string | null = null;

function getOnboardingStatus() {
  if (cachedOnboardingStatus === null) {
    cachedOnboardingStatus = localStorage.getItem('anonchat_onboarding_complete');
  }
  return cachedOnboardingStatus;
}
```

---

### 4.2 Use Set for O(1) Lookups
**Rule:** `js-set-map-lookups`

**Files to modify:**
- Wherever arrays are used for membership checks

**Implementation:**
```tsx
// BEFORE
const existingRoom = rooms.find(r => r.id === roomId);

// AFTER (if checked frequently)
const roomIds = useMemo(() => new Set(rooms.map(r => r.id)), [rooms]);
const roomExists = roomIds.has(roomId);
```

---

## Implementation Checklist

### Phase 1: Bundle Optimization ✅
- [ ] 1.1 Dynamic import modals in page.tsx
- [ ] 1.2 Dynamic import QR components
- [ ] 1.3 Lazy load Tor circuit display

### Phase 2: Re-render Optimization
- [ ] 2.1 Add React.memo to heavy components
- [ ] 2.2 Verify functional setState patterns
- [ ] 2.3 Optimize derived state

### Phase 3: Rendering Performance
- [ ] 3.1 Fix conditional rendering patterns
- [ ] 3.2 Add content-visibility CSS

### Phase 4: JavaScript Performance
- [ ] 4.1 Cache localStorage reads
- [ ] 4.2 Use Set for lookups

---

## Testing & Validation

After each phase:
1. Run `bun run build` - check bundle sizes
2. Run Lighthouse audit in browser
3. Test user interactions for smoothness
4. Monitor React DevTools Profiler

---

## Priority Order for Implementation

1. **Phase 1.1** - Dynamic imports for modals (biggest impact, easiest)
2. **Phase 1.2** - Dynamic import QR components
3. **Phase 2.1** - React.memo for lists
4. **Phase 3.2** - Content visibility CSS
5. Remaining items

---

Created: 2026-02-08
