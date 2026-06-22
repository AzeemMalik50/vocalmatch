'use client';

import { useEffect } from 'react';

/**
 * Bug #69 — browser extensions (MetaMask, Phantom, Coinbase Wallet, ad
 * blockers, etc.) inject scripts into every page and frequently throw
 * unhandled promise rejections of their own (e.g. MetaMask's
 * `Failed to connect to MetaMask` from `inpage.js`). The Next.js dev
 * overlay catches *all* unhandled rejections globally, including ones
 * thrown by extension code, and renders them as if the app crashed —
 * which is misleading because the app never touches MetaMask.
 *
 * This listener inspects the rejection reason + stack and silently
 * suppresses ones that clearly originate from a browser extension
 * URL. Real app errors still surface normally.
 *
 * Production builds don't show the overlay either way, but the
 * listener is harmless there — extension noise just stays out of the
 * console error stream.
 */
export default function SuppressExtensionErrors() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const looksLikeExtensionError = (reason: unknown): boolean => {
      if (!reason) return false;
      // Stringify defensively — the reason can be an Error, a string,
      // or a plain object thrown from an extension's inpage script.
      try {
        const stack =
          (reason as { stack?: string })?.stack ??
          (reason as { message?: string })?.message ??
          String(reason);
        return (
          /chrome-extension:\/\//.test(stack) ||
          /moz-extension:\/\//.test(stack) ||
          /safari-web-extension:\/\//.test(stack) ||
          // MetaMask-specific telltales — the file is named inpage.js
          // and the message reads "Failed to connect to MetaMask".
          /inpage\.js/i.test(stack) ||
          /MetaMask/i.test(stack)
        );
      } catch {
        return false;
      }
    };

    const handler = (e: PromiseRejectionEvent) => {
      if (looksLikeExtensionError(e.reason)) {
        // Prevent Next.js's overlay + the console from treating this
        // as an app error. The extension's own code is unaffected.
        e.preventDefault();
      }
    };

    window.addEventListener('unhandledrejection', handler);
    return () => window.removeEventListener('unhandledrejection', handler);
  }, []);

  return null;
}
