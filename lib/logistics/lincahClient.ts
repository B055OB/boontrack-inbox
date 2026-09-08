export interface LincahCredentials {
  partnerId: string;
  token: string;
}

export interface OngkirPayload {
  isPickup: boolean;
  isCod: boolean;
  weight: number;
  packagePrice: number;
  originCode: string;
  destinationCode: string;
  dimensions?: [number, number, number];
}

export interface CreateOrderPayload {
  sender_type: 'picked up' | 'drop off';
  address_ref: string;
  name: string;
  phone: string;
  address: string;
  destination: string;
  type: 'cod' | 'regular';
  courier: string;
  courier_service: string;
  cod_price?: number;
  product_price?: number;
  weight: number;
  quantity: number;
  product_name: string;
  picked_up_time?: string;
  note?: string;
  isInsurance?: boolean;
}

export class LincahClient {
  private baseUrl = 'https://api.lincah.id/openapi';
  private headers: Record<string, string>;

  constructor({ partnerId, token }: LincahCredentials) {
    this.headers = {
      'Content-Type': 'application/json',
      'partner-id': partnerId,
      Authorization: `Bearer ${token}`,
    };
  }

  // 1. Cari Kecamatan (min 3 karakter)
  async searchDistrict(query: string) {
    const res = await fetch(`${this.baseUrl}/district/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: this.headers,
    });
    return res.json();
  }

  // 2. Cek Ongkir Ekspedisi
  async calculateOngkir(payload: OngkirPayload) {
    const res = await fetch(`${this.baseUrl}/ongkir`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        isPickup: payload.isPickup,
        isCod: payload.isCod ? 'true' : 'false',
        weight: payload.weight,
        packagePrice: payload.packagePrice,
        dimensions: payload.dimensions || [10, 10, 10],
        origin: { code: payload.originCode },
        destination: { code: payload.destinationCode },
      }),
    });
    return res.json();
  }

  // 3. Create Order
  async createOrder(payload: CreateOrderPayload) {
    const res = await fetch(`${this.baseUrl}/order`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  // 4. Cetak Label Thermal 10x15
  async printThermalLabel(orderIds: string[]) {
    const res = await fetch(`${this.baseUrl}/order/print`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        ids: orderIds,
        type: 'thermal-10x15',
        onlyNonPrint: false,
        mask: true,
      }),
    });
    return res.json();
  }
}