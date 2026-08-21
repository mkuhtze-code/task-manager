import { redirect } from 'next/navigation';

export default function PreferencesRedirect() {
  redirect('/settings');
}
