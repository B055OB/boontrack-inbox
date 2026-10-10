import { NextRequest, NextResponse } from 'next/server';
import { OnlineboostSeedService } from '@/lib/services/onlineboost-seed.service';

export const runtime = 'nodejs';

/**
 * GET /api/internal/seed/onlineboost-products
 * Checks the status of the 2 digital products for tenant onlineboost
 */
export async function GET() {
  try {
    const status = await OnlineboostSeedService.getStatus();
    return NextResponse.json({
      success: true,
      data: status
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/seed/onlineboost-products
 * Seeds/Upserts the 2 digital products for tenant onlineboost to Supabase
 */
export async function POST(req: NextRequest) {
  try {
    // Optional internal token verification
    const authHeader = req.headers.get('authorization');
    const expectedSecret = process.env.INTERNAL_API_SECRET;
    if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized internal request' },
        { status: 401 }
      );
    }

    const result = await OnlineboostSeedService.seed();
    return NextResponse.json({
      success: true,
      message: 'Successfully seeded 2 digital products for tenant onlineboost',
      data: result
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to seed products' },
      { status: 500 }
    );
  }
}
