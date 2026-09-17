export function isActiveAppPath(pathname: string, destination: string) {
  const currentPath = pathname.split(/[?#]/, 1)[0] || "/";
  const targetPath = destination.split(/[?#]/, 1)[0] || "/";

  if (targetPath === "/app") return currentPath === targetPath;
  return currentPath === targetPath || currentPath.startsWith(`${targetPath}/`);
}
