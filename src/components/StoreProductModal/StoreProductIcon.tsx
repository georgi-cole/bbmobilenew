import type { StoreProductIconName } from '../../vip/vipConfig'
import { hasStoreProductIcon } from './storeProductIconUtils'

interface StoreProductIconProps {
  name: StoreProductIconName
  className?: string
}

function IconArtwork({ name }: { name: StoreProductIconName }) {
  switch (name) {
    case 'vip':
      return (
        <>
          <path
            className="store-product-icon__surface"
            d="M5 24s7-11 19-11 19 11 19 11-7 11-19 11S5 24 5 24Z"
          />
          <path d="M5 24s7-11 19-11 19 11 19 11-7 11-19 11S5 24 5 24Z" />
          <circle className="store-product-icon__core" cx="24" cy="24" r="6" />
          <path d="m16 10 3-5 5 4 5-4 3 5M9 14 5 10m34 4 4-4" />
        </>
      )
    case 'survivalMode':
      return (
        <>
          <path
            className="store-product-icon__surface"
            d="m24 5 15 5v12c0 10-5.6 16.7-15 21-9.4-4.3-15-11-15-21V10l15-5Z"
          />
          <path d="m24 5 15 5v12c0 10-5.6 16.7-15 21-9.4-4.3-15-11-15-21V10l15-5Z" />
          <path d="M13 25h6l3-8 5 16 3.5-10 2.2 4H37" />
        </>
      )
    case 'publicMode':
      return (
        <>
          <path
            className="store-product-icon__surface"
            d="M4 22s7.5-11 20-11 20 11 20 11-7.5 11-20 11S4 22 4 22Z"
          />
          <path d="M4 22s7.5-11 20-11 20 11 20 11-7.5 11-20 11S4 22 4 22Z" />
          <circle className="store-product-icon__core" cx="24" cy="22" r="6" />
          <circle cx="13" cy="39" r="2.2" />
          <circle cx="24" cy="40" r="2.2" />
          <circle cx="35" cy="39" r="2.2" />
        </>
      )
    case 'tribunalHouse':
      return (
        <>
          <path className="store-product-icon__surface" d="m7 18 17-12 17 12H7Zm4 2h26v20H11V20Z" />
          <path d="m7 18 17-12 17 12H7Zm4 22h26M14 20v16m20-16v16M20 20v16m8-16v16" />
          <path d="M18 14h12m-6-5v7m-8 12h16" />
        </>
      )
    case 'dramaMode':
      return (
        <>
          <path
            className="store-product-icon__surface"
            d="M7 10c8-3 14-1 18 2v14c-4 8-12 10-18 4V10Zm18 3c7-3 12-1 16 1v15c-4 8-11 9-16 4V13Z"
          />
          <path d="M7 10c8-3 14-1 18 2v14c-4 8-12 10-18 4V10Zm18 3c7-3 12-1 16 1v15c-4 8-11 9-16 4V13Z" />
          <path d="M11 17h3m5 1h3m-10 7c3 3 6 3 9 0m8-5h3m5-1h2m-10 9c3-3 6-3 9 0" />
        </>
      )
    case 'cupidArrow':
      return (
        <>
          <path
            className="store-product-icon__surface"
            d="M24 40S7 30 7 17c0-6 4-10 10-10 3.6 0 6 2 7 4 1-2 3.4-4 7-4 6 0 10 4 10 10 0 13-17 23-17 23Z"
          />
          <path d="M24 40S7 30 7 17c0-6 4-10 10-10 3.6 0 6 2 7 4 1-2 3.4-4 7-4 6 0 10 4 10 10 0 13-17 23-17 23Z" />
          <path d="M8 38 40 8M33 8h7v7M8 31v7h7" />
        </>
      )
    case 'voxPopuli':
      return (
        <>
          <path
            className="store-product-icon__surface"
            d="M5 21s7-10 19-10 19 10 19 10-7 10-19 10S5 21 5 21Z"
          />
          <path d="M5 21s7-10 19-10 19 10 19 10-7 10-19 10S5 21 5 21Z" />
          <circle className="store-product-icon__core" cx="24" cy="21" r="6" />
          <path d="M12 39h24M16 35v8m8-10v10m8-8v8" />
        </>
      )
    case 'noAds':
      return (
        <>
          <rect
            className="store-product-icon__surface"
            x="6"
            y="10"
            width="36"
            height="28"
            rx="6"
          />
          <rect x="6" y="10" width="36" height="28" rx="6" />
          <path d="M14 29V19h5l3 10m-7-4h6m6-6h4c4 0 6 2 6 5s-2 5-6 5h-4V19ZM8 41 40 7" />
        </>
      )
    default:
      return (
        <>
          <path
            className="store-product-icon__surface"
            d="M5 24s7-11 19-11 19 11 19 11-7 11-19 11S5 24 5 24Z"
          />
          <path d="M5 24s7-11 19-11 19 11 19 11-7 11-19 11S5 24 5 24Z" />
          <circle className="store-product-icon__core" cx="24" cy="24" r="5" />
        </>
      )
  }
}

export default function StoreProductIcon({ name, className = '' }: StoreProductIconProps) {
  const safeName = hasStoreProductIcon(name) ? name : 'fallback'
  return (
    <svg
      className={`store-product-icon ${className}`.trim()}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <IconArtwork name={safeName} />
    </svg>
  )
}
