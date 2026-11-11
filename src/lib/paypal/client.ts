// PayPal REST access with plain fetch. Server only.

const baseUrl = () => process.env.PAYPAL_BASE_URL || "https://api-m.sandbox.paypal.com";

export function paypalMode(): "sandbox" | "simulated" {
  return process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "sandbox" : "simulated";
}

let token: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt) return token.value;
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15000),
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`PayPal token ${res.status}: ${body}`);
    throw new Error(`PayPal token request failed (${res.status}): ${body}`);
  }
  const data = JSON.parse(body) as { access_token: string; expires_in: number };
  // Renew one minute before PayPal expires the token.
  token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
  return token.value;
}

type PaypalInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

export async function paypalFetch<T>(path: string, init: PaypalInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`PayPal ${init.method ?? "GET"} ${path} ${res.status}: ${body}`);
    throw new Error(`PayPal ${init.method ?? "GET"} ${path} failed (${res.status}): ${body}`);
  }
  return (body ? JSON.parse(body) : undefined) as T;
}
