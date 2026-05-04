import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/server/db';
import { eq, desc, and, count } from 'drizzle-orm';
import { applyRateLimit, RATE_LIMITS } from '@/server/api-rate-limit';
import { requireUserId } from '@/server/api-validation';

/**
 * GET /api/v1/notifications
 * 
 * Query params:
 *   - limit (default 20, max 100)
 *   - offset (default 0)
 *   - unread (if "true", only unread)
 * 
 * Returns: { notifications: [...], unreadCount: number, total: number }
 */
export async function GET(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  try {
    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '20', 10) || 20, 1), 100);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
    const unreadOnly = url.searchParams.get('unread') === 'true';

    // Build conditions
    const conditions = [eq(schema.notifications.userId, userId)];
    if (unreadOnly) {
      conditions.push(eq(schema.notifications.read, 0));
    }

    // Fetch notifications
    const items = await db
      .select()
      .from(schema.notifications)
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.createdAt))
      .limit(limit)
      .offset(offset);

    // Unread count
    const [unreadResult] = await db
        .select({ count: count() })
        .from(schema.notifications)
        .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.read, 0),
      ));

    // Total count
    const [totalResult] = await db
      .select({ count: count() })
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId));

    return NextResponse.json({
      notifications: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        icon: n.icon,
        color: n.color,
        href: n.href,
        pluginSlug: n.pluginSlug,
        metadata: n.metadata,
        read: n.read === 1,
        createdAt: n.createdAt,
      })),
      unreadCount: unreadResult?.count || 0,
      total: totalResult?.count || 0,
    });
  } catch (e: any) {
    console.error('Notifications GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/v1/notifications
 * 
 * Create a new notification. Used by plugins and internal systems.
 * 
 * Body: { type, title, body?, icon?, color?, href?, pluginSlug?, metadata? }
 * 
 * Special action: { action: "mark-read", id?: string }  — mark one or all as read
 * Special action: { action: "mark-all-read" }
 * Special action: { action: "clear-read" }  — delete all read notifications
 * Special action: { action: "delete", id: string }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth instanceof NextResponse) return auth;
  const userId = auth;

  const limited = applyRateLimit(req, 'notifications-mutate', RATE_LIMITS.write);
  if (limited) return limited;

  try {
    const body = await req.json();

    // Handle special actions
    if (body.action === 'mark-read' && body.id) {
      await db
        .update(schema.notifications)
        .set({ read: 1 })
        .where(and(
          eq(schema.notifications.id, body.id),
          eq(schema.notifications.userId, userId),
        ));
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'mark-all-read') {
      await db
        .update(schema.notifications)
        .set({ read: 1 })
        .where(and(
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.read, 0),
        ));
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'clear-read') {
      await db
        .delete(schema.notifications)
        .where(and(
          eq(schema.notifications.userId, userId),
          eq(schema.notifications.read, 1),
        ));
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'delete' && body.id) {
      await db
        .delete(schema.notifications)
        .where(and(
          eq(schema.notifications.id, body.id),
          eq(schema.notifications.userId, userId),
        ));
      return NextResponse.json({ ok: true });
    }

    // Create new notification
    const { type, title, body: notifBody, icon, color, href, pluginSlug, metadata } = body;

    if (!type || !title) {
      return NextResponse.json({ error: 'type and title are required' }, { status: 400 });
    }

    const validTypes = [
      'import_complete', 'analysis_ready', 'review_due', 'plugin_event',
      'system', 'export_ready', 'connection_found', 'milestone',
    ];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const [notification] = await db
      .insert(schema.notifications)
      .values({
        userId,
        type,
        title,
        body: notifBody || null,
        icon: icon || null,
        color: color || 'teal',
        href: href || null,
        pluginSlug: pluginSlug || null,
        metadata: metadata || {},
        read: 0,
      })
      .returning();

    return NextResponse.json({
      notification: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        icon: notification.icon,
        color: notification.color,
        href: notification.href,
        pluginSlug: notification.pluginSlug,
        metadata: notification.metadata,
        read: false,
        createdAt: notification.createdAt,
      },
    });
  } catch (e: any) {
    console.error('Notifications POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
