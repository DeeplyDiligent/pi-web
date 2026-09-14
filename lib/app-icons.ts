// Server-side only: do not bake ENV_TYPE into a NEXT_PUBLIC_* build variable.
// Versioned asset paths let Android detect artwork changes in the manifest.
export function getAppIcons(envType: string | undefined = process.env.ENV_TYPE) {
  const variant = envType === "work" ? "-work" : "";
  return {
    icon192: `/icons/icon-blue-v2${variant}-192.png`,
    icon512: `/icons/icon-blue-v2${variant}-512.png`,
    maskable512: `/icons/icon-blue-v2${variant}-maskable-512.png`,
    apple: `/icons/apple-touch-icon-blue-v2${variant}.png`,
  };
}
