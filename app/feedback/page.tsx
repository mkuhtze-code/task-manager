import { redirect } from 'next/navigation';

/** Legacy path — Contact us is the standard support surface. */
export default function FeedbackRedirect() {
  redirect('/contact');
}
