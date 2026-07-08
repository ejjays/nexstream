// pure inbox helpers — no supabase import.

export type InboxType = 'reply' | 'mention' | 'like' | 'comment';

export type InboxItem = {
  id: string;
  type: InboxType;
  actorName: string;
  actorAvatar: string | null;
  updateId: string | null;
  commentId: string | null;
  preview: string;
  createdAt: string;
  read: boolean;
};

export function countUnread(items: InboxItem[]): number {
  return items.reduce((total, item) => (item.read ? total : total + 1), 0);
}

// cap at 9+ so the badge pill never widens.
export function badgeLabel(count: number): string {
  if (count <= 0) return '';
  return count > 9 ? '9+' : String(count);
}

export function notificationAction(type: InboxType): string {
  switch (type) {
    case 'reply':
      return 'replied to your comment';
    case 'mention':
      return 'mentioned you';
    case 'like':
      return 'liked your comment';
    case 'comment':
      return 'commented on a post';
  }
}

export function applyAllRead(items: InboxItem[]): InboxItem[] {
  return items.map((item) => (item.read ? item : { ...item, read: true }));
}
