// Server-side only: do not bake ENV_TYPE into a NEXT_PUBLIC_* build variable.
// Versioned asset paths let Android detect artwork changes in the manifest.
export function getAppIcons(envType: string | undefined = process.env.ENV_TYPE) {
  const stem = envType === "work" ? "icon-maroon-v2-work" : "icon-blue-v1";
  return {
    icon192: `/icons/${stem}-192.png`,
    icon512: `/icons/${stem}-512.png`,
    maskable512: `/icons/${stem}-maskable-512.png`,
    apple: `/icons/apple-touch-${stem}.png`,
  };
}
