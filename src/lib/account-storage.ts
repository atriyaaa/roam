let activeUserId: string | null = null;

export function setStorageUser(userId: string | null) {
  activeUserId = userId;
}

function accountKey(key: string) {
  if (!activeUserId) {
    throw new Error("Sign in before accessing your workspace.");
  }

  return `roam.account.${activeUserId}.${key}`;
}

export const accountStorage = {
  getItem(key: string) {
    return window.localStorage.getItem(accountKey(key));
  },

  setItem(key: string, value: string) {
    window.localStorage.setItem(accountKey(key), value);
  },

  removeItem(key: string) {
    window.localStorage.removeItem(accountKey(key));
  },
};