export function cashierAvatarSrc(user) {
  const isDwi = user?.username?.trim().toLowerCase() === "dwi";
  const filename = isDwi ? "cashier-dwi.svg" : "cashier-dina.svg";
  return `./assets/images/${filename}`;
}
