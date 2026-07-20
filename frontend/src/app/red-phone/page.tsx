import { redirect } from 'next/navigation';

/**
 * The Red Phone Challenge section lives on the homepage
 * (id="red-phone-challenge"). This route is a top-level nav destination
 * per spec, so we redirect visitors straight to the anchor.
 */
export default function RedPhoneRoute() {
  redirect('/#red-phone-challenge');
}
