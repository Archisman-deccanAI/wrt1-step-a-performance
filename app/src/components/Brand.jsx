import React from 'react'
import logo from '../assets/deccan-logo.png'

// Official Deccan mark. The asset is a white silhouette; `variant="dark"`
// recolors it for light backgrounds via CSS filter (see styles.css).
export default function Brand({ variant = 'light', size = 'md' }) {
  return (
    <span className={`brand brand-${variant} brand-${size}`}>
      <img className="brand-logo" src={logo} alt="Deccan" draggable="false" />
    </span>
  )
}
