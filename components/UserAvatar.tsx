import { memo } from "react";

export function initials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return letters || "?";
}

/** Цвет заглушки зависит от имени: у каждого человека свой, как в Telegram. */
export function nameHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

type Props = {
  name: string;
  url?: string | null;
  size?: string;
  className?: string;
};

export const UserAvatar = memo(function UserAvatar({ name, url, size = "w-11 h-11", className = "" }: Props) {
  const hue = nameHue(name);
  return (
    <div
      style={
        url
          ? undefined
          : { backgroundImage: `linear-gradient(160deg, oklch(0.62 0.12 ${hue}), oklch(0.42 0.1 ${(hue + 40) % 360}))` }
      }
      className={`${size} ${className} shrink-0 rounded-full bg-surface-2 flex items-center justify-center ${
        url ? "text-foreground" : "text-white"
      } font-semibold text-xs overflow-hidden`}
    >
      {url ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </div>
  );
});
