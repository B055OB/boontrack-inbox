import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const backendBaseUrl =
            process.env.BACKEND_API_URL ||
            process.env.NEXT_PUBLIC_API_BASE_URL ||
            'https://api.boontrack.com';

        const response = await fetch(`${backendBaseUrl}/api/v1/creator/ugc/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            return NextResponse.json(
                { success: false, detail: data.detail || 'Gagal terhubung ke engine backend' },
                { status: response.status }
            );
        }

        return NextResponse.json(data);
    } catch (err: any) {
        return NextResponse.json(
            { success: false, detail: err.message || 'Koneksi ke backend bermasalah' },
            { status: 500 }
        );
    }
}