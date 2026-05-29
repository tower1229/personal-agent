import { signSession, buildSessionCookie } from "../../src/auth.js";

export async function createAdminApiClient(baseUrl: string, ownerTgUserId: number, adminSessionSecret: string) {
  const sessionValue = await signSession({
    user: {
      id: ownerTgUserId,
      username: "admin",
      firstName: "Admin",
      photoUrl: ""
    },
    secret: adminSessionSecret
  });
  
  const cookie = buildSessionCookie({ value: sessionValue });
  
  return {
    async post(endpoint: string, data: any) {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookie
        },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        throw new Error(`API Error: ${res.status} ${await res.text()}`);
      }
      return res.json();
    }
  };
}
