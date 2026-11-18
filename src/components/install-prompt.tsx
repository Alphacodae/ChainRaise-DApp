"use client";

import { useState, useEffect } from "react";
import { usePwa } from "./pwa-provider";

export function InstallPrompt() {
  const { isInstallable, isInstalled, isIos, promptInstall } = usePwa();
  const [dismissed, setDismissed] = useState(true);
  const [showIosGuide, setShowIosGuide] = useState(false);

  useEffect(() => {
    // Check if dismissed previously in this session
    const isDismissed = sessionStorage.getItem("chainraise_pwa_dismissed");
    if (!isDismissed) {
      setDismissed(false);
    }
  }, []);

  if (isInstalled || dismissed || !isInstallable) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem("chainraise_pwa_dismissed", "true");
  };

  const handleInstallClick = async () => {
    if (isIos) {
      setShowIosGuide(true);
    } else {
      await promptInstall();
    }
  };

  return (
    <>
      <div className="pwa-install-banner" role="region" aria-label="Install ChainRaise App">
        <div className="pwa-install-content">
          <div className="pwa-install-icon">✳</div>
          <div className="pwa-install-text">
            <strong>Install ChainRaise Web App</strong>
            <span>Add to home screen for instant access like a native mobile app</span>
          </div>
        </div>
        <div className="pwa-install-actions">
          <button className="button button-install" onClick={handleInstallClick}>
            Install App
          </button>
          <button className="button-dismiss" onClick={handleDismiss} aria-label="Dismiss banner">
            ✕
          </button>
        </div>
      </div>

      {showIosGuide && (
        <div className="pwa-ios-modal-overlay" onClick={() => setShowIosGuide(false)}>
          <div className="pwa-ios-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pwa-ios-header">
              <h3>Install on iPhone / iPad</h3>
              <button className="button-dismiss" onClick={() => setShowIosGuide(false)}>✕</button>
            </div>
            <p>To install ChainRaise on your iOS device:</p>
            <ol className="pwa-ios-steps">
              <li>
                Tap the <strong>Share</strong> button <span className="share-icon">⎋</span> at the bottom of Safari.
              </li>
              <li>
                Scroll down and select <strong>Add to Home Screen</strong> <span className="add-icon">⊞</span>.
              </li>
              <li>
                Tap <strong>Add</strong> in the top right corner.
              </li>
            </ol>
            <button className="button" style={{ width: "100%", marginTop: "16px" }} onClick={() => setShowIosGuide(false)}>
              Got it!
            </button>
          </div>
        </div>
      )}
    </>
  );
}
