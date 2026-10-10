// tests/helpers/next-mocks.ts
// Minimal stand-ins for next/headers, next/cache and next/navigation.
export const cookieJar = new Map<string, string>();

export const nextHeadersMock = {
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
};

export class RedirectError extends Error {
  constructor(public url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}

export const nextNavigationMock = {
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
};

export const nextCacheMock = {
  revalidatePath: () => {},
};
