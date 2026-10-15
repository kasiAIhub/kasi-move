import type { ImgHTMLAttributes } from 'react';
const crops: Record<string, string> = {
  classic: '0 160 470 326',
  'cheese-boy': '473 160 466 326',
  russian: '942 160 459 326',
  breakfast: '0 602 470 326',
  beast: '473 602 466 326',
  chicken: '942 602 459 326',
};
// Display the user's original artwork through six viewports; do not redraw the food.
export function ProductImage({
  src = '',
  alt = '',
  className = '',
  ...rest
}: ImgHTMLAttributes<HTMLImageElement>) {
  const [file, key] = src.split('#');
  if (file === '/images/kota-approved-menu.png' && crops[key])
    return (
      <svg
        className={`product-artwork ${className}`}
        viewBox={crops[key]}
        preserveAspectRatio="xMidYMid slice"
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={!alt}
      >
        <image href={file} width="1401" height="1123" />
      </svg>
    );
  return <img src={src} alt={alt} className={className} {...rest} />;
}
