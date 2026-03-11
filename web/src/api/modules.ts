export type ModulesResponse = {
  modules: Record<string, boolean>;
};

const BROWSER_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE) || "/api";

export async function fetchModules(): Promise<ModulesResponse> {
  const res = await fetch(`${BROWSER_BASE}/modules`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to load modules (${res.status})`);
  }
  return res.json() as Promise<ModulesResponse>;
}

export async function fetchAdminModules(): Promise<ModulesResponse> {
  const res = await fetch(`${BROWSER_BASE}/admin/modules`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to load modules (${res.status})`);
  }
  return res.json() as Promise<ModulesResponse>;
}

export async function updateModule(key: string, enabled: boolean): Promise<void> {
  const res = await fetch(`${BROWSER_BASE}/admin/modules/${key}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => "")) || `Failed to update module (${res.status})`;
    throw new Error(text);
  }
}
