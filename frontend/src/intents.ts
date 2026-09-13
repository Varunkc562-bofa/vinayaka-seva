// Cross-screen "pending intent" bus — reliable on both web and native.
// A screen tells the router "next time <target> gets focused, run <intent>",
// then navigates. The target screen consumes the intent on focus and clears it.

type Intent = "new-donation" | "new-expense";

let pending: Intent | null = null;
const subs = new Set<() => void>();

export const intents = {
  set(name: Intent) {
    pending = name;
    subs.forEach((cb) => cb());
  },
  consume(name: Intent): boolean {
    if (pending === name) {
      pending = null;
      subs.forEach((cb) => cb());
      return true;
    }
    return false;
  },
  peek(): Intent | null {
    return pending;
  },
  subscribe(cb: () => void) {
    subs.add(cb);
    return () => subs.delete(cb);
  },
};
