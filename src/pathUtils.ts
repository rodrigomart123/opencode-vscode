export const windowsPath = (input: string) => /^[A-Za-z]:/.test(input) || input.startsWith("//");

export const workspaceKey = (directory: string) => {
  const value = directory.replaceAll("\\", "/");
  const drive = value.match(/^([A-Za-z]:)\/+$/);
  if (drive) return `${drive[1]}/`;
  if (/^\/+$/i.test(value)) return "/";
  return value.replace(/\/+$/, "");
};

export const sameWorkspace = (left: string, right: string) => {
  const a = workspaceKey(left);
  const b = workspaceKey(right);
  if (windowsPath(a) || windowsPath(b)) return a.toLowerCase() === b.toLowerCase();
  return a === b;
};
