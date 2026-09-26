import type { ReadonlySignal } from '@preact/signals';
import type { Announcement } from '../state/store';

/**
 * Where announcements for screen readers go (`role="status"`: polite, read as a whole). It is part of the page
 * from the start, because screen readers only follow changes in regions they already know.
 */
export function LiveRegion({ announcement }: { announcement: ReadonlySignal<Announcement> }) {
  const { text, id } = announcement.value;
  return (
    <div role="status" class="visually-hidden">
      {text !== '' && <span key={id}>{text}</span>}
    </div>
  );
}
