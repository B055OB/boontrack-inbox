import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSupabaseAdmin, getSupabase } from '@/lib/supabaseClient';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ success: false, error: 'conversationId is required', messages: [] }, { status: 400 });
    }

    const supabase = getSupabaseAdmin() || getSupabase();
    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Database client unavailable', messages: [] }, { status: 500 });
    }

    const { data: messages, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(300);

    if (error) {
      return NextResponse.json({ success: false, error: error.message, messages: [] }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      messages: messages || [],
      count: messages?.length || 0,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server error', messages: [] }, { status: 500 });
  }
}
