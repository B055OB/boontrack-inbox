/**
 * lib/whatsapp/baileys-call-handler.ts
 * Dedicated Baileys & WhatsApp Call Auto-Reject Engine.
 *
 * Requirements:
 * Ketika ada panggilan suara / video WhatsApp masuk ke nomor bot Boon, sistem wajib:
 * 1. Otomatis menolak panggilan (rejectCall) jika status panggilan adalah 'offer'
 * 2. Mengirimkan pesan teks penjelasan bahwa nomor ini adalah sistem layanan otomatis / non-personal.
 */

export const AUTO_REJECT_CALL_MESSAGE =
  'Halo! Mohon maaf, nomor ini adalah sistem layanan otomatis dan tidak dapat menerima panggilan suara/telepon 🙏';

export interface BaileysCall {
  id: string;
  from: string;
  status: 'offer' | 'ringing' | 'timeout' | 'reject' | 'accept' | string;
  isVideo?: boolean;
  isGroup?: boolean;
  groupJid?: string;
  date?: Date | number;
  [key: string]: any;
}

export interface BaileysSocketLike {
  rejectCall?: (id: string, from: string) => Promise<any>;
  sendMessage?: (
    jid: string,
    content: { text: string; [key: string]: any },
    options?: any
  ) => Promise<any>;
  ev?: {
    on: (event: string, handler: (...args: any[]) => any) => any;
    off?: (event: string, handler: (...args: any[]) => any) => any;
  };
}

export interface CallHandlerOptions {
  replyText?: string;
  onCallRejected?: (call: BaileysCall) => void | Promise<void>;
  onError?: (error: any, call: BaileysCall) => void;
}

/**
 * Memproses daftar event panggilan masuk Baileys.
 * Menolak panggilan berstatus 'offer' dan mengirimkan pesan balasan notifikasi bot.
 *
 * @param sock Instance Baileys WASocket
 * @param calls Daftar event call masuk
 * @param options Opsi kustomisasi pesan balasan atau hook callback
 * @returns Jumlah panggilan yang berhasil ditolak
 */
export async function handleBaileysIncomingCalls(
  sock: BaileysSocketLike,
  calls: BaileysCall[],
  options?: CallHandlerOptions
): Promise<number> {
  if (!Array.isArray(calls) || calls.length === 0) {
    return 0;
  }

  const replyText = options?.replyText || AUTO_REJECT_CALL_MESSAGE;
  let rejectedCount = 0;

  for (const call of calls) {
    if (!call || typeof call !== 'object') continue;

    // Hanya tolak panggilan saat statusnya adalah 'offer' (panggilan masuk yang baru diajukan)
    if (call.status === 'offer' && call.id && call.from) {
      try {
        // 1. Putus / tolak panggilan otomatis
        if (typeof sock.rejectCall === 'function') {
          await sock.rejectCall(call.id, call.from);
        }

        // 2. Kirim pesan notifikasi singkat bot
        if (typeof sock.sendMessage === 'function') {
          await sock.sendMessage(call.from, {
            text: replyText,
          });
        }

        // 3. Callback hook jika ada audit / persistence
        if (options?.onCallRejected) {
          await options.onCallRejected(call);
        }

        rejectedCount++;
      } catch (err) {
        console.error(
          `[Baileys Call Auto-Reject] Error rejecting call id=${call.id} from=${call.from}:`,
          err
        );
        if (options?.onError) {
          options.onError(err, call);
        }
      }
    }
  }

  return rejectedCount;
}

/**
 * Memasang listener panggilan masuk (sock.ev.on('call')) pada socket Baileys.
 * Sesuai dengan spesifikasi resmi:
 *
 * ```ts
 * sock.ev.on('call', async (calls) => {
 *   for (const call of calls) {
 *     if (call.status === 'offer') {
 *       await sock.rejectCall(call.id, call.from);
 *       await sock.sendMessage(call.from, {
 *         text: 'Halo! Mohon maaf, nomor ini adalah sistem layanan otomatis dan tidak dapat menerima panggilan suara/telepon 🙏'
 *       });
 *     }
 *   }
 * });
 * ```
 */
export function attachBaileysCallRejectListener(
  sock: BaileysSocketLike,
  options?: CallHandlerOptions
): void {
  if (!sock?.ev?.on) {
    console.warn('[Baileys Call Handler] Socket instance does not provide ev.on event bus.');
    return;
  }

  sock.ev.on('call', async (calls: BaileysCall[] | BaileysCall) => {
    const callList = Array.isArray(calls) ? calls : [calls];
    await handleBaileysIncomingCalls(sock, callList, options);
  });
}

/**
 * Helper untuk menolak panggilan via Evolution API v2 (HTTP Gateway).
 * Digunakan jika Baileys berjalan di server container Evolution API.
 */
export async function rejectEvolutionCall(
  apiUrl: string,
  instanceName: string,
  callId: string,
  fromJid: string,
  apiKey: string
): Promise<boolean> {
  const baseUrl = apiUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}/call/rejectCall/${encodeURIComponent(instanceName)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify({
        callId,
        id: callId,
        from: fromJid,
      }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (err) {
    console.warn(`[Evolution Call Reject] HTTP request failed for call ${callId}:`, err);
    return false;
  }
}
