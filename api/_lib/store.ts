// Tiny key–value store for Telegram chats, linked fields and farmer records.
// Upstash Redis / Vercel KV over REST when configured; otherwise process memory (fine for
// local dev and a single warm demo instance, lost on cold starts).

export interface Store {
  readonly kind: 'redis' | 'memory';
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  addToSet(key: string, member: string): Promise<void>;
  members(key: string): Promise<string[]>;
}

function redisStore(url: string, token: string): Store {
  const command = async (args: (string | number)[]): Promise<unknown> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    const body = (await res.json()) as { result?: unknown; error?: string };
    if (!res.ok || body.error) throw new Error(`redis: ${body.error ?? res.status}`);
    return body.result;
  };
  return {
    kind: 'redis',
    async get<T>(key: string) {
      const raw = await command(['GET', key]);
      return typeof raw === 'string' ? (JSON.parse(raw) as T) : null;
    },
    async set(key, value) {
      await command(['SET', key, JSON.stringify(value)]);
    },
    async addToSet(key, member) {
      await command(['SADD', key, member]);
    },
    async members(key) {
      return ((await command(['SMEMBERS', key])) as string[] | null) ?? [];
    },
  };
}

type Memory = { values: Map<string, string>; sets: Map<string, Set<string>> };
const memory: Memory = ((globalThis as { __sunwaterStore?: Memory }).__sunwaterStore ??= {
  values: new Map(),
  sets: new Map(),
});

function memoryStore(): Store {
  return {
    kind: 'memory',
    async get<T>(key: string) {
      const raw = memory.values.get(key);
      return raw == null ? null : (JSON.parse(raw) as T);
    },
    async set(key, value) {
      memory.values.set(key, JSON.stringify(value));
    },
    async addToSet(key, member) {
      const set = memory.sets.get(key) ?? new Set<string>();
      set.add(member);
      memory.sets.set(key, set);
    },
    async members(key) {
      return [...(memory.sets.get(key) ?? [])];
    },
  };
}

export function getStore(): Store {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisStore(url, token) : memoryStore();
}
